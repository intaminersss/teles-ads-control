'use strict';
/* failure.test.js — spec §13 matrix: provider 429, invalid key, full outage, budget HARD STOP,
   cooldown recovery, malformed responses, empty content, DB-down, duplicate launches, redaction.
   Provider calls are MOCKED at fetch level (clearly labeled); budget/db via in-memory stub. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

process.env.TELEGRAM_BOT_TOKEN = '111111111:test-token';
process.env.SUPABASE_DB_URL = 'postgresql://localhost:1/x';
process.env.ALLOWED_USER_IDS = '7049127887';

const dbPath = require.resolve('../src/db');
const realFetch = global.fetch;

/* in-memory db stub with SPEND ACCOUNTING (budget checks must behave like real SQL) */
function stubDb() {
  const usage = [];
  const caps = { daily_user: { limit_usd: 0.000001, enabled: true }, daily_global: { limit_usd: 1000, enabled: true } };
  const mod = { q: async (sql, params = []) => {
      if (/insert into ai_usage/.test(sql)) { usage.push({ usd: Number(params[6] || 0) }); return []; }
      if (/select coalesce\(sum\(est_cost_usd\),0\) usd from ai_usage where created_at::date = \$1 and tg_id/.test(sql)) {
        return [{ usd: usage.reduce((s, u) => s + u.usd, 0) }];
      }
      if (/select coalesce\(sum\(est_cost_usd\),0\) usd from ai_usage where created_at::date = \$1$/.test(sql.replace(/\s+/g, ' '))) {
        return [{ usd: usage.reduce((s, u) => s + u.usd, 0) }];
      }
      if (/from ai_budget/.test(sql)) return Object.entries(caps).map(([key, v]) => ({ key, ...v }));
      return [];
    },
    one: async () => null,
    tx: async fn => fn({ query: async () => ({ rows: [] }) }),
    healthy: async () => true,
    pool: {}, _usage: usage, _caps: caps };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mod };
  return mod;
}

function loadAiFresh() {
  delete require.cache[require.resolve('../src/ai')];
  return require('../src/ai');
}

function mockFetchOnce(responder) {
  global.fetch = async (url, opts) => responder(url, opts);
}
const restore = () => { global.fetch = realFetch; };

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers });

test('FAIL-A: 429 Retry-After → bounded same-provider retry (succeeds), and persistent 429 falls through', async () => {
  const db = stubDb();
  const cfg = require('../src/config').config;
  cfg.AI_ORDER = ['flaky', 'solid'];
  cfg.PROVIDERS.flaky = { keys: ['k1'], models: ['m1'], base: 'https://flaky.test/v1' };
  cfg.PROVIDERS.solid = { keys: ['k2'], models: ['m2'], base: 'https://solid.test/v1' };
  const ai = loadAiFresh();
  // Scenario 1: 429 once → retry once → success (no provider switch needed)
  let flakyCalls = 0;
  mockFetchOnce((url) => {
    if (/flaky/.test(String(url))) { flakyCalls++; return flakyCalls === 1
      ? json(429, { error: { message: 'Too Many Requests' } }, { 'retry-after': '0' })
      : json(200, { choices: [{ message: { content: 'OK-AFTER-RETRY' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }); }
    return json(200, { choices: [{ message: { content: 'NOPE' } }], usage: {} });
  });
  const r1 = await ai.chat([{ role: 'user', content: 'x' }], { purpose: 't' });
  assert.strictEqual(r1.text, 'OK-AFTER-RETRY', 'Retry-After honored, bounded retry succeeded');
  assert.strictEqual(flakyCalls, 2, `exactly 2 calls (1 retry): ${flakyCalls}`);
  // Scenario 2: persistent 429 → falls through to next provider
  mockFetchOnce((url) => {
    if (/flaky/.test(String(url))) return json(429, { error: { message: 'Too Many Requests' } }, { 'retry-after': '0' });
    return json(200, { choices: [{ message: { content: 'FROM-SOLID' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
  });
  const r2 = await ai.chat([{ role: 'user', content: 'x' }], { purpose: 't' });
  assert.strictEqual(r2.meta.provider, 'solid', 'persistent 429 → next provider');
  restore();
});

test('FAIL-B: invalid API key (401 auth) → breaker records, no retry on same provider', async () => {
  stubDb();
  let calls = 0;
  mockFetchOnce(() => { calls++; return json(401, { error: { message: 'Invalid API Key' } }); });
  const cfg = require('../src/config').config;
  cfg.AI_ORDER = ['authbad'];
  cfg.PROVIDERS.authbad = { keys: ['k'], models: ['m'], base: 'https://authbad.test/v1' };
  const ai = loadAiFresh();
  await assert.rejects(() => ai.chat([{ role: 'user', content: 'x' }], { purpose: 't' }), /All AI providers failed/);
  assert.strictEqual(ai.circuitState().authbad.fails >= 1, true, 'failure recorded');
  assert.strictEqual(calls, 1, `no same-provider retry on auth: calls=${calls}`);
  restore();
});

test('FAIL-C: ALL providers down → clean aggregated error (no crash)', async () => {
  stubDb();
  mockFetchOnce(() => json(503, { error: { message: 'outage' } }));
  const cfg = require('../src/config').config;
  cfg.AI_ORDER = ['down1', 'down2'];
  cfg.PROVIDERS.down1 = { keys: ['k'], models: ['m'], base: 'https://d1.test/v1' };
  cfg.PROVIDERS.down2 = { keys: ['k'], models: ['m'], base: 'https://d2.test/v1' };
  const ai = loadAiFresh();
  await assert.rejects(() => ai.chat([{ role: 'user', content: 'x' }], { purpose: 't' }),
    e => /All AI providers failed/.test(e.message));
  restore();
});

test('FAIL-D: budget limit is a HARD STOP — zero network calls when over cap', async () => {
  const db = stubDb();
  db._usage.push({ usd: 1.0 }); // user already "spent" $1 — over $0.000001 cap
  let networkCalls = 0;
  mockFetchOnce(() => { networkCalls++; return json(200, { choices: [{ message: { content: 'SHOULD NOT HAPPEN' } }] }); });
  const cfg = require('../src/config').config;
  cfg.AI_ORDER = ['budgeted'];
  cfg.PROVIDERS.budgeted = { keys: ['k'], models: ['m'], base: 'https://b.test/v1' };
  const ai = loadAiFresh();
  await assert.rejects(() => ai.chat([{ role: 'user', content: 'x' }], { purpose: 't', tgId: 42 }),
    e => e.budget === true && /cap reached/.test(e.message));
  assert.strictEqual(networkCalls, 0, 'BLOCKED before network — budget enforced, not displayed');
  restore();
});

test('FAIL-E: cooldown recovery — breaker half-opens after coolMs and succeeds again', async () => {
  stubDb();
  const cfg = require('../src/config').config;
  cfg.AI_ORDER = ['heal'];
  cfg.PROVIDERS.heal = { keys: ['k'], models: ['m'], base: 'https://h.test/v1' };
  const ai = loadAiFresh();
  const { _internals } = ai;
  for (let i = 0; i < ai.BREAKER.threshold; i++) _internals.recordFail('heal');
  assert.strictEqual(ai.circuitState().heal.open, true);
  _internals.circuit.get('heal').openedAt = Date.now() - ai.BREAKER.coolMs - 1; // time passes
  mockFetchOnce(() => json(200, { choices: [{ message: { content: 'HEALED' } }], usage: {} }));
  const r = await ai.chat([{ role: 'user', content: 'x' }], { purpose: 't' });
  assert.strictEqual(r.text, 'HEALED', 'recovered after cooldown');
  assert.strictEqual(ai.circuitState().heal.open, false);
  restore();
});

test('FAIL-F: malformed provider payload (no choices) → classified, no crash, moves on', async () => {
  stubDb();
  let n = 0;
  mockFetchOnce((url) => { n++; if (/mal/.test(String(url))) return json(200, { weird: true }); return json(200, { choices: [{ message: { content: 'GOOD' } }], usage: {} }); });
  const cfg = require('../src/config').config;
  cfg.AI_ORDER = ['mal', 'ok'];
  cfg.PROVIDERS.mal = { keys: ['k'], models: ['m'], base: 'https://mal.test/v1' };
  cfg.PROVIDERS.ok = { keys: ['k'], models: ['m'], base: 'https://ok.test/v1' };
  const ai = loadAiFresh();
  const r = await ai.chat([{ role: 'user', content: 'x' }], { purpose: 't' });
  assert.strictEqual(r.text, 'GOOD');
  assert.strictEqual(r.meta.attempts, 2);
  restore();
});

test('FAIL-G: DB down during budget check → clean error, no network call', async () => {
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    q: async () => { throw new Error('ECONNREFUSED'); }, one: async () => null, tx: async () => {}, healthy: async () => false, pool: {} } };
  let net = 0;
  mockFetchOnce(() => { net++; return json(200, { choices: [{ message: { content: 'X' } }] }); });
  const cfg = require('../src/config').config;
  cfg.AI_ORDER = ['dbtest'];
  cfg.PROVIDERS.dbtest = { keys: ['k'], models: ['m'], base: 'https://dbt.test/v1' };
  const ai = loadAiFresh();
  await assert.rejects(() => ai.chat([{ role: 'user', content: 'x' }], { purpose: 't' }), /ECONNREFUSED/);
  assert.strictEqual(net, 0, 'fail-closed on budget-check failure');
  restore();
});

test('FAIL-H: duplicate launch blocked by idempotency (guard)', async () => {
  const { alreadyDone } = require('../src/guard');
  const key = `launch-test-${Date.now()}`;
  assert.strictEqual(alreadyDone(key), false);
  assert.strictEqual(alreadyDone(key), true, 'second call blocked');
});

test('FAIL-I: redaction — secrets never appear in logged strings', () => {
  const { redact } = require('../src/config');
  const secrets = ['gsk_abcdefghij1234567890', 'sk-or-v1-abcdef0123456789abcdef0123456789', 'nvapi-abcdefgh123456789', '1234567890:AAAAAAAAAAbbbbbbbbbbCCCCCCCCCCddddd'];
  const out = redact(`log line with ${secrets.join(' and ')}`);
  for (const s of secrets) assert.ok(!out.includes(s), `leaked: ${s}`);
});
