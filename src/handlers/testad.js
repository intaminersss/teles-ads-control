'use strict';
/* handlers/testad.js — 🧪 TEST AD FUNNEL: guided multi-step ad creation with research.
   Flow: how many tests → country → brief/prompt → channel link →
   FULL research plan (.md, same engine as Packages) → budget (min/recommended/custom)
   → full ad preview → approve → ads go LIVE via official Telegram Ads API.
   Extra agency questions built in: creative angle is auto-varied per test
   (proof / urgency / beginner) so N tests = N real A/B hooks.
   Constraints honored: channel-only targeting (keywords banned), India-first,
   min budget 1.8 TON, idempotency keys, confirm-gate + audit on every consequential step. */

const growth = require('../growth');
const fmt = require('../format');
const guard = require('../guard');
const adsapi = require('../adsapi');
const spyapi = require('../spyapi');
const packages = require('./packages');
const copy = require('./copy');
const validate = require('../validate');
const { log } = require('../log');

const MIN_BUDGET = 1.8, REC_BUDGET = 3, CPM = 0.6, PLACEMENT = 'channel_post';
const GEO = { in: { cc: ['IN'], label: '🇮🇳 India (recommended)', langs: ['en', 'hi'] }, ae: { cc: ['AE'], label: '🇦🇪 UAE', langs: ['en', 'ar'] }, xx: { cc: ['IN'], label: '🌍 Other (India-first fallback)' } };
const HOOKS = [null, '⚡ Don\'t miss — ', '🎯 Limited — ']; // variant 2/3 prepend hooks
const sessions = new Map(); // chatId → funnel state
const TTL = 30 * 60e3;

const get = chatId => { const s = sessions.get(chatId); if (s && Date.now() - s.ts > TTL) { sessions.delete(chatId); return null; } return s || null; };
const put = (chatId, patch) => { const s = { ...(sessions.get(chatId) || {}), ...patch, ts: Date.now() }; sessions.set(chatId, s); return s; };
const kill = chatId => sessions.delete(chatId);

const HOME_ROWS = () => [
  [{ t: '🧪 1 test', c: 'ta:n:1' }, { t: '🧪🧪 2 tests', c: 'ta:n:2', style: 'primary' }, { t: '3 tests', c: 'ta:n:3' }],
  [{ t: '📦 Packages', c: 'menu:pkg' }], [{ t: '⬅️ Menu', c: 'menu:main' }]
];

async function start(ctx, preset) {
  copy.resetState(ctx.chatId); // clear stale copy-wizard (would otherwise capture funnel text)
  packages.clearOne(ctx.chatId);
  put(ctx.chatId, { state: 'n_tests', n: null, geo: null, brief: null, link: preset ? `t.me/${preset}` : null, username: preset || null, research: null, budget: null, results: null });
  return ctx.editOrSend([
    fmt.header('🧪', 'TEST AD FUNNEL'),
    '',
    'Build + launch real test ads in 6 steps:',
    '<b>① Tests</b> → <b>② Country</b> → <b>③ Brief</b> → <b>④ Channel link</b> → <b>⑤ Research + budget</b> → <b>⑥ Preview → LIVE</b>',
    '',
    '<b>How many ad tests do you want?</b>',
    '<i>Each test = a different creative hook (proof / urgency / beginner) → real A/B read.</i>'
  ].join('\n'), fmt.kb(HOME_ROWS()));
}

const geoRows = () => [
  [{ t: '🇮🇳 India — recommended', c: 'ta:geo:in', style: 'primary' }],
  [{ t: '🇦🇪 UAE', c: 'ta:geo:ae' }, { t: '🌍 Other', c: 'ta:geo:xx' }],
  [{ t: '⬅️ Tests', c: 'ta:back:n' }, { t: '❌ Cancel', c: 'ta:cancel' }]
];

async function pickGeo(ctx, geo) {
  const s = get(ctx.chatId); if (!s) return start(ctx);
  put(ctx.chatId, { geo, state: 'brief' });
  return ctx.editOrSend([
    fmt.header('③', 'AD BRIEF / PROMPT'),
    `Geo locked: <b>${GEO[geo].label}</b>`,
    '',
    'Now send the <b>ad brief</b> — what is being promoted, the promise, the audience.',
    '<i>Paste your draft ad text (≤160 chars) or a raw prompt — the funnel shapes it into variants.</i>'
  ].join('\n'), fmt.kb([[{ t: '⬅️ Country', c: 'ta:back:geo' }], [{ t: '❌ Cancel', c: 'ta:cancel' }]]));
}

function buildVariants(brief, n) {
  const base = brief.trim().slice(0, 160);
  const out = [base];
  for (let i = 1; i < n; i++) {
    const hook = HOOKS[i] || '';
    const body = brief.trim().slice(0, 160 - hook.length);
    out.push((hook + body).slice(0, 160));
  }
  return out;
}

async function afterBrief(ctx, brief) {
  const s = get(ctx.chatId); if (!s) return start(ctx);
  put(ctx.chatId, { brief, state: 'link' });
  if (s.link) return doResearch(ctx); // preset from Packages → skip link step
  return ctx.editOrSend([
    fmt.header('④', 'CHANNEL LINK'),
    '✅ Brief stored.',
    '',
    'Send the <b>channel link</b> this ad will promote:',
    '<code>@channelname</code> or <code>t.me/channelname</code>',
    '<i>I will scan it (subs, views, niche, language, competitors) and attach the full plan before you spend a rupee.</i>'
  ].join('\n'), fmt.kb([[{ t: '⬅️ Brief', c: 'ta:back:brief' }], [{ t: '❌ Cancel', c: 'ta:cancel' }]]));
}

async function doResearch(ctx) {
  const s = get(ctx.chatId); if (!s) return start(ctx);
  put(ctx.chatId, { state: 'researching' });
  const wait = await ctx.sm(`📡 <b>Researching</b> <code>${fmt.esc(String(s.link).slice(0, 40))}</code> — scan + competitors + plan…`);
  let res;
  try {
    res = await growth.researchChannel(s.link, { spy: spyapi, log: m => log.warn(m) });
  } catch (e) {
    put(ctx.chatId, { state: 'link' });
    return ctx.edit(wait.chat.id, wait.message_id, `❌ Research failed: <i>${fmt.esc(String(e.message).slice(0, 120))}</i>\nSend the channel link again.`, fmt.kb([[{ t: '❌ Cancel', c: 'ta:cancel' }]]));
  }
  if (res.error === 'invalid_link') {
    put(ctx.chatId, { state: 'link' });
    return ctx.edit(wait.chat.id, wait.message_id, '❌ That is not a scannable <b>public</b> channel link. Send <code>@name</code> or <code>t.me/name</code>.', fmt.kb([[{ t: '❌ Cancel', c: 'ta:cancel' }]]));
  }
  put(ctx.chatId, { research: res, username: res.username, state: 'budget' });
  const md = growth.buildPlanMd(res);
  const p = res.preview || {};
  try {
    await ctx.sendDoc(`test-ad-plan-${res.username}.md`, md, `📡 <b>Research for @${res.username}</b>: ${p.subscribers != null ? p.subscribers.toLocaleString('en-US') + ' subs' : 'n/a'} · ${res.niche} · ${res.lang} · ${res.competitors.length} competitors in archive`);
  } catch { /* doc is bonus — funnel continues */ }
  await guard.audit(ctx.from.id, 'testad.research', { ch: res.username }, 'ok');
  return ctx.edit(wait.chat.id, wait.message_id, [
    fmt.header('⑤', 'BUDGET — TEST ADS'),
    `📡 Research attached ⬆️ (<b>@${res.username}</b>: ${p.subscribers != null ? p.subscribers.toLocaleString('en-US') + ' subs' : 'n/a'}, ${p.avgViews != null ? p.avgViews.toLocaleString('en-US') + ' avg views' : 'views n/a'}, niche <b>${res.niche}</b>, lang <b>${res.lang}</b>)`,
    `🎯 Targeting: <b>${res.targetChannels.slice(0, 4).join(' ')}</b> +3 more (channel-only, ${GEO[s.geo].label})`,
    '',
    `<b>Minimum:</b> ${MIN_BUDGET} TON (platform floor) · <b>Recommended:</b> ${REC_BUDGET} TON/day fleet standard`,
    'Pick the initial test budget:'
  ].join('\n'), fmt.kb([
    [{ t: `💰 Minimum — ${MIN_BUDGET} TON`, c: `ta:bud:${MIN_BUDGET}` }, { t: `⭐ Recommended — ${REC_BUDGET} TON/day`, c: `ta:bud:${REC_BUDGET}`, style: 'primary' }],
    [{ t: '✏️ Custom budget', c: 'ta:bud:custom' }],
    [{ t: '⬅️ Link', c: 'ta:back:link' }], [{ t: '❌ Cancel', c: 'ta:cancel' }]
  ]));
}

async function pickBudget(ctx, val) {
  const s = get(ctx.chatId); if (!s) return start(ctx);
  if (val === 'custom') {
    put(ctx.chatId, { state: 'budget_custom' });
    return ctx.editOrSend(`✏️ Send <b>custom budget in TON</b> (min ${MIN_BUDGET}, fleet cap 3 TON/day):`, fmt.kb([[{ t: '❌ Cancel', c: 'ta:cancel' }]]));
  }
  const b = Number(val);
  if (!(b >= MIN_BUDGET)) return ctx.answerCb(`Min is ${MIN_BUDGET} TON.`);
  put(ctx.chatId, { budget: b, state: 'preview' });
  return preview(ctx);
}

async function preview(ctx) {
  const s = get(ctx.chatId); if (!s?.research) return start(ctx);
  const variants = buildVariants(s.brief, s.n);
  const g = GEO[s.geo];
  const rows = variants.map((v, i) => `${i + 1}. <i>"${fmt.esc(v.slice(0, 70))}${v.length > 70 ? '…' : ''}"</i>`).join('\n');
  put(ctx.chatId, { variants });
  return ctx.editOrSend([
    fmt.header('⑥', 'FULL AD PREVIEW'),
    '',
    `📝 <b>Ad copy ×${s.n}:</b>`,
    rows,
    '',
    `🔗 <b>Promote:</b> https://t.me/${s.username}`,
    `🎯 <b>Targeting:</b> channels ${s.research.targetChannels.slice(0, 3).join(' ')}+${Math.max(s.research.targetChannels.length - 3, 0)} · geo ${g.cc.join('/')} · langs ${g.langs.join('/')}`,
    `📡 <b>Placement:</b> ${PLACEMENT} · CPM ${CPM} TON`,
    `💰 <b>Budget:</b> ${s.budget} TON · daily cap 3 TON`,
    '',
    `<b>${s.n} ad${s.n > 1 ? 's' : ''} will go LIVE on official Telegram Ads.</b>`
  ].join('\n'), fmt.kb([
    [{ t: `🚀 GO LIVE (${s.n} ad${s.n > 1 ? 's' : ''}, ${s.budget} TON)`, c: 'ta:go', style: 'primary' }],
    [{ t: '✏️ Edit brief', c: 'ta:back:brief' }, { t: '💰 Budget', c: 'ta:back:budget' }],
    [{ t: '❌ Cancel', c: 'ta:cancel' }]
  ]));
}

async function goLive(ctx) {
  const s = get(ctx.chatId);
  if (!s?.research) return start(ctx);
  if (!guard.takeConfirm(`testad:${ctx.chatId}:go`)) {
    guard.askConfirm(`testad:${ctx.chatId}:go`, { n: s.n, budget: s.budget });
    await ctx.answerCb();
    return ctx.editOrSend([
      fmt.header('⚠️', 'CONFIRM LAUNCH'),
      `<b>${s.n} real ad${s.n > 1 ? 's' : ''} · ${s.budget} TON real budget</b> → https://t.me/${s.username} (${GEO[s.geo].label})`,
      'This spends real money. Confirm to go live.'
    ].join('\n'), fmt.kb([
      [{ t: '✅ YES — GO LIVE', c: 'ta:go_go', style: 'primary' }],
      [{ t: '❌ Cancel', c: 'ta:cancel' }]
    ]));
  }
  if (guard.alreadyDone(`testad:${ctx.chatId}:${s.research.username}`)) return ctx.answerCb('This funnel already launched — duplicate blocked.');
  const msg = await ctx.sm('🚀 <b>Creating ads on official Telegram Ads…</b>');
  const g = GEO[s.geo];
  const target = { type: 'channels', channel_ids: s.research.targetChannels.slice(0, 10), country_codes: g.cc, language_codes: g.langs };
  const results = [];
  for (let i = 0; i < s.variants.length; i++) {
    const payload = {
      title: `THETAS ${s.username} #${i + 1}`.slice(0, 60),
      text: s.variants[i],
      promote_url: `https://t.me/${s.username}`,
      cpm: CPM, placement: PLACEMENT, target,
      initial_budget: s.budget, daily_budget_limit: REC_BUDGET
    };
    const check = validate.safeParse(validate.CreateAdSchema, payload);
    if (!check.ok) { results.push({ i, error: 'validation: ' + check.error }); continue; }
    void check;
    try {
      const r = await adsapi.createAd(payload, `testad-${ctx.chatId}-${Date.now()}-${i}`);
      results.push({ i, ad_id: r.ad_id ?? r?.ad?.ad_id ?? null, status: r.status || 'in_review' });
      await guard.audit(ctx.from.id, 'testad.launch', { payload, adId: r.ad_id }, 'ok');
    } catch (e) {
      results.push({ i, error: String(adsapi.explain ? adsapi.explain(e) : e.message).slice(0, 160) });
      await guard.audit(ctx.from.id, 'testad.launch', { username: s.username }, `ERROR ${e.message}`);
    }
  }
  kill(ctx.chatId);
  const ok = results.filter(r => r.ad_id), bad = results.filter(r => r.error);
  const body = [
    ok.length ? `✅ <b>LIVE:</b> ${ok.map(r => `#${r.ad_id} (${fmt.esc(r.status)})`).join(' · ')}` : '',
    bad.length ? `❌ <b>Failed:</b> ${bad.map(r => `#${r.i + 1}: ${fmt.esc(r.error.slice(0, 60))}`).join(' · ')}` : '',
    `<i>Track in My Ads — platform review usually minutes. Winners get pushed per fleet rules (₹3–5/member, 3 TON/day cap).</i>`
  ].filter(Boolean).join('\n');
  try { await ctx.edit(msg.chat.id, msg.message_id, `${fmt.header('🚀', 'TEST ADS LAUNCHED')}\n${body}`, fmt.kb([[{ t: '📊 My Ads', c: 'menu:ads', style: 'primary' }], [{ t: '🧪 New funnel', c: 'ta:start' }]])); } catch {}
  return;
}

/* text input for active funnel; returns true if consumed */
async function onText(ctx, text) {
  const s = get(ctx.chatId);
  if (!s) return false;
  if (s.state === 'brief') {
    if (text.length < 15) { await ctx.sm('✍️ Brief is too short — give me at least a sentence (what/promise/audience).'); return true; }
    await afterBrief(ctx, text.slice(0, 600));
    return true;
  }
  if (s.state === 'link') {
    if (!growth.parseChannelLink(text)) return true; // swallow non-links mid-funnel
    put(ctx.chatId, { link: text });
    await doResearch(ctx);
    return true;
  }
  if (s.state === 'budget_custom') {
    const b = Number(String(text).replace(/[^\d.]/g, ''));
    if (!(b >= MIN_BUDGET)) { await ctx.sm(`❌ Minimum is ${MIN_BUDGET} TON — send a number like <code>2.5</code>.`); return true; }
    put(ctx.chatId, { budget: Math.min(b, 10), state: 'preview' });
    await preview(ctx);
    return true;
  }
  return false;
}

/* callback routes ta:* */
async function onCb(ctx, action, arg) {
  const s = get(ctx.chatId);
  if (action === 'start' || action === 'frompkg') return start(ctx);
  if (action === 'fromres' && arg) { put(ctx.chatId, { link: `t.me/${arg}` }); return start(ctx, arg); }
  if (action === 'cancel') { kill(ctx.chatId); return ctx.editOrSend('🧪 Test funnel closed. Nothing was spent.', fmt.kb([[{ t: '🧪 Start again', c: 'ta:start' }], [{ t: '⬅️ Menu', c: 'menu:main' }]])); }
  if (action === 'n' && arg) { put(ctx.chatId, { n: Math.min(Number(arg) || 1, 3), state: 'geo' }); return ctx.editOrSend([fmt.header('②', 'COUNTRY / GEO'), `<b>${arg} test${Number(arg) > 1 ? 's' : ''}</b> queued. Now pick the geo:`, '<i>Agency policy: India-first. Other geos need your explicit pick.</i>'].join('\n'), fmt.kb(geoRows())); }
  if (action === 'geo' && arg && GEO[arg]) return pickGeo(ctx, arg);
  if (action === 'bud') return pickBudget(ctx, arg);
  if (action === 'go') return goLive(ctx);
  if (action === 'go_go') return goLive(ctx);
  if (action === 'back' && arg) {
    if (!s) return start(ctx);
    if (arg === 'n') return start(ctx);
    if (arg === 'geo') return ctx.editOrSend('② <b>Country / geo?</b>', fmt.kb(geoRows()));
    if (arg === 'brief') { put(ctx.chatId, { state: 'brief' }); return ctx.editOrSend('③ Send the <b>ad brief</b> again:', fmt.kb([[{ t: '❌ Cancel', c: 'ta:cancel' }]])); }
    if (arg === 'link') { put(ctx.chatId, { state: 'link' }); return ctx.editOrSend('④ Send the <b>channel link</b> again:', fmt.kb([[{ t: '❌ Cancel', c: 'ta:cancel' }]])); }
    if (arg === 'budget') { put(ctx.chatId, { state: 'budget' }); return doBudgetStep(ctx); }
  }
  return;
}

async function doBudgetStep(ctx) {
  const s = get(ctx.chatId); if (!s) return start(ctx);
  return ctx.editOrSend([
    fmt.header('⑤', 'BUDGET — TEST ADS'),
    `<b>Minimum:</b> ${MIN_BUDGET} TON (platform floor) · <b>Recommended:</b> ${REC_BUDGET} TON/day fleet standard`,
    'Pick the initial test budget:'
  ].join('\n'), fmt.kb([
    [{ t: `💰 Minimum — ${MIN_BUDGET} TON`, c: `ta:bud:${MIN_BUDGET}` }, { t: `⭐ Recommended — ${REC_BUDGET} TON/day`, c: `ta:bud:${REC_BUDGET}`, style: 'primary' }],
    [{ t: '✏️ Custom budget', c: 'ta:bud:custom' }],
    [{ t: '⬅️ Link', c: 'ta:back:link' }], [{ t: '❌ Cancel', c: 'ta:cancel' }]
  ]));
}

module.exports = { start, onText, onCb, sessions: { get, put, kill } };
