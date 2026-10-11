'use strict';
/* handlers/packages.js — 📦 PACKAGES: send a channel link → get a client-ready
   GROWTH PLAN (.md file) in the TelesAds house format: audit, competitors,
   target channels, 30-day plan + package pricing. Owner uses it to send users a plan.
   Flow: menu:pkg → bot asks for link → user sends link → typing… → plan.md delivered. */

const growth = require('../growth');
const fmt = require('../format');
const guard = require('../guard');
const spyapi = require('../spyapi');
const { log } = require('../log');

const sessions = new Map(); // chatId → { state, last: research result }
const TTL = 15 * 60e3;
const has = chatId => { const s = sessions.get(chatId); if (s && Date.now() - s.ts > TTL) { sessions.delete(chatId); return null; } return s || null; };
const put = (chatId, patch) => { const s = { ...(sessions.get(chatId) || {}), ...patch, ts: Date.now() }; sessions.set(chatId, s); return s; };

function menu(ctx) {
  put(ctx.chatId, { state: 'await_link' });
  return ctx.editOrSend(
    [
      fmt.header('📦', 'PACKAGES — CLIENT GROWTH PLAN'),
      '',
      'Send me a <b>channel link</b> and I will build a client-ready <b>Growth Plan (.md)</b>:',
      '① <b>Audit</b> — subscribers, avg views/post, view-rate, niche + language <i>(auto-detected)</i>',
      '② <b>Competitors</b> — live ad-archive advertisers in the same niche',
      '③ <b>Target channels</b> — proven same-niche channels we already run',
      '④ <b>30-day plan + packages</b> — Test $150–300 · Scale $1,000–1,500 (agency pricing)',
      '',
      '<i>Examples: <code>@channelname</code> · <code>t.me/channelname</code></i>',
      '<i>Private invite links (t.me/+…) can\'t be scanned — use a public username.</i>'
    ].join('\n'),
    fmt.kb([[{ t: '🧪 Turn last plan into Test Ad', c: 'ta:frompkg' }], [{ t: '⬅️ Menu', c: 'menu:main' }]])
  );
}

async function runPlan(ctx, linkText) {
  const wait = await ctx.sm(`📡 <b>Scanning</b> <code>${fmt.esc(linkText.slice(0, 40))}</code>…\n<i>public preview → niche → language → competitors → plan</i>`);
  try {
    const res = await growth.researchChannel(linkText, { spy: spyapi, log: m => log.warn(m) });
    if (res.error === 'invalid_link') {
      return ctx.edit(wait.chat.id, wait.message_id, `❌ ${fmt.header('📦', 'INVALID LINK')}\nSend a <b>public</b> channel link: <code>@name</code> or <code>t.me/name</code>\n<i>Private invites (t.me/+…) are not scannable.</i>`, fmt.kb([[{ t: '🔁 Try again', c: 'menu:pkg' }], [{ t: '⬅️ Menu', c: 'menu:main' }]]));
    }
    put(ctx.chatId, { state: 'idle', last: res, linkText });
    const md = growth.buildPlanMd(res);
    const p = res.preview || {};
    const stats = [
      `📊 <b>${fmt.esc(p.title || '@' + res.username)}</b> · ${p.subscribers != null ? p.subscribers.toLocaleString('en-US') + ' subs' : 'subs n/a'} · ${p.avgViews != null ? p.avgViews.toLocaleString('en-US') + ' avg views' : 'views n/a'}${p.viewRatePct != null ? ` · ${p.viewRatePct}% view-rate` : ''}`,
      `🧠 niche: <b>${res.niche}</b> · 🌐 lang: <b>${res.lang}</b> · 🏟️ competitors in archive: <b>${res.competitors.length}</b>`,
      `<i>Full plan is attached as .md — forward it to the client as-is.</i>`
    ].join('\n');
    await ctx.sendDoc(`growth-plan-${res.username}-${new Date().toISOString().slice(0, 10)}.md`, md, `${stats}\n\n<i>Fully Built By Agency @TelesAds (Telesads.com)</i>`);
    await guard.audit(ctx.from.id, 'packages.plan', { ch: res.username, niche: res.niche, lang: res.lang }, 'ok');
    return ctx.edit(wait.chat.id, wait.message_id, `${stats}\n\n✅ <b>Plan delivered above ⬆️</b> — want to turn this research into a live test ad?`, fmt.kb([
      [{ t: `🧪 Test Ad for @${res.username}`, c: `ta:fromres:${res.username}`, style: 'primary' }],
      [{ t: '📦 Another channel', c: 'menu:pkg' }], [{ t: '⬅️ Menu', c: 'menu:main' }]]));
  } catch (e) {
    log.warn(`packages: ${e.message}`);
    return ctx.edit(wait.chat.id, wait.message_id, `❌ ${fmt.header('📦', 'SCAN FAILED')}\n<code>${fmt.esc(String(e.message).slice(0, 160))}</code>\n<i>Channel may be private/blocked — try another.</i>`, fmt.kb([[{ t: '🔁 Try again', c: 'menu:pkg' }], [{ t: '⬅️ Menu', c: 'menu:main' }]]));
  }
}

/* returns true if the text was consumed by an active packages session */
async function onText(ctx, text) {
  const s = has(ctx.chatId);
  if (!s || s.state !== 'await_link') return false;
  const link = growth.parseChannelLink(text);
  if (!link) return false; // not a link → let other handlers try
  await runPlan(ctx, text);
  return true;
}

async function onCb(ctx, action) {
  if (action === 'again') { put(ctx.chatId, { state: 'await_link' }); return ctx.editOrSend('📡 Send the next channel link (<code>@name</code> / <code>t.me/name</code>):', fmt.kb([[{ t: '⬅️ Menu', c: 'menu:main' }]])); }
  if (action === 'last' && has(ctx.chatId)?.last) return runPlan(ctx, has(ctx.chatId).linkText);
  return menu(ctx);
}

/* silent clear for one chat (funnel-conflict prevention) */
const clearOne = chatId => sessions.delete(chatId);
module.exports = { menu, onText, onCb, sessions, clearOne };
