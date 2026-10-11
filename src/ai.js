'use strict';
/* ai.js v2 — provider router with: key rotation, error classification, bounded retries,
   CIRCUIT BREAKER (3 consecutive fails → open 5 min), pre-call DB budget hard-stop, usage logging.
   Attempt callbacks let handlers show REAL progress (actual attempt count — never fabricated %). */
const { config, redact } = require('./config');
const db = require('./db');

const keyRotation = new Map();
const nextKey = (p) => {
  const keys = config.PROVIDERS[p]?.keys || [];
  if (!keys.length) return null;
  const i = keyRotation.get(p) || 0;
  keyRotation.set(p, i + 1);
  return keys[i % keys.length];
};

/* circuit state: provider -> {fails, openedAt} */
const circuit = new Map();
const BREAKER = { threshold: 3, coolMs: 5 * 60 * 1000 };
function circuitOpen(p) {
  const c = circuit.get(p);
  if (!c || !c.openedAt) return false;
  if (Date.now() - c.openedAt > BREAKER.coolMs) { circuit.set(p, { fails: 0, openedAt: null }); return false; } // half-open probe
  return true;
}
function recordFail(p) {
  const c = circuit.get(p) || { fails: 0, openedAt: null };
  c.fails++;
  if (c.fails >= BREAKER.threshold) c.openedAt = Date.now();
  circuit.set(p, c);
}
const recordSuccess = p => circuit.set(p, { fails: 0, openedAt: null });
const circuitState = () => Object.fromEntries([...circuit.entries()].map(([k, v]) =>
  [k, { fails: v.fails, open: Boolean(v.openedAt) && (Date.now() - v.openedAt) <= BREAKER.coolMs }]));

/* classify errors for bounded retry decisions */
function classify(statusOrErr) {
  const s = String(statusOrErr);
  if (/429|rate/i.test(s)) return 'rate';
  if (/\b(40[13])\b|unauthor|invalid.*key|forbidden/i.test(s)) return 'auth';
  if (/\b5\d\d\b|timeout|abort|fetch|network|ECONN|socket/i.test(s)) return 'transient';
  if (/\b400\b|bad.?request|context|model/i.test(s)) return 'bad_request';
  return 'unknown';
}

/* Rough, documented ESTIMATES (labeled everywhere) */
const EST_USD_PER_1K = { in: 0.0002, out: 0.0006 };
const estCost = (pt = 0, ct = 0) => +((pt * EST_USD_PER_1K.in + ct * EST_USD_PER_1K.out) / 1000).toFixed(6);

async function budgetCheck(tgId) {
  const today = new Date().toISOString().slice(0, 10);
  const userRow = await db.q(`select coalesce(sum(est_cost_usd),0) usd from ai_usage where created_at::date = $1 and tg_id = $2`, [today, tgId ?? 0]);
  const global = (await db.q(`select coalesce(sum(est_cost_usd),0) usd from ai_usage where created_at::date = $1`, [today]))[0].usd;
  const caps = Object.fromEntries((await db.q(`select key, limit_usd, enabled from ai_budget`)).map(r => [r.key, r]));
  const spentUser = Number(userRow[0]?.usd || 0), spentGlobal = Number(global || 0);
  if (caps.daily_global?.enabled && spentGlobal >= Number(caps.daily_global.limit_usd))
    return { ok: false, why: `global daily AI cap reached ($${caps.daily_global.limit_usd})` };
  if (tgId && caps.daily_user?.enabled && spentUser >= Number(caps.daily_user.limit_usd))
    return { ok: false, why: `your daily AI cap reached ($${caps.daily_user.limit_usd})` };
  return { ok: true, spentUser, spentGlobal };
}

/* chat(messages, {purpose, tgId, maxTokens, onAttempt(p, attemptNo, total)}) */
async function chat(messages, { purpose = 'general', tgId = null, maxTokens = 700, onAttempt } = {}) {
  const budget = await budgetCheck(tgId);
  if (!budget.ok) { const e = new Error(budget.why); e.budget = true; throw e; }

  const order = config.AI_ORDER.filter(p => (config.PROVIDERS[p]?.keys || []).length && !circuitOpen(p));
  const skipped = config.AI_ORDER.filter(p => (config.PROVIDERS[p]?.keys || []).length && circuitOpen(p));
  if (!order.length) throw new Error(`All AI providers unavailable (circuit${skipped.length ? 's open: ' + skipped.join(',') : ''} or none configured)`);

  const total = order.length;
  const errors = [];
  let attemptNo = 0;
  for (const p of order) {
    const prov = config.PROVIDERS[p];
    for (const model of prov.models.slice(0, 2)) {
      attemptNo++;
      if (onAttempt) { try { onAttempt(p, attemptNo, total); } catch { /* progress must not break work */ } }
      const key = nextKey(p);
      if (!key) continue;
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), config.AI_TIMEOUT_MS);
      try {
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` };
        if (p === 'openrouter') { headers['HTTP-Referer'] = 'https://teles-ads.local'; headers['X-Title'] = 'TelesAdsControl'; }
        const res = await fetch(prov.base, {
          method: 'POST', headers, signal: ctl.signal,
          body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.7 })
        });
        const j = await res.json().catch(() => ({}));
        const text = j.choices?.[0]?.message?.content;
        if (!res.ok || !text) {
          const kind = classify(String(res.status) + ' ' + String(j.error?.message || '').slice(0, 80));
          errors.push(`${p}/${model}: HTTP ${res.status} [${kind}] ${redact(String(j.error?.message || '').slice(0, 90))}`);
          if (kind === 'auth' || kind === 'rate') { recordFail(p); break; } // key/model dead → next provider, mark breaker
          continue; // bad_request → try next model on same provider (no breaker)
        }
        recordSuccess(p);
        const usage = j.usage || {};
        await db.q(`insert into ai_usage(tg_id,provider,model,purpose,prompt_tokens,completion_tokens,est_cost_usd)
                    values ($1,$2,$3,$4,$5,$6,$7)`,
          [tgId, p, model, purpose, usage.prompt_tokens || 0, usage.completion_tokens || 0, estCost(usage.prompt_tokens, usage.completion_tokens)]);
        return { text, meta: { provider: p, model, est_cost_usd: estCost(usage.prompt_tokens, usage.completion_tokens), attempts: attemptNo, skipped_providers: skipped } };
      } catch (e) {
        const kind = classify(e.name === 'AbortError' ? 'timeout' : e.message);
        errors.push(`${p}/${model}: [${kind}] ${redact(e.message)}`);
        if (kind === 'transient' || kind === 'rate') recordFail(p);
      } finally { clearTimeout(t); }
    }
  }
  throw new Error(`All AI providers failed — ${errors.slice(0, 3).join(' | ')}`);
}

module.exports = { chat, budgetCheck, estCost, circuitState, classify, BREAKER, _internals: { circuit, recordFail, recordSuccess, nextKey } };
