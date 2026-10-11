'use strict';
/* AI provider router — rotation keys, fallback order, DB-enforced budget stops, usage logging.
   Budget rule: requests are BLOCKED before spending if daily user/global caps are exceeded. */
const { config, redact } = require('./config');
const db = require('./db');

const keyRotation = new Map(); // provider -> idx
const nextKey = (p) => {
  const keys = config.PROVIDERS[p]?.keys || [];
  if (!keys.length) return null;
  const i = keyRotation.get(p) || 0;
  keyRotation.set(p, i + 1);
  return keys[i % keys.length];
};

/* Rough, documented ESTIMATES (provider exact billing may differ; labeled as estimate everywhere). */
const EST_USD_PER_1K = { in: 0.0002, out: 0.0006 };
const estCost = (pt = 0, ct = 0) => +( (pt * EST_USD_PER_1K.in + ct * EST_USD_PER_1K.out) / 1000 ).toFixed(6);

async function budgetCheck(tgId) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.q(
    `select coalesce(sum(est_cost_usd),0) usd from ai_usage where created_at::date = $1` +
    (tgId ? ` and ($2::bigint is null or tg_id = $2)` : ''), [today, tgId ?? null]);
  const global = (await db.q(`select coalesce(sum(est_cost_usd),0) usd from ai_usage where created_at::date = $1`, [today]))[0].usd;
  const caps = Object.fromEntries((await db.q(`select key, limit_usd, enabled from ai_budget`)).map(r => [r.key, r]));
  const spentUser = Number(rows[0]?.usd || 0), spentGlobal = Number(global || 0);
  if (caps.daily_global?.enabled && spentGlobal >= Number(caps.daily_global.limit_usd))
    return { ok: false, why: `global daily AI cap reached ($${caps.daily_global.limit_usd})` };
  if (tgId && caps.daily_user?.enabled && spentUser >= Number(caps.daily_user.limit_usd))
    return { ok: false, why: `your daily AI cap reached ($${caps.daily_user.limit_usd})` };
  return { ok: true, spentUser, spentGlobal };
}

/* chat(messages, {purpose, tgId, maxTokens}) -> {text, meta} | throws {budget:true} on cap */
async function chat(messages, { purpose = 'general', tgId = null, maxTokens = 700 } = {}) {
  const budget = await budgetCheck(tgId);
  if (!budget.ok) { const e = new Error(budget.why); e.budget = true; throw e; }

  const order = config.AI_ORDER.filter(p => (config.PROVIDERS[p]?.keys || []).length);
  if (!order.length) throw new Error('No AI providers configured');

  const errors = [];
  for (const p of order) {
    const prov = config.PROVIDERS[p];
    for (const model of prov.models.slice(0, 2)) {
      const key = nextKey(p);
      if (!key) continue;
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), config.AI_TIMEOUT_MS);
      try {
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` };
        if (p === 'openrouter') headers['HTTP-Referer'] = 'https://teles-ads.local', headers['X-Title'] = 'TelesAdsControl';
        const res = await fetch(prov.base, {
          method: 'POST', headers, signal: ctl.signal,
          body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.7 })
        });
        const j = await res.json().catch(() => ({}));
        const text = j.choices?.[0]?.message?.content;
        if (!res.ok || !text) { errors.push(`${p}/${model}: HTTP ${res.status} ${redact(JSON.stringify(j).slice(0, 120))}`); continue; }
        const usage = j.usage || {};
        await db.q(`insert into ai_usage(tg_id,provider,model,purpose,prompt_tokens,completion_tokens,est_cost_usd)
                    values ($1,$2,$3,$4,$5,$6,$7)`,
          [tgId, p, model, purpose, usage.prompt_tokens || 0, usage.completion_tokens || 0,
           estCost(usage.prompt_tokens, usage.completion_tokens)]);
        return { text, meta: { provider: p, model, est_cost_usd: estCost(usage.prompt_tokens, usage.completion_tokens) } };
      } catch (e) { errors.push(`${p}/${model}: ${redact(e.message)}`); }
      finally { clearTimeout(t); }
    }
  }
  throw new Error(`All AI providers failed — ${errors.slice(0, 3).join(' | ')}`);
}

module.exports = { chat, budgetCheck, estCost };
