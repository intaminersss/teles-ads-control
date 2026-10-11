'use strict';
/* handlers/admin.js — health, about (capability matrix), audit tail. */
const db = require('../db');
const tg = require('../tg');
const adsapi = require('../adsapi');
const fmt = require('../format');

async function health(ctx) {
  const dbOk = await db.healthy();
  let ads = 'n/a', bal = '—';
  if (require('../config').config.ADS_API_TOKEN) {
    try { const a = await adsapi.getCurrentAccount(); ads = 'ok'; bal = `${a.remaining_budget} TON`; }
    catch (e) { ads = `error: ${fmt.esc(e.code || e.message).slice(0, 60)}`; }
  }
  const upS = Math.floor(process.uptime());
  await ctx.editOrSend([
    '🩺 <b>HEALTH</b>',
    `Bot: 🟢 running · uptime ${Math.floor(upS / 3600)}h ${Math.floor((upS % 3600) / 60)}m`,
    `Mode: <b>polling</b> (webhook disabled by spec) · last update: ${tg.stats().lastUpdateAt ? new Date(tg.stats().lastUpdateAt).toISOString().slice(11, 19) + ' UTC' : '—'}`,
    `Database: ${dbOk ? '🟢 connected' : '🔴 down'}`,
    `Telegram Ads API: ${ads === 'ok' ? '🟢' : ads === 'n/a' ? '⚪ not configured' : '🔴'} ${ads === 'ok' ? `· balance ${bal}` : ads !== 'n/a' ? `· ${ads}` : ''}`,
    `Memory: ${Math.round(process.memoryUsage().rss / 1e6)} MB RSS`
  ].join('\n'), fmt.kb([[{ t: '🔄 Re-check', c: 'menu:health' }], [{ t: '⬅️ Menu', c: 'menu:main' }]]));
}

const MATRIX = [
  ['📊 Live ads board (list/detail/metrics)', 'VERIFIED — official API'],
  ['⏸️ Pause / ▶️ resume ads', 'VERIFIED — official API'],
  ['🗑️ Delete ad (refund to balance)', 'VERIFIED — official API'],
  ['📅 Daily cap edit', 'VERIFIED — official API'],
  ['🚀 Ad creation from drafts', 'VERIFIED — official API (review queue applies)'],
  ['💰 Balance & spend', 'VERIFIED — official API'],
  ['🔬 Channel research', 'WORKING — tgadsspy archive (observed ad data, NOT demographics)'],
  ['✍️ AI copy drafting', 'WORKING — multi-provider, estimates only'],
  ['📈 Join/conversion attribution', 'PARTIAL — joins counter only, no funnel attribution'],
  ['👥 Audience demographics/reach forecasts', 'UNSUPPORTED — platform does not expose'],
  ['🖥️ Web dashboard', 'NOT INCLUDED — Telegram-native by design']
];

async function about(ctx) {
  await ctx.editOrSend([
    'ℹ️ <b>TELES ADS CONTROL</b> — Telegram-native advertising assistant',
    '',
    '<b>CAPABILITY MATRIX</b>',
    ...MATRIX.map(([f, s]) => `• ${f} — <b>${fmt.esc(s)}</b>`),
    '',
    '<i>Cost/members figures are estimates: TON→INR uses fixed FX assumptions. AI outputs are recommendations, not performance guarantees.</i>'
  ].join('\n'), fmt.kb([[{ t: '⬅️ Menu', c: 'menu:main' }]]));
}

async function auditTail(ctx) {
  const rows = await db.q(`select created_at, action, result from audit_log order by id desc limit 15`);
  await ctx.editOrSend(
    ['🧾 <b>AUDIT TAIL (last 15)</b>',
     ...rows.map(r => `• ${r.created_at.toISOString().slice(5, 16)} — ${fmt.esc(r.action)} — ${fmt.esc(r.result || '')}`),
     rows.length ? '' : '(empty)'].join('\n'),
    fmt.kb([[{ t: '⬅️ Menu', c: 'menu:main' }]]));
}

module.exports = { health, about, auditTail };
