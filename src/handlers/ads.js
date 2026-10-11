'use strict';
/* handlers/ads.js — live ad board, per-ad detail, guarded actions (pause/resume/delete/edit cap). */
const adsapi = require('../adsapi');
const fmt = require('../format');
const tg = require('../tg');
const path = require('path');
const { BRAND } = fmt;
const guard = require('../guard');
const db = require('../db');

const boardState = new Map(); // chatId -> {ads, page, sort}
const PAGE = 4;
const SORTS = { live: 'platform order', cpj: 'cheapest joins first', joins: 'most joins first', spend: 'biggest spend first' };
const cpj = a => (a.joins ? (a.spent_budget || 0) / a.joins : Infinity); // lower = better

function sortAds(ads, sort) {
  const c = [...ads];
  if (sort === 'cpj') c.sort((x, y) => cpj(x) - cpj(y));
  if (sort === 'joins') c.sort((x, y) => (y.joins || 0) - (x.joins || 0));
  if (sort === 'spend') c.sort((x, y) => (y.spent_budget || 0) - (x.spent_budget || 0));
  return c;
}

/* #3: today's spend from snapshot deltas (min→max per ad today) */
async function todaySpend() {
  try {
    const r = await db.q(`select coalesce(sum(mx - mn),0) t from (select ad_id, max((data->>'spent_budget')::numeric) mx, min((data->>'spent_budget')::numeric) mn from ads_snapshot where captured_at >= date_trunc('day', now()) group by ad_id) x`);
    return Number(r?.[0]?.t || 0);
  } catch { return null; }
}

async function adsMenu(ctx, page = 0, sort = 'live') {
  const acct = await adsapi.getCurrentAccount();
  const raw = await adsapi.getAdsList();
  const ads = sortAds(raw, sort);
  boardState.set(ctx.chatId, { ads, page, sort });
  const pages = Math.max(1, Math.ceil(ads.length / PAGE));
  page = Math.min(page, pages - 1);
  const slice = ads.slice(page * PAGE, page * PAGE + PAGE);
  const today = await todaySpend();
  const pacing = today != null ? `\n⏱️ <b>Today:</b> ${today.toFixed(2)} TON ${fmt.bar(today, 3)} <i>of 3 TON fleet cap</i>` : '';
  const bal = acct?.remaining_budget != null
    ? `${fmt.header('📊', 'LIVE ADS')}
💰 <code>${fmt.bar(acct.remaining_budget, Math.max(acct.remaining_budget, 20))}</code> balance <b>${fmt.ton(acct.remaining_budget)}</b> · <i>${fmt.esc(adsapi.accountLabel())}</i>${pacing}

` : '';
  const kbRows = slice.map(a => [{ t: `#${a.ad_id} ${fmt.pill(a.status)}`, c: `ad:${a.ad_id}` }]);
  kbRows.push(...fmt.pagerRows(page, pages, 'ads'));
  kbRows.push([{ t: `↕️ ${SORTS[sort] || 'sort'}`, c: `ads:sort:${sort}` }, { t: '🔥 Winners', c: 'ads:winners' }]);
  kbRows.push([{ t: '⏸️ Pause all', c: 'ads:bulk:pause' }, { t: '▶️ Resume capped', c: 'ads:bulk:resume' }]);
  kbRows.push([{ t: '🔄 Refresh', c: 'ads:refresh' }, { t: '⬅️ Menu', c: 'menu:main' }]);
  const body = [`${bal}${fmt.adsBoard(slice)}`];
  if (pages > 1) body.push(`<i>page ${page + 1}/${pages} — ${ads.length} ads total</i>`);
  if (sort !== 'live') body.push(`<i>sorted: ${SORTS[sort] || sort} — tap ↕️ to cycle</i>`);
  await ctx.editOrSend(body.join('\n'), fmt.kb(kbRows));
}

/* sort cycle: live → cpj → joins → spend → live */
async function cycleSort(ctx, cur) {
  const order = ['live', 'cpj', 'joins', 'spend'];
  const next = order[(order.indexOf(cur) + 1) % order.length];
  const st = boardState.get(ctx.chatId);
  return adsMenu(ctx, st?.page || 0, next);
}

/* WINNERS — active ads with JR ≥ 40%, one-tap cap push per fleet rule */
async function winners(ctx) {
  const list = await adsapi.getAdsList();
  const ids = list.filter(a => a.status === 'active').map(a => a.ad_id);
  const live = ids.length ? await adsapi.getAdsById(ids) : [];
  const w = live.filter(a => a.clicks ? (a.joins || 0) / a.clicks >= 0.4 : false)
    .sort((x, y) => (y.joins || 0) / (y.clicks || 1) - (x.joins || 0) / (x.clicks || 1));
  if (!w.length) {
    return ctx.editOrSend(`${fmt.header('🔥', 'WINNERS')}

<i>No active ad is at winner-grade yet (JR ≥ 40% of clicks). Keep testing — 🧪 Test Ad funnel feeds this board.</i>`,
      fmt.kb([[{ t: '🧪 New test ads', c: 'menu:testad', style: 'primary' }], [{ t: '⬅️ Ads', c: 'menu:ads' }]]));
  }
  const rows = w.map(a => [
    { t: `#${a.ad_id} · ${(100 * (a.joins || 0) / (a.clicks || 1)).toFixed(0)}% JR · ${a.joins || 0}j`, c: `ad:${a.ad_id}` },
    { t: '💰 +1 TON cap', c: `ad:${a.ad_id}:capup`, style: 'primary' }
  ]);
  return ctx.editOrSend([
    fmt.header('🔥', 'WINNERS — PUSH THESE'),
    '',
    `Fleet rule: <b>winners get funded without re-asking</b> (₹3–5/member target, 3 TON/day cap).`,
    ''
  ].join('\n'), fmt.kb([...rows, [{ t: '⬅️ Ads', c: 'menu:ads' }]]));
}

/* BULK: pause all active / resume paused-with-cap (confirm-gated, sequential, audited) */
async function bulk(ctx, kind) {
  const key = `ads:bulk:${kind}`;
  const label = kind === 'pause' ? 'PAUSE ALL ACTIVE ADS' : 'RESUME ALL PAUSED ADS (with cap)';
  const list = await adsapi.getAdsList();
  const targets = list.filter(a => kind === 'pause' ? a.status === 'active' : (a.status === 'paused' || a.status === 'on_hold'));
  if (!guard.takeConfirm(key)) {
    guard.askConfirm(key, { kind, n: targets.length });
    return ctx.editOrSend(`⚠️ <b>Confirm: ${label} (${targets.length} ads)?</b>
<i>This is a real platform action on every matching ad.</i>`, fmt.kb([
      [{ t: `✅ Yes — ${label}`, c: key + ':_go', style: kind === 'pause' ? 'danger' : 'success' }],
      [{ t: '❌ Cancel', c: 'menu:ads' }]]));
  }
  const wait = await ctx.sm(`⚙️ <b>${label}</b> — working on ${targets.length} ads…`);
  let ok = 0, failed = [];
  for (const a of targets.slice(0, 50)) {
    try {
      await adsapi.editAd(a.ad_id, { is_paused: kind === 'pause' });
      ok++;
    } catch (e) { failed.push(`#${a.ad_id} ${String(e.code || e.message).slice(0, 30)}`); }
  }
  await guard.audit(ctx.from.id, `ads.bulk.${kind}`, { n: targets.length }, `ok=${ok} fail=${failed.length}`);
  return ctx.edit(wait.chat.id, wait.message_id, [
    fmt.header('✅', 'BULK DONE'),
    '',
    `✅ ${ok} ads ${kind === 'pause' ? 'paused' : 'resumed'}${failed.length ? `\n❌ ${failed.length} failed: ${fmt.esc(failed.slice(0, 5).join(' · '))}` : ''}`
  ].join('\n'), fmt.kb([[{ t: '📊 My Ads', c: 'menu:ads', style: 'primary' }], [{ t: '⬅️ Menu', c: 'menu:main' }]]));
}

/* CLONE ad → draft (reuses stored text; promote_url needs one edit) */
async function cloneAd(ctx, id) {
  const [a] = await adsapi.getAdsById([id]);
  if (!a) return ctx.answerCb('Ad not found');
  const text = a.text || a.creative_text || null;
  if (!text) return ctx.answerCb('Platform did not return this ad text — clone not possible.');
  const r = await db.q(
    `insert into drafts(title,text,promote_url,cpm,placement,target,initial_budget,daily_budget_limit,status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'draft') returning id`,
    [`Clone of #${id}`.slice(0, 60), String(text).slice(0, 160), a.promote_url || 'REPLACE_ME', Number(a.cpm || 0.6), a.placement || 'channel_post',
     typeof a.target === 'string' ? a.target : JSON.stringify(a.target || { type: 'channels' }), Number(a.initial_budget || 1.8), a.daily_budget_limit || 3])
    .catch(e => ({ err: e }));
  if (!r?.length) return ctx.answerCb('Clone failed: ' + String(r.err?.message || 'db').slice(0, 60));
  await guard.audit(ctx.from.id, 'ad.clone', { id, draft: r[0].id }, 'ok');
  return ctx.editOrSend(`${fmt.header('🧬', 'CLONED TO DRAFTS')}

<b>#${id}</b> → draft <code>${String(r[0].id).slice(0, 8)}</code>
<i>Edit text/URL in Drafts, then launch as a fresh test.</i>`, fmt.kb([
    [{ t: '📋 Open Drafts', c: 'menu:drafts', style: 'primary' }], [{ t: '⬅️ Ads', c: 'menu:ads' }]]));
}

async function adDetail(ctx, id) {
  const [a] = await adsapi.getAdsById([id]);
  if (!a) return ctx.editOrSend(`❌ #${id} not found (platform may have deleted it).`, fmt.kb([[{ t: '⬅️ Ads', c: 'menu:ads' }]]));
  const t = a.target ? `\n🎯 ${esc(JSON.stringify(a.target).slice(0, 300))}` : '';
  const kbRows = [];
  if (a.status === 'active') kbRows.push([{ t: '⏸️ Pause', c: `ad:${id}:pause` }, { t: '🗑️ Delete', c: `ad:${id}:delc` }]);
  if (a.status === 'on_hold' || a.status === 'paused') kbRows.push([{ t: '▶️ Resume', c: `ad:${id}:resume` }]);
  /* #5: creative age from snapshot first-seen */
  try {
    const f = await db.q(`select min(captured_at) f from ads_snapshot where ad_id=$1`, [id]);
    if (f?.[0]?.f) {
      const age = Math.floor((Date.now() - new Date(f[0].f).getTime()) / 86400e3);
      if (age >= 10) var _ageBadge = `\n⏳ <b>Creative age ${age}d</b> — is niche me burnout fast: refresh soon`;
    }
  } catch {}
  kbRows.push([{ t: '⚙️ Daily cap +1', c: `ad:${id}:capup` }]);
  kbRows.push([{ t: '🧬 Clone → draft', c: `ad:${id}:clone` }, { t: '⚖️ Compare', c: `ad:${id}:cmp` }]);
  kbRows.push([{ t: '📄 Single-ad report', c: `ad:${id}:rep`, style: 'primary' }, { t: '🔥 Winners', c: 'ads:winners' }]);
  kbRows.push([{ t: '⬅️ Ads', c: 'menu:ads' }]);
  const text = [
    `${fmt.statusLabel(a.status)} <b>AD #${a.ad_id}</b>`,
    a.title ? `🏷️ ${fmt.esc(a.title)}` : '',
    `\n👀 ${a.views || 0} views · 👆 ${a.clicks || 0} clicks · 🚪 ${a.joins || 0} joins`,
    `💸 spent ${(+a.spent_budget).toFixed(2)} TON (~${fmt.money(+a.spent_budget || 0)})`,
    a.daily_budget_limit ? `📅 daily cap ${a.daily_budget_limit} TON` : '',
    a.remaining_budget != null ? `💼 remaining ${(+a.remaining_budget).toFixed(2)} TON` : '',
    a.text ? `\n📝 <i>${fmt.esc(String(a.text).slice(0, 200))}</i>` : '', t, typeof _ageBadge === 'string' ? _ageBadge : ''
  ].filter(Boolean).join('\n');
  await ctx.editOrSend(text, fmt.kb(kbRows));
}

async function adAction(ctx, id, action) {
  /* _go suffix = confirmed execution of a previously-gated action (router passes raw data) */
  const isGo = action.endsWith('_go');
  if (isGo) action = action.slice(0, -3);
  if (action === 'delc') action = 'del'; // legacy delete-confirm label (was silently dead before v6)
  if (action === 'clone') return cloneAd(ctx, id);
  const key = `ad:${id}:${action}`;
  const confirmables = { pause: 'PAUSE', resume: 'RESUME', del: 'DELETE', capup: 'DAILY CAP +1 TON' };
  if (!isGo && ['pause', 'resume', 'del', 'capup'].includes(action)) {
    guard.askConfirm(key, { id, action });
    return ctx.editOrSend(
      `⚠️ <b>Confirm: ${confirmables[action]} ad #${id}?</b>\nThis is a consequential live-platform action.`,
      fmt.kb([[{ t: `✅ Yes, ${confirmables[action]}`, c: `${key}_go`, style: action === 'resume' ? 'success' : 'danger' }], [{ t: '❌ Cancel', c: `ad:${id}` }]]));
  }
  if (guard.alreadyDone(key)) return ctx.answerCb('Already done just now — not repeating.');
  let result = 'ok';
  try {
    if (action === 'pause' || action === 'del') await adsapi.editAd(id, { is_paused: true });
    if (action === 'resume') await adsapi.editAd(id, { is_paused: false });
    if (action === 'capup') {
      const [a] = await adsapi.getAdsById([id]);
      const cur = Number(a?.daily_budget_limit || 0);
      await adsapi.editAd(id, { daily_budget_limit: +(cur + 1).toFixed(2) });
    }
    if (action === 'del') {
      try { await adsapi.deleteAd(id); }
      catch (e) { if (e.code === 'AD_IS_ACTIVE') result = 'paused now; delete again after ~10 min cooldown'; else throw e; }
    }
    await guard.audit(ctx.from.id, `ad.${action}`, { id }, result);
    await ctx.answerCb(`${action} ✓`);
    if (action === 'del' && result === 'ok') {
      ctx.sm('🧹 Cleanup done.').catch(() => {});
      return ctx.editOrSend(`${fmt.header('🗑️', 'AD DELETED')}
#${id} removed. <i>Refund lands in balance automatically.</i>`, fmt.kb([[{ t: '📊 My Ads', c: 'menu:ads' }]]));
    }
    return adDetail(ctx, id);
  } catch (e) {
    await guard.audit(ctx.from.id, `ad.${action}`, { id }, `ERROR ${e.code || e.message}`);
    return ctx.editOrSend(`❌ <b>${fmt.esc(adsapi.explain(e))}</b>`, fmt.kb([[{ t: '⬅️ Ads', c: 'menu:ads' }]]));
  }
}

/* #4: side-by-side comparison of two ads */
async function compare(ctx, idA, idB) {
  if (!idB) {
    const list = (await adsapi.getAdsList()) || [];
    const rows = list.filter(a => a.ad_id !== idA).slice(0, 8).map(a => [{ t: `vs #${a.ad_id}`, c: `ad:${idA}:cmp:${a.ad_id}` }]);
    return ctx.editOrSend(`⚖️ <b>COMPARE — Ad #${idA} vs?</b>`, fmt.kb([...rows, [{ t: '⬅️ Ads', c: 'menu:ads' }]]));
  }
  const [a] = await adsapi.getAdsById([idA]);
  const [b] = await adsapi.getAdsById([idB]);
  if (!a || !b) return ctx.editOrSend('❌ Ad not found.', fmt.kb([[{ t: '⬅️ Ads', c: 'menu:ads' }]]));
  const row = (x, y, label, fx = v => String(v), better) => {
    const xa = fx(x), yb = fx(y);
    let m = '  ';
    if (better === 'hi' && x > y) m = '🅰️'; if (better === 'hi' && y > x) m = '🅱️';
    if (better === 'lo' && x < y && y > 0) m = '🅰️'; if (better === 'lo' && y < x && x > 0) m = '🅱️';
    return `| ${label} | ${xa} | ${yb} | ${m} |`;
  };
  const jr = x => (x.clicks ? (100 * (x.joins || 0) / x.clicks).toFixed(1) + '%' : '—');
  const cpj = x => (x.joins ? ((x.spent_budget || 0) / x.joins).toFixed(3) + ' TON' : '—');
  const winner = (() => {
    const ja = a.clicks ? (a.joins || 0) / a.clicks : 0, jb = b.clicks ? (b.joins || 0) / b.clicks : 0;
    return ja === jb ? '🤝 Tie' : ja > jb ? `🏆 <b>#${a.ad_id} (higher JR)</b>` : `🏆 <b>#${b.ad_id} (higher JR)</b>`;
  })();
  return ctx.editOrSend([
    fmt.header('⚖️', `COMPARE — #${idA} vs #${idB}`),
    '',
    `| Metric | #${idA} | #${idB} | |`,
    `|---|---|---|---|`,
    row(a.views || 0, b.views || 0, 'Views', v => v.toLocaleString('en-US'), 'hi'),
    row(a.clicks || 0, b.clicks || 0, 'Clicks', v => v.toLocaleString('en-US'), 'hi'),
    row(a.joins || 0, b.joins || 0, 'Joins', v => v.toLocaleString('en-US'), 'hi'),
    row(jr(a), jr(b), 'JR', s => s, 'hi'),
    row(cpj(a), cpj(b), 'Cost/join', s => s, 'lo'),
    row(+(a.spent_budget || 0), +(b.spent_budget || 0), 'Spent TON', v => v.toFixed(2), 'lo'),
    '',
    winner
  ].join('\n'), fmt.kb([[{ t: `📄 #${idA} report`, c: `ad:${idA}:rep` }, { t: `📄 #${idB} report`, c: `ad:${idB}:rep` }], [{ t: '⬅️ Ads', c: 'menu:ads' }]]));
}

module.exports = { adsMenu, adDetail, adAction, winners, bulk, cloneAd, cycleSort, compare, todaySpend };
