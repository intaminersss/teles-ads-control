'use strict';
/* scheduler.js — in-process interval scheduler: daily digest + balance alerts (idempotent by date key). */
const db = require('./db');
const tg = require('./tg');
const adsapi = require('./adsapi');
const fmt = require('./format');

let running = false;
async function tick(log) {
  if (running) return; running = true;
  try {
    const today = new Date().toISOString().slice(0, 10);
    /* daily digest @ 15:30 UTC = 21:00 IST */
    const nowUtc = new Date();
    const digestTime = nowUtc.getUTCHours() === 15 && nowUtc.getUTCMinutes() < 5;
    const digests = await db.q(`select a.* from alerts a where a.kind='daily_digest' and a.enabled=true
                                and (a.last_run_at is null or a.last_run_at::date < $1)`, [today]);
    for (const al of digests) {
      if (!digestTime && al.last_run_at) continue; // only send in the digest window once enabled
      try {
        const acct = await adsapi.getCurrentAccount();
        const ads = await adsapi.getAdsList();
        await tg.sm(al.tg_id, [
          `📰 <b>DAILY DIGEST — ${today}</b>`,
          `💰 Balance: <b>${acct.remaining_budget} TON</b>`,
          '',
          ...ads.map(a => fmt.adLine(a))
        ].join('\n'));
        await db.q(`update alerts set last_run_at=now() where id=$1`, [al.id]);
      } catch (e) { log(`digest error: ${e.message}`); }
    }
    /* balance alerts — checked hourly-ish via last_run_at spacing */
    const bals = await db.q(`select * from alerts where kind='balance_below' and enabled=true
                             and (last_run_at is null or last_run_at < now() - interval '1 hour')`);
    for (const al of bals) {
      try {
        const acct = await adsapi.getCurrentAccount();
        const th = Number(al.params?.threshold || 5);
        if (Number(acct.remaining_budget) < th) {
          await tg.sm(al.tg_id, `🚨 <b>BALANCE ALERT</b>: ${acct.remaining_budget} TON < ${th} TON — refill soon.`);
        }
        await db.q(`update alerts set last_run_at=now() where id=$1`, [al.id]);
      } catch (e) { log(`balance alert error: ${e.message}`); }
    }
  } finally { running = false; }
}

function start(log) { setInterval(() => tick(log).catch(e => log(`scheduler: ${e.message}`)), 5 * 60 * 1000).unref(); log('scheduler started (5-min tick)'); }
module.exports = { start, tick };
