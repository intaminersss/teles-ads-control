'use strict';
/* handlers/livealerts.js — #56 LIVE NOTIFICATION SYSTEM (owner-requested).
   Per-campaign (per-ad) alerts, every 5-min scheduler tick:
   • 🎯 every 1,000-views milestone  → "which ad" clearly named
   • 🚪 every join                   → ad # + title + total
   • 💸 every 0.5 TON spend cut      → ad # + total spent (sub-0.5 aggregates; platform settles in steps)
   Management: GLOBAL default toggle + PER-AD rules (sirf 1 campaign ke liye bhi on kar sakte ho).
   No platform push exists — this is honest delta-polling via official getAdsById (5-min). */

const db = require('../db');
const tg = require('../tg');
const adsapi = require('../adsapi');
const fmt = require('../format');
const guard = require('../guard');

const GLOBAL_KEY = 'live_alerts_default';

/* ---------- settings helpers (agency_settings) ---------- */
const getSetting = async (key, dflt = null) => (await db.q(`select value from agency_settings where key=$1`, [key]))?.[0]?.value ?? dflt;
const setSetting = async (key, value) => { await db.q(`insert into agency_settings(key,value) values ($1,$2) on conflict (key) do update set value=excluded.value`, [key, String(value)]); };

async function globalDefault() { return (await getSetting(GLOBAL_KEY, 'off')) === 'on'; }

/* ---------- management screens ---------- */
async function hub(ctx) {
  const rules = (await db.q(`select * from ad_alerts_rules order by ad_id`)) || [];
  const g = await globalDefault();
  const lines = [
    fmt.header('🔔', 'LIVE ALERTS — PER CAMPAIGN'),
    '',
    `Global default for NEW/any ad: <b>${g ? 'ON' : 'OFF'}</b>`,
    rules.length ? `\n<b>Per-ad rules</b> (${rules.length}):` : '',
    ...rules.slice(0, 10).map(r => `#${r.ad_id}: ${[r.per_1k && '1k views', r.per_join && 'joins', r.per_spend && 'spend'].filter(Boolean).join(' · ') || 'all off'}`)
  ].filter(Boolean);
  return ctx.editOrSend(lines.join('\n'), fmt.kb([
    [{ t: `🌐 Global default: ${g ? 'ON → turn OFF' : 'OFF → turn ON'}`, c: 'alr2:global', style: g ? 'danger' : 'success' }],
    [{ t: '🎯 Set rules for one ad', c: 'alr2:pick' }],
    [{ t: '🧹 Clear all per-ad rules', c: 'alr2:clear' }],
    [{ t: '⬅️ Menu', c: 'menu:main' }]
  ]));
}

async function pickAd(ctx) {
  const list = (await adsapi.getAdsList()) || [];
  const rows = list.slice(0, 8).map(a => [{ t: `#${a.ad_id} ${fmt.pill(a.status)}`, c: `alr2:ad:${a.ad_id}` }]);
  if (!rows.length) return ctx.editOrSend('❌ No ads found.', fmt.kb([[{ t: '⬅️ Alerts', c: 'alr2:hub' }]]));
  return ctx.editOrSend('🔔 <b>Which campaign (ad) do you want live alerts for?</b>', fmt.kb([...rows, [{ t: '⬅️ Alerts', c: 'alr2:hub' }]]));
}

async function adRules(ctx, adId) {
  const r = (await db.q(`select * from ad_alerts_rules where ad_id=$1`, [adId]))?.[0]
    || { ad_id: adId, per_1k: await globalDefault(), per_join: await globalDefault(), per_spend: await globalDefault() };
  return ctx.editOrSend(`🔔 <b>LIVE ALERTS — Ad #${adId}</b>\n<i>Har event me clearly likha aayega: kaunsa ad, kya hua.</i>`, fmt.kb([
    [{ t: `${r.per_1k ? '✅' : '⛔'} Every 1,000 views`, c: `alr2:tgl:${adId}:1k:${r.per_1k ? 'off' : 'on'}` }],
    [{ t: `${r.per_join ? '✅' : '⛔'} Every join`, c: `alr2:tgl:${adId}:join:${r.per_join ? 'off' : 'on'}` }],
    [{ t: `${r.per_spend ? '✅' : '⛔'} Every 0.5 TON spend`, c: `alr2:tgl:${adId}:spend:${r.per_spend ? 'off' : 'on'}` }],
    [{ t: '🎯 Another ad', c: 'alr2:pick' }], [{ t: '⬅️ Alerts', c: 'alr2:hub' }]
  ]));
}

async function toggleRule(ctx, adId, kind, on) {
  await db.q(`insert into ad_alerts_rules(ad_id, per_1k, per_join, per_spend, updated_at)
              values ($1,$2,$3,$4,now())
              on conflict (ad_id) do update set updated_at=now()`, [adId, false, false, false]);
  const col = kind === '1k' ? 'per_1k' : kind === 'join' ? 'per_join' : 'per_spend';
  await db.q(`update ad_alerts_rules set ${col}=$2, updated_at=now() where ad_id=$1`, [adId, on === 'on']);
  if (on === 'on') await db.q(`insert into ad_alerts_state(ad_id) values ($1) on conflict (ad_id) do nothing`, [adId]);
  await guard.audit(ctx.from.id, 'livealerts.toggle', { adId, kind, on }, 'ok');
  return adRules(ctx, Number(adId));
}

/* ---------- engine (scheduler tick): delta-poll → notify ---------- */
let lastRun = 0;
async function engine(log) {
  const rules = (await db.q(`select * from ad_alerts_rules where per_1k or per_join or per_spend`)) || [];
  if (!rules.length) return 0;
  const ids = rules.map(r => r.ad_id);
  const live = await adsapi.getAdsById(ids).catch(() => []);
  let sent = 0;
  for (const a of live) {
    const rule = rules.find(r => Number(r.ad_id) === Number(a.ad_id));
    if (!rule) continue;
    const st = (await db.q(`select * from ad_alerts_state where ad_id=$1`, [a.ad_id]))?.[0]
      || { last_views_1k: Math.floor((a.views || 0) / 1000), last_joins: a.joins || 0, last_spent_half: Math.floor((a.spent_budget || 0) / 0.5) };
    const msgs = [];
    const views = a.views || 0, joins = a.joins || 0, spent = +(a.spent_budget || 0);
    const vk = Math.floor(views / 1000), sh = Math.floor(spent / 0.5);
    if (rule.per_1k && vk > (st.last_views_1k || 0)) msgs.push(`🎯 <b>Ad #${a.ad_id}</b> ${a.title ? `“${fmt.esc(String(a.title).slice(0, 30))}” ` : ''}crossed <b>${vk},000 views</b> (+${views - (st.last_views_1k || 0) * 1000})`);
    if (rule.per_join && joins > (st.last_joins || 0)) msgs.push(`🚪 <b>Ad #${a.ad_id}</b> ${a.title ? `“${fmt.esc(String(a.title).slice(0, 30))}” ` : ''}got <b>+${joins - (st.last_joins || 0)} join(s)</b> — total ${joins}`);
    if (rule.per_spend && sh > (st.last_spent_half || 0)) msgs.push(`💸 <b>Ad #${a.ad_id}</b> spend cut: <b>+${(spent - (st.last_spent_half || 0) * 0.5).toFixed(2)} TON</b> — total ${spent.toFixed(2)} TON`);
    if (msgs.length) {
      await tg.sm(Number(process.env.ALLOWED_USER_IDS?.split(',')[0] || 7049127887), `🔔 <b>LIVE</b>\n${msgs.join('\n')}`).catch(() => {});
      sent += msgs.length;
    }
    await db.q(`insert into ad_alerts_state(ad_id,last_views_1k,last_joins,last_spent_half,updated_at)
                values ($1,$2,$3,$4,now())
                on conflict (ad_id) do update set last_views_1k=$2,last_joins=$3,last_spent_half=$4,updated_at=now()`,
      [a.ad_id, vk, joins, sh]);
  }
  return sent;
}

async function onCb(ctx, action, a, b, c) {
  if (action === 'hub') return hub(ctx);
  if (action === 'pick') return pickAd(ctx);
  if (action === 'ad') return adRules(ctx, Number(a));
  if (action === 'tgl') return toggleRule(ctx, Number(a), b, c);
  if (action === 'global') { const g = await globalDefault(); await setSetting(GLOBAL_KEY, g ? 'off' : 'on'); await guard.audit(ctx.from.id, 'livealerts.global', { to: !g }, 'ok'); return hub(ctx); }
  if (action === 'clear') { await db.q(`delete from ad_alerts_rules`); return hub(ctx); }
  return hub(ctx);
}

module.exports = { hub, onCb, engine, getSetting, setSetting, globalDefault };
