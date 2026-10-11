'use strict';
/* THETAS AI — entrypoint: polling loop, router, health server. */
const http = require('http');
const { config, redact } = require('./config');
const tg = require('./tg');
const guard = require('./guard');
const fmt = require('./format');
const { MENU } = fmt;

const ads = require('./handlers/ads');
const research = require('./handlers/research');
const copy = require('./handlers/copy');
const drafts = require('./handlers/drafts');
const reports = require('./handlers/reports');
const alerts = require('./handlers/alerts');
const packages = require('./handlers/packages');
const account = require('./handlers/account');
const testad = require('./handlers/testad');
const admin = require('./handlers/admin');
const scheduler = require('./scheduler');

const { log } = require('./log');
const logLine = m => log.info(m);

/* ctx — wraps message/callback context for handlers */
function makeCtx(u) {
  const msg = u.message, cb = u.callback_query;
  const chatId = msg?.chat?.id || cb?.message?.chat?.id;
  const from = msg?.from || cb?.from;
  const ctx = {
    chatId, from,
    sm: (text, kb) => tg.sm(chatId, text, kb),
    sendDoc: (name, content, caption) => tg.sendDoc(chatId, name, content, caption),
    sendAnimation: (filePath, caption, kb) => tg.sendAnimation(chatId, filePath, caption, kb),
    answerCb: text => cb ? tg.answerCb(cb.id, text) : Promise.resolve(),
    data: cb?.data || '',
    editOrSend: (text, kb) => cb?.message ? tg.edit(chatId, cb.message.message_id, text, kb) : tg.sm(chatId, text, kb),
    edit: (c, m, text, kb) => tg.edit(c, m, text, kb)
  };
  return ctx;
}

/* ---- routers ---- */
async function routeMenu(ctx, sub) {
  switch (sub) {
    case 'main': case undefined: return mainMenu(ctx);
    case 'ads': return wrap(ctx, () => ads.adsMenu(ctx));
    case 'res': return wrap(ctx, () => research.researchMenu(ctx));
    case 'pkg': return wrap(ctx, () => packages.menu(ctx));
    case 'acc': return wrap(ctx, () => account.hub(ctx));
    case 'testad': return wrap(ctx, () => testad.start(ctx));
    case 'copy': return wrap(ctx, () => copy.copyMenu(ctx));
    case 'drafts': return wrap(ctx, () => drafts.draftsMenu(ctx));
    case 'rep': return wrap(ctx, () => reports.report(ctx, 1));
    case 'alr': return wrap(ctx, () => alerts.alertsMenu(ctx));
    case 'health': return wrap(ctx, () => admin.health(ctx));
    case 'about': return wrap(ctx, () => admin.about(ctx));
  }
}

async function routeCb(ctx) {
  const d = ctx.data;
  if (ctx.data && ctx.data !== 'noop') ctx.answerCb().catch(() => {}); // every tap acknowledged
  if (d.startsWith('menu:')) return routeMenu(ctx, d.slice(5));
  if (d.startsWith('ads:p')) return wrap(ctx, () => ads.adsMenu(ctx, Number(d.slice(5)) || 0));
  if (d.startsWith('ads:refresh')) return wrap(ctx, () => ads.adsMenu(ctx));
  if (d.startsWith('ad:')) { const [, id, act] = d.split(':'); return act ? wrap(ctx, () => ads.adAction(ctx, Number(id), act)) : wrap(ctx, () => ads.adDetail(ctx, Number(id))); }
  if (d.startsWith('res:q:')) return wrap(ctx, () => research.runSearch(ctx, d.slice(6)));
  if (d.startsWith('res:page:')) { const [, , q, p] = d.split(':'); return wrap(ctx, () => research.searchPage(ctx, q, Math.max(0, Number(p) || 0))); }
  if (d.startsWith('res:chk:')) return wrap(ctx, () => research.checkChannel(ctx, d.slice(8)));
  if (d.startsWith('res:save:')) return research.saveChannel(ctx, d.slice(9));
  if (d === 'res:lists') return wrap(ctx, () => research.lists(ctx));
  if (d.startsWith('res:csv:')) return wrap(ctx, () => research.exportCsv(ctx, Number(d.slice(8))));
  if (d === 'copy:cancel') return wrap(ctx, () => copy.cancel(ctx));
  if (d.startsWith('copy:tone:')) return wrap(ctx, () => copy.pickTone(ctx, d.slice(10)));
  if (d.startsWith('copy:lang:')) return wrap(ctx, () => copy.pickLang(ctx, d.slice(10)));
  if (d === 'copy:to_draft') return copy.toDraft(ctx);
  if (d.startsWith('draft:help')) return ctx.answerCb('Use ✍️ Copy Studio to create drafts, or insert rows into the drafts table.');
  if (d.startsWith('draft:')) {
    const [, id, act] = d.split(':');
    if (act === 'lc') return drafts.launchFlow(ctx, id, false);
    if (act === 'launch_go') return wrap(ctx, () => drafts.launchFlow(ctx, id, true));
    if (act === 'arch') return wrap(ctx, () => drafts.archive(ctx, id));
    return wrap(ctx, () => drafts.draftDetail(ctx, id));
  }
  if (d.startsWith('rep:csv:')) return wrap(ctx, () => reports.exportCsv(ctx, Number(d.slice(8))));
  if (d === 'rep:7') return wrap(ctx, () => reports.report(ctx, 7));
  if (d.startsWith('ads:sort:')) return wrap(ctx, () => ads.cycleSort(ctx, d.slice(9)));
  if (d === 'ads:winners') return wrap(ctx, () => ads.winners(ctx));
  if (d.startsWith('ads:bulk:')) { const [, , kind] = d.split(':'); return wrap(ctx, () => ads.bulk(ctx, kind)); }
  if (d.startsWith('acc:')) {
    const rest = d.slice(4); const i = rest.indexOf(':');
    const act = i === -1 ? rest : rest.slice(0, i);
    const arg = i === -1 ? null : rest.slice(i + 1);
    return wrap(ctx, () => account.onCb(ctx, act, arg));
  }
  if (d.startsWith('sec:')) return wrap(ctx, () => sectionScreen(ctx, d.slice(4)));
  if (d.startsWith('feat:')) {
    const [, a, b] = d.split(':');
    if (a === 'p') return wrap(ctx, () => catalogScreen(ctx, Number(b) || 0));
    return wrap(ctx, () => featureScreen(ctx, Number(a)));
  }
  if (d === 'alr:digest') return wrap(ctx, () => alerts.toggleDigest(ctx));
  if (d === 'alr:bal5') return wrap(ctx, () => alerts.setBalanceAlert(ctx, 5));
  if (d === 'alr:bal10') return wrap(ctx, () => alerts.setBalanceAlert(ctx, 10));
  if (d === 'alr:baloff') return wrap(ctx, () => alerts.removeBalanceAlert(ctx));
  if (d.startsWith('pkg:')) { const [, act] = d.split(':'); return wrap(ctx, () => packages.onCb(ctx, act)); }
  if (d.startsWith('ta:')) { const [, act, arg] = d.split(':'); return wrap(ctx, () => testad.onCb(ctx, act, arg)); }
  return ctx.answerCb();
}

const path = require('path');
const HERO = path.join(__dirname, '../assets/hero.gif');

async function mainMenu(ctx) {
  const name = ctx.from?.first_name || 'Boss';
  /* Returning via ⬅️ Menu button → fast edit-in-place (no re-sending media) */
  if (ctx.data === 'menu:main' && ctx.chatId) {
    const text = [
      `${fmt.header('⚙️', 'CONTROL DESK')}`,
      `Welcome back, <b>${fmt.esc(name)}</b>. Pick a module — sensitive actions always confirm first.`,
      ``,
      `<i>${fmt.BRAND.credit}</i>`
    ].join('\n');
    return ctx.editOrSend(text, MENU);
  }
  /* Fresh /start → cinematic hero: branded animation + caption + tiered keyboard */
  const caption = [
    `👋 <b>Welcome, ${fmt.esc(name)}!</b>`,
    `Your advertising desk: <b>live ads</b>, <b>channel research</b>, <b>AI copy</b> — official Telegram Ads platform.`,
    ``,
    `<i>${fmt.BRAND.credit}</i>`
  ].join('\n');
  try {
    return await ctx.sendAnimation(HERO, caption, MENU);
  } catch (e) {
    log.warn(`hero send failed (${e.message}) — text fallback`);
    const text = [
      `${fmt.header('⚙️', 'CONTROL DESK')}`,
      `Welcome, <b>${fmt.esc(name)}</b> — pick a module.`,
      ``,
      `<i>${fmt.BRAND.credit}</i>`
    ].join('\n');
    return ctx.sm(text, MENU);
  }
}

function wrap(ctx, fn) {
  return fn().catch(async e => {
    log.error(`wrap error: ${e.stack || e.message}`);
    try { await ctx.editOrSend(`❌ <i>${redact(e.message).slice(0, 200)}</i>`, MENU); } catch {}
  });
}

/* ---- update handler ---- */
const stoppedGenerations = new Map(); // chatId -> AbortController (streaming copy)
async function onUpdate(u) {
  if (u.stopped_message_generation) {
    const chatId = u.stopped_message_generation.chat?.id;
    const ctl = stoppedGenerations.get(chatId);
    if (ctl) { ctl.abort(); stoppedGenerations.delete(chatId); log.info(`user stopped generation in ${chatId}`); }
    return;
  }
  const ctx = makeCtx(u);
  if (!ctx.from) return;
  if (!guard.isAllowed(ctx.from.id)) {
    return tg.sm(ctx.chatId, '⛔ Not authorized. This console is restricted.').catch(() => {});
  }
  if (guard.rateLimited(ctx.from.id)) return ctx.answerCb('Slow down — rate limit.');
  await guard.upsertUser(ctx.from);

  if (u.callback_query) return routeCb(ctx);

  const msg = u.message;
  if (!msg?.text) return;
  const text = msg.text.trim();

  if (text.startsWith('/start') || text.startsWith('/menu')) return mainMenu(ctx);
  if (text.startsWith('/cancel')) return wrap(ctx, async () => {
    const closed = [];
    if (testad.sessions.get(ctx.chatId)) { testad.sessions.kill(ctx.chatId); closed.push('🧪 Test-Ad funnel'); }
    if (packages.sessions.has(ctx.chatId)) { packages.sessions.delete(ctx.chatId); closed.push('📦 Packages'); }
    if (account.sessions.get(ctx.chatId)) { account.sessions.kill(ctx.chatId); closed.push('🏦 Add-account'); }
    if (copy.resetState(ctx.chatId)) closed.push('✍️ Copy Studio');
    return ctx.sm(closed.length
      ? `${fmt.header('✅', 'CANCELLED')}\nClosed: <b>${closed.join(' · ')}</b>\n<i>Nothing was launched, nothing was spent.</i>`
      : 'Nothing to cancel — you are not in a workflow.');
  });
  if (text.startsWith('/health')) return wrap(ctx, () => admin.health(ctx));
  if (text.startsWith('/audit')) return wrap(ctx, () => admin.auditTail(ctx));
  if (text.startsWith('/ads')) return wrap(ctx, () => ads.adsMenu(ctx));

  if (await copy.onText(ctx, text)) return;
  if (await account.onText(ctx, text)) return;
  if (await testad.onText(ctx, text)) return;
  if (await packages.onText(ctx, text)) return;
  if (research.researchMenu && /^[a-zA-Z0-9 @_]{3,40}$/.test(text) && !text.startsWith('/')) {
    // bare keyword -> research (quick path), unless a copy-studio step is active (handled above)
    return wrap(ctx, () => research.runSearch(ctx, text));
  }
}

/* ---- health HTTP server (Railway platform check; harmless for a polling worker) ---- */
const healthHandler = (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, product: 'THETAS AI', built_by: '@TelesAds (Telesads.com)', mode: config.BOT_MODE, uptime: process.uptime(), lastUpdateAt: tg.stats().lastUpdateAt }));
};
const healthSrv = http.createServer(healthHandler);
healthSrv.on('error', e => logLine(`health server skipped: ${e.code || e.message}`));
healthSrv.listen(config.PORT, () => logLine(`health server on :${config.PORT}`));
healthSrv.unref(); // never hold the process/event loop open (tests exit clean)

/* ---- boot (only when run directly; require() exports router for tests) ---- */
process.telesStopped = stoppedGenerations; // runtime registry shared with copy handler

/* ---- v6 feature hub screens (data-driven from fmt.CATALOG) ---- */
function sectionScreen(ctx, sid) {
  const meta = fmt.SECTION_META[sid];
  if (!meta) return ctx.editOrSend('❌ Unknown section.', MENU);
  const feats = fmt.catalogSection(sid);
  return ctx.editOrSend(
    `${fmt.header(meta.i, meta.t)}\n<i>${feats.length} features — tap for detail</i>`,
    fmt.kb([
      ...feats.map(f => [{ t: `${f.i}  ${f.n}`, c: `feat:${f.idx}` }]),
      [{ t: '📜 All features', c: 'feat:p:0' }, { t: '⬅️ Desk', c: 'menu:main' }]
    ]));
}
function catalogScreen(ctx, page) {
  const { items, page: p, pages, total } = fmt.catalogPage(page);
  return ctx.editOrSend(
    `${fmt.header('📜', `ALL FEATURES — ${total} total`)}\n<i>page ${p + 1}/${pages} — tap any for detail + shortcut</i>`,
    fmt.kb([
      ...items.map(f => [{ t: `${f.i}  ${f.n}`, c: `feat:${f.idx}` }]),
      [...(p > 0 ? [{ t: '◀️ Prev', c: `feat:p:${p - 1}` }] : []), ...(p < pages - 1 ? [{ t: 'Next ▶️', c: `feat:p:${p + 1}` }] : [])],
      [{ t: '⬅️ Desk', c: 'menu:main' }]
    ]));
}
function featureScreen(ctx, idx) {
  const f = fmt.feature(idx);
  if (!f) return ctx.editOrSend('❌ Feature not found.', MENU);
  const meta = fmt.SECTION_META[f.s];
  return ctx.editOrSend(
    [
      `${f.i} <b>${fmt.esc(f.n)}</b>`,
      `<i>${meta ? meta.i + ' ' + meta.t : f.s}</i>`,
      '',
      fmt.esc(f.d)
    ].join('\n'),
    fmt.kb([
      ...(f.cb ? [[{ t: '▶️ Open now', c: f.cb, style: 'primary' }]] : []),
      [{ t: '⬅️ Catalog', c: `feat:p:${Math.floor(idx / 8)}` }, { t: '🏠 Desk', c: 'menu:main' }]
    ]));
}

module.exports = { onUpdate, makeCtx, routeCb, mainMenu, stoppedGenerations };

if (require.main === module) (async () => {
  log.info('THETAS AI booting…');
  const me = await tg.getMe();
  await tg.call('setMyCommands', { commands: [
    { command: 'start', description: 'Open the control desk' },
    { command: 'ads', description: 'Live ads board' },
    { command: 'health', description: 'System health' },
    { command: 'audit', description: 'Recent action log' }
  ] }).catch(e => log.warn(`setMyCommands: ${e.message}`));
  log.info(`authorized as @${me.username}`);
  if (config.BOT_MODE !== 'polling') log.warn('BOT_MODE != polling — spec forbids webhook; forcing polling.');
  scheduler.start(logLine);
  await tg.pollLoop(onUpdate, logLine);
})().catch(e => { log.error(`FATAL boot: ${e.stack || e.message}`); process.exit(1); });
