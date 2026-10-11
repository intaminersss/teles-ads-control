'use strict';
/* handlers/ads.js — live ad board, per-ad detail, guarded actions (pause/resume/delete/edit cap). */
const adsapi = require('../adsapi');
const fmt = require('../format');
const guard = require('../guard');

async function adsMenu(ctx) {
  const acct = await adsapi.getCurrentAccount();
  const ads = await adsapi.getAdsList();
  const bal = acct?.remaining_budget != null ? `💰 Balance: <b>${acct.remaining_budget} TON</b>\n\n` : '';
  const kbRows = [[{ t: '🔄 Refresh', c: 'ads:refresh' }]];
  for (const a of ads.slice(0, 8)) kbRows.push([{ t: `#${a.ad_id} ${fmt.statusLabel(a.status)}`, c: `ad:${a.ad_id}` }]);
  kbRows.push([{ t: '⬅️ Menu', c: 'menu:main' }]);
  await ctx.editOrSend(`${bal}📊 <b>LIVE ADS BOARD</b>\n${fmt.adsBoard(ads)}`, fmt.kb(kbRows));
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
  const key = `ad:${id}:${action}`;
  const confirmables = { pause: 'PAUSE', resume: 'RESUME', del: 'DELETE', capup: 'DAILY CAP +1 TON' };
  if (['pause', 'resume', 'del', 'capup'].includes(action) && !ctx.data.endsWith('_go')) {
    guard.askConfirm(key, { id, action });
    return ctx.editOrSend(
      `⚠️ <b>Confirm: ${confirmables[action]} ad #${id}?</b>\nThis is a consequential live-platform action.`,
      fmt.kb([[{ t: `✅ Yes, ${confirmables[action]}`, c: `${key}_go` }], [{ t: '❌ Cancel', c: `ad:${id}` }]]));
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
    if (action === 'del' && result === 'ok') return ctx.editOrSend(`🗑️ #${id} deleted. Refund lands in balance automatically.`, fmt.kb([[{ t: '⬅️ Ads', c: 'menu:ads' }]]));
    return adDetail(ctx, id);
  } catch (e) {
    await guard.audit(ctx.from.id, `ad.${action}`, { id }, `ERROR ${e.code || e.message}`);
    return ctx.editOrSend(`❌ <b>${fmt.esc(adsapi.explain(e))}</b>`, fmt.kb([[{ t: '⬅️ Ads', c: 'menu:ads' }]]));
  }
}

module.exports = { adsMenu, adDetail, adAction };
