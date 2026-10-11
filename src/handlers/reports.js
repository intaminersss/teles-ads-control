'use strict';
/* handlers/reports.js — performance report (live metrics + snapshot deltas) + CSV export. */
const adsapi = require('../adsapi');
const db = require('../db');
const fmt = require('../format');

async function report(ctx, periodDays = 1) {
  const ads = await adsapi.getAdsList();
  const ids = ads.map(a => a.ad_id);
  const live = ids.length ? await adsapi.getAdsById(ids) : [];
  for (const a of live) {
    await db.q(`insert into ads_snapshot(ad_id,status,data) values ($1,$2,$3)`, [a.ad_id, a.status, JSON.stringify(a)]);
  }
  const since = new Date(Date.now() - periodDays * 86400e3).toISOString();
  const deltas = [];
  for (const a of live) {
    const prev = await db.one(`select data->>'views' v, data->>'clicks' c, data->>'joins' j
                               from ads_snapshot where ad_id=$1 and captured_at < $2 order by captured_at desc limit 1`,
      [a.ad_id, since]);
    deltas.push({
      ad_id: a.ad_id, status: a.status,
      views: (a.views || 0) - Number(prev?.v || 0), clicks: (a.clicks || 0) - Number(prev?.c || 0),
      joins: (a.joins || 0) - Number(prev?.j || 0), spent: +(a.spent_budget || 0)
    });
  }
  const rows = deltas.filter(d => periodDays > 0 ? true : true);
  const tj = rows.reduce((x, d) => x + d.joins, 0), tsp = rows.reduce((x, d) => x + d.spent, 0);
  const text = [
    `📈 <b>PERFORMANCE — last ${periodDays}d window</b>`,
    `<i>Views/clicks/joins = period deltas (first run shows 0 until history builds). Spend = lifetime live value.</i>`,
    '',
    ...rows.map(d => `${fmt.statusLabel(d.status)} #${d.ad_id}: +${d.views}v +${d.clicks}c +${d.joins}j${d.joins ? ` · ₹${(d.spent / d.joins * 1.45 * 84).toFixed(0)}/join(life)` : ''}`),
    '',
    `Σ period: +${rows.reduce((x, d) => x + d.views, 0)}v +${rows.reduce((x, d) => x + d.clicks, 0)}c +${tj}j`,
    `💰 lifetime spend: ${tsp.toFixed(2)} TON (~${fmt.money(tsp)})`,
    `<i>Sources: official Telegram Ads API (live) + local snapshot history. Generated ${new Date().toISOString()}.</i>`
  ].join('\n');
  return ctx.editOrSend(text, fmt.kb([
    [{ t: '📄 Export CSV', c: `rep:csv:${periodDays}` }],
    [{ t: '🗓️ 7-day view', c: 'rep:7' }], [{ t: '⬅️ Menu', c: 'menu:main' }]]));
}

async function exportCsv(ctx, periodDays) {
  const rows = (await adsapi.getAdsList()).map(a => ({
    ad_id: a.ad_id, status: a.status, views: a.views, clicks: a.clicks,
    joins: a.joins, spent_ton: a.spent_budget,
    ctr_pct: a.views ? +((a.clicks / a.views) * 100).toFixed(2) : 0,
    join_rate_pct: a.clicks ? +((a.joins / a.clicks) * 100).toFixed(1) : 0,
    cost_per_join_inr: a.joins ? Math.round((a.spent_budget / a.joins) * 1.45 * 84) : ''
  }));
  await ctx.sendDoc(`teles-report-${new Date().toISOString().slice(0, 10)}.csv`, fmt.toCsv(rows),
    `📈 Telegram Ads performance (live API data, lifetime totals) — ${rows.length} ads`);
}

module.exports = { report, exportCsv };
