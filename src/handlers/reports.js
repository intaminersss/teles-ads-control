'use strict';
/* handlers/reports.js — PERFORMANCE REPORTS, rebuilt per owner directive:
   "always send report in .md with all ads mentioned separately + budget + report".
   → Full report is a real .md DOCUMENT (sendDocument): fleet summary table,
   then ONE SECTION PER AD (status, budget block, funnel block, verdict + action),
   fleet totals, balance. In-chat: compact summary + the file. CSV export kept. */

const adsapi = require('../adsapi');
const db = require('../db');
const guard = require('../guard');
const fmt = require('../format');

/* verdict + recommended action per ad (fleet rules: push winners, 3 TON/day cap) */
function verdict(a, jr) {
  if (a.status !== 'active') return a.status === 'paused' || a.status === 'on_hold' ? ['💤', 'PAUSED', 'Resume if budget frees up (auto-resume caps at 3 TON/day).'] : ['⏳', a.status?.toUpperCase() || '?', 'In platform review — watch it.'];
  if (jr == null) return ['👀', 'NO DATA YET', 'Too early — check after ~200 views.'];
  if (jr >= 0.4) return ['🔥', 'WINNER', 'Push budget per fleet rule — winners get funded without re-asking.'];
  if (jr >= 0.15) return ['✅', 'HEALTHY', 'Keep running; refresh creative if CTR decays.'];
  if (jr >= 0.05) return ['⚠️', 'WEAK', 'Swap creative/hook before adding budget.'];
  return ['🛑', 'BURNING', 'Pause or retarget — this one bleeds budget.'];
}

function perAdMd(a) {
  const views = a.views || 0, clicks = a.clicks || 0, joins = a.joins || 0;
  const spent = +(a.spent_budget || 0);
  const ctr = views ? (clicks / views) : null;
  const jr = clicks ? (joins / clicks) : null;
  const cpj = joins ? spent / joins : null;               // TON per join
  const cpjInr = joins ? spent * 1.45 * 84 / joins : null; // fleet money estimate
  const [emo, label, action] = verdict(a, jr);
  const budget = [
    `| Item | Value |`,
    `|---|---|`,
    `| Spent | **${spent.toFixed(2)} TON** (~₹${(spent * 1.45 * 84).toFixed(0)} est) |`,
    `| Daily cap | ${a.daily_budget_limit != null ? a.daily_budget_limit + ' TON' : '—'} |`,
    `| Remaining | ${a.remaining_budget != null ? a.remaining_budget + ' TON' : '—'} |`
  ];
  const funnel = [
    `| Stage | Value | Rate |`,
    `|---|---|---|`,
    `| Views | ${views.toLocaleString('en-US')} | — |`,
    `| Clicks | ${clicks.toLocaleString('en-US')} | ${ctr != null ? (ctr * 100).toFixed(1) + '% CTR' : '—'} |`,
    `| Joins | ${joins.toLocaleString('en-US')} | ${jr != null ? (jr * 100).toFixed(1) + '% JR' : '—'} |`,
    `| Cost/join | ${cpj != null ? cpj.toFixed(3) + ' TON (≈₹' + cpjInr.toFixed(0) + ')' : '—'} | fleet target ₹2–5 |`
  ];
  return [
    `## ${emo} Ad #${a.ad_id} — ${label} (${String(a.status).toUpperCase()})`,
    '',
    `**Budget**`,
    '',
    ...budget,
    '',
    `**Funnel**`,
    '',
    ...funnel,
    '',
    `**Action:** ${action}`
  ].join('\n');
}

async function buildReportMd(periodDays = 1) {
  const ads = await adsapi.getAdsList();
  const ids = ads.map(a => a.ad_id);
  const live = ids.length ? await adsapi.getAdsById(ids) : [];
  for (const a of live) {
    await db.q(`insert into ads_snapshot(ad_id,status,data) values ($1,$2,$3)`, [a.ad_id, a.status, JSON.stringify(a)]).catch(() => {});
  }
  const totals = live.reduce((x, a) => ({
    views: x.views + (a.views || 0), clicks: x.clicks + (a.clicks || 0),
    joins: x.joins + (a.joins || 0), spent: x.spent + (a.spent_budget || 0)
  }), { views: 0, clicks: 0, joins: 0, spent: 0 });
  const active = live.filter(a => a.status === 'active').length;
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  let account = null;
  try { account = await adsapi.getCurrentAccount(); } catch { /* optional */ }
  const L = [];
  L.push(`# 📊 THETAS AI — FULL ADS REPORT`);
  L.push('');
  L.push(`**TelesAds · ${date}** · window: last ${periodDays}d · source: official Telegram Ads API (live pull)`);
  L.push('');
  L.push(`---`);
  L.push('');
  L.push(`## 🗂️ FLEET SUMMARY — ${live.length} ads (${active} active)`);
  L.push('');
  L.push(`| # | Status | Views | Clicks | Joins | Spent TON | ₹/join | Verdict |`);
  L.push(`|---|---|---|---|---|---|---|---|`);
  for (const a of live) {
    const jr = a.clicks ? (a.joins || 0) / a.clicks : null;
    const cpj = a.joins ? (a.spent_budget || 0) / a.joins * 1.45 * 84 : null;
    const [emo, label] = verdict(a, jr);
    L.push(`| #${a.ad_id} | ${emo} ${a.status} | ${(a.views || 0).toLocaleString('en-US')} | ${(a.clicks || 0).toLocaleString('en-US')} | ${(a.joins || 0).toLocaleString('en-US')} | ${(+(a.spent_budget || 0)).toFixed(2)} | ${cpj != null ? '₹' + cpj.toFixed(0) : '—'} | ${label} |`);
  }
  L.push('');
  L.push(`**Totals:** ${totals.views.toLocaleString('en-US')} views · ${totals.clicks.toLocaleString('en-US')} clicks · **${totals.joins.toLocaleString('en-US')} joins** · **${totals.spent.toFixed(2)} TON** spent (~₹${(totals.spent * 1.45 * 84).toFixed(0)} est)${account?.remaining_budget != null ? ` · account left: **${account.remaining_budget} TON**` : ''}`);
  L.push('');
  L.push(`---`);
  L.push('');
  L.push(`## 🎯 AD-BY-AD DETAIL`);
  L.push('');
  for (const a of live) { L.push(perAdMd(a)); L.push(''); }
  L.push(`---`);
  L.push('');
  L.push(`**Fleet standing rules applied:** winners get pushed w/o re-asking · 3 TON/day caps (auto-resume) · India-first, channel-only targeting · every consequential action audited.`);
  L.push('');
  L.push(`**— THETAS AI · Fully Built By Agency @TelesAds (Telesads.com)**`);
  L.push('');
  L.push(`<sub>Generated ${new Date().toISOString()} · CPM 0.6 TON · ₹ conversions = TON×1.45×$84, labeled estimates.</sub>`);
  return { md: L.join('\n'), live, totals, account };
}

async function report(ctx, periodDays = 1) {
  const { md, live, totals, account } = await buildReportMd(periodDays);
  const fname = `thetas-ads-report-${new Date().toISOString().slice(0, 10)}.md`;
  await ctx.sendDoc(fname, md, `📊 <b>Full report — ${live.length} ads, ${totals.joins} joins, ${totals.spent.toFixed(2)} TON</b>${account?.remaining_budget != null ? ` · ${account.remaining_budget} TON left` : ''}`);
  const top = [...live].filter(a => a.status === 'active' && a.joins).sort((x, y) => (y.joins / (y.clicks || 1)) - (x.joins / (x.clicks || 1)))[0];
  return ctx.editOrSend([
    fmt.header('📈', `PERFORMANCE — last ${periodDays}d`),
    '',
    `📎 <b>Full .md report delivered above ⬆️</b> — every ad in its own section with budget + funnel + verdict.`,
    '',
    `Σ <b>${live.length}</b> ads · ${totals.views.toLocaleString('en-US')}v · ${totals.clicks.toLocaleString('en-US')}c · <b>${totals.joins.toLocaleString('en-US')}j</b> · ${totals.spent.toFixed(2)} TON${account?.remaining_budget != null ? ` · ${account.remaining_budget} TON left` : ''}`,
    top ? `🔥 Best active: <b>#${top.ad_id}</b> (${((top.joins / (top.clicks || 1)) * 100).toFixed(0)}% JR) — winner rule applies.` : ''
  ].filter(Boolean).join('\n'), fmt.kb([
    [{ t: '📄 Export CSV', c: `rep:csv:${periodDays}` }],
    [{ t: '🗓️ 7-day view', c: 'rep:7' }], [{ t: '⬅️ Menu', c: 'menu:main' }]
  ]));
}

async function exportCsv(ctx, periodDays) {
  const { live } = await buildReportMd(periodDays);
  const rows = live.map(a => ({ ad_id: a.ad_id, status: a.status, views: a.views, clicks: a.clicks, joins: a.joins, spent_ton: a.spent_budget, daily_cap: a.daily_budget_limit ?? '', remaining: a.remaining_budget ?? '' }));
  return ctx.sendDoc(`thetas-ads-${periodDays}d.csv`, fmt.toCsv(rows), `📄 CSV — ${rows.length} ads.`);
}

/* #6/#55: SINGLE-AD report — ek hi ad ka share-ready .md (full account report nahi) */
async function singleAd(ctx, id) {
  const [a] = await adsapi.getAdsById([id]);
  if (!a) return ctx.editOrSend(`❌ #${id} not found.`, fmt.kb([[{ t: '⬅️ Ads', c: 'menu:ads' }]]));
  const jr = a.clicks ? (a.joins || 0) / a.clicks : null;
  const [emo, label] = verdict(a, jr);
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const md = [
    `# 📄 AD REPORT — #${a.ad_id}`,
    '',
    `**TelesAds · ${date}** · single-campaign report (not the full account) · source: official Telegram Ads API`,
    '',
    `**${emo} Verdict: ${label}**`,
    '',
    perAdMd(a),
    '',
    a.title ? `**Title:** ${a.title}\n` : '',
    a.promote_url ? `**Promotes:** ${a.promote_url}\n` : '',
    a.target ? `**Targeting:** \`${typeof a.target === 'string' ? a.target : JSON.stringify(a.target)}\`` : '',
    '',
    `**— THETAS AI · Fully Built By Agency @TelesAds (Telesads.com)**`,
    `<sub>Generated ${new Date().toISOString()} · ₹ conversions are labeled estimates.</sub>`
  ].filter(Boolean).join('\n');
  await guard.audit(ctx.from.id, 'report.single', { id }, 'ok');
  return ctx.sendDoc(`ad-${id}-report-${new Date().toISOString().slice(0, 10)}.md`, md, `📄 <b>Single-ad report — #${id}</b> ${emo} ${label}\n<i>Client ko seedha forward karo.</i>`);
}

module.exports = { report, exportCsv, buildReportMd, verdict, perAdMd, singleAd };
