'use strict';
/* handlers/ads.js — live ad board, per-ad detail, guarded actions (pause/resume/delete/edit cap). */
const adsapi = require('../adsapi');
const fmt = require('../format');
const tg = require('../tg');
const path = require('path');
const { BRAND } = fmt;
const guard = require('../guard');

const boardState = new Map(); // chatId -> {ads, page}
const PAGE = 4;

async function adsMenu(ctx, page = 0) {
  const acct = await adsapi.getCurrentAccount();
  const ads = await adsapi.getAdsList();
  boardState.set(ctx.chatId, { ads, page });
  const pages = Math.max(1, Math.ceil(ads.length / PAGE));
  page = Math.min(page, pages - 1);
  const slice = ads.slice(page * PAGE, page * PAGE + PAGE);
  const bal = acct?.remaining_budget != null
    ? `${fmt.header('📊', 'LIVE ADS')}
💰 <code>${fmt.bar(acct.remaining_budget, Math.max(acct.remaining_budget, 20))}</code> balance <b>${fmt.ton(acct.remaining_budget)}</b>

` : '';
  const kbRows = slice.map(a => [{ t: `#${a.ad_id} ${fmt.pill(a.status)}`, c: `ad:${a.ad_id}` }]);
  kbRows.push(...fmt.pagerRows(page, pages, 'ads'));
  kbRows.push([{ t: '🔄 Refresh', c: 'ads:refresh' }, { t: '⬅️ Menu', c: 'menu:main' }]);
  const body = [`${bal}${fmt.adsBoard(slice)}`];
  if (pages > 1) body.push(`<i>page ${page + 1}/${pages} — ${ads.length} ads total</i>`);
  await ctx.editOrSend(body.join('\n'), fmt.kb(kbRows));
}

async function adDetail(ctx, id) {
  const [a] = await adsapi.getAdsById([id]);
  if (!a) return ctx.editOrSend(`❌ #${id} not found (platform may have deleted it).`, fmt.kb([[{ t: '⬅️ Ads', c: 'menu:ads' }]]));
  const t = a.target ? `\n🎯 ${esc(JSON.stringify(a.target).slice(0, 300))}` : '';
  const kbRows = [];
  if (a.status === 'active') kbRows.push([{ t: '⏸️ Pause', c: `ad:${id}:pause` }, { t: '🗑️ Delete', c: `ad:${id}:delc` }]);
  if (a.status === 'on_hold' || a.status === 'paused') kbRows.push([{ t: '▶️ Resume', c: `ad:${id}:resume` }]);
  kbRows.push([{ t: '⚙️ Daily cap +1', c: `ad:${id}:capup` }]);
  kbRows.push([{ t: '⬅️ Ads', c: 'menu:ads' }]);
  const text = [
    `${fmt.statusLabel(a.status)} <b>AD #${a.ad_id}</b>`,
    a.title ? `🏷️ ${fmt.esc(a.title)}` : '',
    `\n👀 ${a.views || 0} views · 👆 ${a.clicks || 0} clicks · 🚪 ${a.joins || 0} joins`,
    `💸 spent ${(+a.spent_budget).toFixed(2)} TON (~${fmt.money(+a.spent_budget || 0)})`,
    a.daily_budget_limit ? `📅 daily cap ${a.daily_budget_limit} TON` : '',
    a.remaining_budget != null ? `💼 remaining ${(+a.remaining_budget).toFixed(2)} TON` : '',
    a.text ? `\n📝 <i>${fmt.esc(String(a.text).slice(0, 200))}</i>` : '', t
  ].filter(Boolean).join('\n');
  await ctx.editOrSend(text, fmt.kb(kbRows));
}

async function adAction(ctx, id, action) {
  /* _go suffix = confirmed execution of a previously-gated action (router passes raw data) */
  const isGo = action.endsWith('_go');
  if (isGo) action = action.slice(0, -3);
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

module.exports = { adsMenu, adDetail, adAction };
