'use strict';
/* Guard — authorization, rate limiting, confirmation flows, idempotency, audit. */
const db = require('./db');
const { config } = require('./config');

const isAllowed = tgId => config.ALLOWED_USER_IDS.includes(Number(tgId));

/* per-user sliding-window rate limit (default 20 actions / 60s) */
const hits = new Map();
function rateLimited(tgId, max = 20, winMs = 60000) {
  const now = Date.now();
  const arr = (hits.get(tgId) || []).filter(t => now - t < winMs);
  arr.push(now);
  hits.set(tgId, arr);
  return arr.length > max;
}

/* one-shot confirmations: key -> {expires, payload} */
const pending = new Map();
const CONFIRM_TTL = 5 * 60 * 1000;
function askConfirm(key, payload) { pending.set(key, { payload, expires: Date.now() + CONFIRM_TTL }); }
function takeConfirm(key) {
  const p = pending.get(key);
  if (!p || p.expires < Date.now()) { pending.delete(key); return null; }
  pending.delete(key);
  return p.payload;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of pending) if (v.expires < now) pending.delete(k); }, 60000).unref();

/* idempotency for consequential actions (same key within 10 min -> blocked) */
const done = new Map();
function alreadyDone(key) {
  const t = done.get(key);
  if (t && Date.now() - t < 10 * 60 * 1000) return true;
  done.set(key, Date.now());
  return false;
}
setInterval(() => { const now = Date.now(); for (const [k, t] of done) if (now - t > 10 * 60 * 1000) done.delete(k); }, 300000).unref();

async function audit(tgId, action, payload, result) {
  try { await db.q(`insert into audit_log(tg_id,action,payload,result) values ($1,$2,$3,$4)`,
    [tgId, action, payload ? JSON.stringify(payload).slice(0, 1500) : null, String(result).slice(0, 500)]); }
  catch { /* audit must never break the flow */ }
}

async function upsertUser(from) {
  if (!from) return;
  await db.q(`insert into users(tg_id,username,name,last_seen_at) values ($1,$2,$3,now())
              on conflict (tg_id) do update set username=$2, name=$3, last_seen_at=now()`,
    [from.id, from.username || null, [from.first_name, from.last_name].filter(Boolean).join(' ') || null]);
}

module.exports = { isAllowed, rateLimited, askConfirm, takeConfirm, alreadyDone, audit, upsertUser };
