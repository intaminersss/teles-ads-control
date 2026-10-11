'use strict';
/* handlers/alerts.js — daily digest + balance alert configuration. */
const db = require('../db');
const fmt = require('../format');

async function alertsMenu(ctx) {
  const rows = await db.q(`select * from alerts where tg_id=$1 order by id`, [ctx.from.id]);
  const digest = rows.find(r => r.kind === 'daily_digest');
  const bal = rows.find(r => r.kind === 'balance_below');
  const kbRows = [
    [{ t: digest?.enabled ? '🔕 Digest: ON → turn OFF' : '🔔 Digest: OFF → turn ON', c: 'alr:digest' }],
    [{ t: '💰 Balance alert < 5 TON', c: 'alr:bal5' }, { t: '💰 < 10 TON', c: 'alr:bal10' }],
    [{ t: '🗑️ Remove balance alert', c: 'alr:baloff' }],
    [{ t: '⬅️ Menu', c: 'menu:main' }]
  ];
  await ctx.editOrSend([
    '🔔 <b>ALERTS</b>',
    `📰 Daily digest (21:00 IST): <b>${digest?.enabled ? 'ON' : 'OFF'}</b>`,
    `💰 Balance alert: ${bal ? `<b>&lt; ${bal.params.threshold} TON</b>` : 'not set'}`,
    '',
    '<i>Digest includes: balance + per-ad live deltas. Alerts run via in-process scheduler.</i>'
  ].join('\n'), fmt.kb(kbRows));
}

async function toggleDigest(ctx) {
  const cur = await db.one(`select id, enabled from alerts where tg_id=$1 and kind='daily_digest'`, [ctx.from.id]);
  if (!cur) await db.q(`insert into alerts(tg_id,kind) values ($1,'daily_digest')`, [ctx.from.id]);
  else await db.q(`update alerts set enabled = not enabled, last_run_at=null where id=$1`, [cur.id]);
  await alertsMenu(ctx);
}

async function setBalanceAlert(ctx, threshold) {
  await db.q(`delete from alerts where tg_id=$1 and kind='balance_below'`, [ctx.from.id]);
  await db.q(`insert into alerts(tg_id,kind,params) values ($1,'balance_below',$2)`, [ctx.from.id, JSON.stringify({ threshold })]);
  await alertsMenu(ctx);
}

async function removeBalanceAlert(ctx) {
  await db.q(`delete from alerts where tg_id=$1 and kind='balance_below'`, [ctx.from.id]);
  await alertsMenu(ctx);
}

module.exports = { alertsMenu, toggleDigest, setBalanceAlert, removeBalanceAlert };
