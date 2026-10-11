'use strict';
/* handlers/drafts.js — campaign drafts → guarded launch into official Telegram Ads. */
const db = require('../db');
const adsapi = require('../adsapi');
const fmt = require('../format');
const guard = require('../guard');
const path = require('path');

async function draftsMenu(ctx) {
  const rows = await db.q(`select id,title,status,initial_budget,launched_ad_id from drafts where status in ('draft','failed') order by updated_at desc limit 8`);
  const kbRows = rows.map(d => [{ t: `📄 ${d.title.slice(0, 24)} (${d.status})`, c: `draft:${d.id}` }]);
  kbRows.push([{ t: '➕ New draft help', c: 'draft:help' }, { t: '⬅️ Menu', c: 'menu:main' }]);
  await ctx.editOrSend(
    '📋 <b>CAMPAIGN DRAFTS</b>\nLaunch = creates a REAL ad on the official Telegram Ads platform (spends real budget). Always confirm first.',
    fmt.kb(kbRows));
}

async function draftDetail(ctx, id) {
  const d = await db.one(`select * from drafts where id=$1`, [id]);
  if (!d) return ctx.answerCb('Draft not found');
  const kbRows = [[{ t: '🚀 Launch (1.8 TON)', c: `draft:${id}:lc` }],
                  [{ t: '🗑️ Archive', c: `draft:${id}:arch` }], [{ t: '⬅️ Drafts', c: 'menu:drafts' }]];
  const target = typeof d.target === 'string' ? JSON.parse(d.target) : d.target;
  await ctx.editOrSend([
    `📄 <b>DRAFT</b> <code>${id.slice(0, 8)}</code> · ${d.status}`,
    `🏷️ ${fmt.esc(d.title)}`,
    `📝 ${fmt.esc(d.text.slice(0, 250))}`,
    `🔗 ${fmt.esc(d.promote_url)}`,
    `🎯 <code>${fmt.esc(JSON.stringify(target).slice(0, 220))}</code>`,
    `💰 ${d.initial_budget} TON · cap ${d.daily_budget_limit ?? '—'}${d.launched_ad_id ? `\n🚀 launched as ad #${d.launched_ad_id}` : ''}`
  ].join('\n'), fmt.kb(kbRows));
}

async function launchFlow(ctx, id, confirmed) {
  if (!confirmed) {
    guard.askConfirm(`draft:${id}:launch`, { id });
    return ctx.editOrSend('⚠️ <b>LAUNCH will create a real ad and commit real budget (TON).</b>\nConfirm to proceed.',
      fmt.kb([[{ t: '🚀 CONFIRM LAUNCH', c: `draft:${id}:launch_go` }], [{ t: '❌ Cancel', c: `draft:${id}` }]]));
  }
  if (guard.alreadyDone(`launch:${id}`)) return ctx.answerCb('Launch already in progress/done — duplicate blocked.');
  const d = await db.one(`select * from drafts where id=$1`, [id]);
  if (!d) return ctx.answerCb('Draft not found');
  if (/REPLACE_ME/.test(d.promote_url)) return ctx.answerCb('Fix promote_url first (currently REPLACE_ME).');
  const target = typeof d.target === 'string' ? JSON.parse(d.target) : d.target;
  const msg = await ctx.sm('🚀 Launching on official Telegram Ads…');
  try {
    const r = await adsapi.createAd({
      title: d.title.slice(0, 60), text: d.text, promote_url: d.promote_url,
      cpm: Number(d.cpm), placement: d.placement, target,
      initial_budget: Number(d.initial_budget),
      ...(d.daily_budget_limit ? { daily_budget_limit: Number(d.daily_budget_limit) } : {})
    }, `draft-${id}-${Date.now()}`);
    const adId = r.ad_id ?? r?.ad?.ad_id ?? null;
    await db.q(`update drafts set status='launched', launched_ad_id=$2, last_error=null, updated_at=now() where id=$1`, [id, adId]);
    await guard.audit(ctx.from.id, 'draft.launch', { id, adId }, 'ok');
    await ctx.edit(msg.chat.id, msg.message_id, `${fmt.header('🚀', 'AD CREATED')}
${fmt.pill(r.status || 'in_review')} <b>#${adId}</b>
<i>In platform review now — track it in My Ads.</i>`, fmt.kb([[{ t: `📊 Open ad #${adId}`, c: `ad:${adId}` }]]));
    try { await ctx.sendAnimation(path.join(__dirname, '../../assets/launch.gif')); } catch { /* animation is decorative */ }
  } catch (e) {
    await db.q(`update drafts set status='failed', last_error=$2, updated_at=now() where id=$1`, [id, String(e.code || e.message).slice(0, 300)]);
    await guard.audit(ctx.from.id, 'draft.launch', { id }, `ERROR ${e.code || e.message}`);
    await ctx.edit(msg.chat.id, msg.message_id, `❌ <b>Launch failed:</b> <i>${fmt.esc(adsapi.explain(e))}</i>\nDraft kept as "failed" for retry.`, fmt.kb([[{ t: '⬅️ Drafts', c: 'menu:drafts' }]]));
  }
}

async function archive(ctx, id) {
  await db.q(`update drafts set status='archived', updated_at=now() where id=$1`, [id]);
  await guard.audit(ctx.from.id, 'draft.archive', { id }, 'ok');
  return draftsMenu(ctx);
}

module.exports = { draftsMenu, draftDetail, launchFlow, archive };
