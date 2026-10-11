'use strict';
/* Unit tests — pure logic only (no network). node --test */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

process.env.TELEGRAM_BOT_TOKEN = '111111111:test-token';
process.env.SUPABASE_DB_URL = 'postgresql://localhost:1/x'; // Pool created lazily; no connection at require
process.env.ALLOWED_USER_IDS = '7049127887';

const root = path.join(__dirname, '..');

test('config: redact() hides secrets', () => {
  const { redact } = require('../src/config');
  const out = redact('key gsk_abcdef123456 end bot 12345678:AAAAxYzverylongtokenvalue123456789012x or sk-or-v1-abcdef0123456789abcdef00');
  assert.ok(!out.includes('AAAAxYzverylongtokenvalue'), 'bot token leaked');
  assert.ok(!out.includes('gsk_abcdef123456'), 'groq key leaked');
  assert.ok(out.includes('***'));
});

test('format: esc()', () => {
  const fmt = require('../src/format');
  assert.strictEqual(fmt.esc('<b>&'), '&lt;b&gt;&amp;');
});

test('format: adsBoard computes join-rate', () => {
  const fmt = require('../src/format');
  const board = fmt.adsBoard([
    { ad_id: 79, status: 'active', views: 10, clicks: 2, joins: 1, spent_budget: 0.1 },
    { ad_id: 65, status: 'on_hold', views: 5, clicks: 0, joins: 0, spent_budget: 0 }
  ]);
  assert.ok(board.includes('#79') && board.includes('JR 50.0%'), board);
  assert.ok(board.includes('Σ'), 'totals row');
});

test('format: toCsv escapes properly', () => {
  const fmt = require('../src/format');
  assert.strictEqual(fmt.toCsv([{ a: 'x,y', b: 'q"z' }]), 'a,b\n"x,y","q""z"');
});

test('format: MENU keyboard callback_data sanitized', () => {
  const fmt = require('../src/format');
  for (const row of fmt.MENU.inline_keyboard) for (const b of row) assert.ok(b.text && /^[a-z:_0-9]+$/i.test(b.callback_data), JSON.stringify(b));
});

test('adsapi: known platform errors documented in help map', () => {
  const src = fs.readFileSync(path.join(root, 'src/adsapi.js'), 'utf8');
  for (const code of ['AD_RESULT_BUDGET_TOO_SMALL', 'AD_IS_ACTIVE', 'CHANNEL_TOO_SMALL', 'JOINCHAT_NOT_MEMBER', 'AD_NOT_FOUND'])
    assert.ok(src.includes(code), `missing ${code}`);
});

test('ai: estCost matches documented estimate constants', () => {
  const ai = require('../src/ai');
  const EST = { in: 0.0002, out: 0.0006 };
  assert.strictEqual(ai.estCost(100, 50), +((100 * EST.in + 50 * EST.out) / 1000).toFixed(6));
  assert.strictEqual(ai.estCost(0, 0), 0);
});

test('spyapi: key rotation logic present', () => {
  const src = fs.readFileSync(path.join(root, 'src/spyapi.js'), 'utf8');
  assert.ok(src.includes('keyIdx %'), 'rotation present');
  assert.ok(src.includes('X-Api-Key'), 'auth header present');
});

test('guard: confirmation TTL + idempotency window', () => {
  const guard = require('../src/guard');
  guard.askConfirm('k1', { x: 1 });
  assert.strictEqual(guard.takeConfirm('k1').x, 1);
  assert.strictEqual(guard.takeConfirm('k1'), null, 'one-shot');
  assert.strictEqual(guard.alreadyDone('op1'), false);
  assert.strictEqual(guard.alreadyDone('op1'), true, 'duplicate blocked');
});

test('guard: isAllowed uses configured ids', () => {
  const guard = require('../src/guard');
  assert.strictEqual(guard.isAllowed(7049127887), true);
  assert.strictEqual(guard.isAllowed(42), false);
});

test('schema.sql defines all core tables', () => {
  const sql = fs.readFileSync(path.join(root, 'schema.sql'), 'utf8');
  for (const t of ['users', 'settings', 'ads_snapshot', 'channels', 'research_lists', 'research_list_items', 'drafts', 'ai_usage', 'ai_budget', 'alerts', 'audit_log', 'jobs'])
    assert.ok(sql.includes(`create table if not exists ${t} `), `missing table ${t}`);
});

test('SECURITY: no secret-like strings anywhere in repo', () => {
  const bad = /gsk_[A-Za-z0-9_\-]{20,}|sk-or-v1-[a-f0-9]{20,}|nvapi-[\w-]{20,}|sbp_[a-f0-9]{20,}|tgs_[a-f0-9]{20,}|\b\d{8,10}:AA[\w-]{30,}/;
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? (['node_modules', '.git', 'test'].includes(e.name) ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
  const offenders = walk(root).filter(f => /\.(js|json|md|sql|example)$|\.env\.example$/i.test(f))
    .filter(f => { try { return bad.test(fs.readFileSync(f, 'utf8')); } catch { return false; } });
  assert.deepStrictEqual(offenders, [], `secret-like strings in: ${offenders}`);
});

test('SPEC: webhook never used', () => {
  const src = ['src/index.js', 'src/tg.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('');
  assert.ok(!/setWebhook/.test(src), 'setWebhook must not appear');
  assert.ok(src.includes('polling'));
});
