'use strict';
/* TELES ADS CONTROL — entrypoint: polling loop, router, health server. */
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
    sendAnimation: (filePath, caption) => tg.sendAnimation(chatId, filePath, caption),
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
  if (d.startsWith('ads:refresh')) return wrap(ctx, () => ads.adsMenu(ctx));
  if (d.startsWith('ad:')) { const [, id, act] = d.split(':'); return act ? wrap(ctx, () => ads.adAction(ctx, Number(id), act)) : wrap(ctx, () => ads.adDetail(ctx, Number(id))); }
  if (d.startsWith('res:q:')) return wrap(ctx, () => research.runSearch(ctx, d.slice(6)));
  if (d.startsWith('res:page:')) { const [, , q, p] = d.split(':'); return wrap(ctx, () => research.searchPage(ctx, q, Number(p))); }
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
  if (d === 'alr:digest') return wrap(ctx, () => alerts.toggleDigest(ctx));
  if (d === 'alr:bal5') return wrap(ctx, () => alerts.setBalanceAlert(ctx, 5));
  if (d === 'alr:bal10') return wrap(ctx, () => alerts.setBalanceAlert(ctx, 10));
  if (d === 'alr:baloff') return wrap(ctx, () => alerts.removeBalanceAlert(ctx));
  return ctx.answerCb();
}

async function mainMenu(ctx) {
  const name = ctx.from?.first_name || 'Boss';
  const text = [
    fmt.BRAND.line,
    `  <b>TELES ADS CONTROL</b>  v2`,
    `  <i>Telegram-native advertising desk</i>`,
    fmt.BRAND.line,
    `👋 ${fmt.esc(name)} — official Ads platform + research + AI.`,
    `<i>Pick a module below. Sensitive actions always ask first.</i>`
  ].join('\n');
  if (ctx.data === 'menu:main' && ctx.chatId) await ctx.editOrSend(text, MENU);
  else await ctx.sm(text, MENU);
}

function wrap(ctx, fn) {
  return fn().catch(async e => {
    log(`wrap error: ${redact(e.stack || e.message)}`);
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
  if (text.startsWith('/cancel')) return wrap(ctx, () => copy.cancel(ctx));
  if (text.startsWith('/health')) return wrap(ctx, () => admin.health(ctx));
  if (text.startsWith('/audit')) return wrap(ctx, () => admin.auditTail(ctx));
  if (text.startsWith('/ads')) return wrap(ctx, () => ads.adsMenu(ctx));

  if (await copy.onText(ctx, text)) return;
  if (research.researchMenu && /^[a-zA-Z0-9 @_]{3,40}$/.test(text) && !text.startsWith('/')) {
    // bare keyword -> research (quick path), unless a copy-studio step is active (handled above)
    return wrap(ctx, () => research.runSearch(ctx, text));
  }
}

/* ---- health HTTP server (Railway platform check; harmless for a polling worker) ---- */
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, mode: config.BOT_MODE, uptime: process.uptime(), lastUpdateAt: tg.stats().lastUpdateAt }));
}).listen(config.PORT, () => log(`health server on :${config.PORT}`));

/* ---- boot ---- */
process.telesStopped = stoppedGenerations; // runtime registry shared with copy handler

(async () => {
  log.info('TELES ADS CONTROL booting…');
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
  await tg.pollLoop(onUpdate, log);
})().catch(e => { log.error(`FATAL boot: ${e.stack || e.message}`); process.exit(1); });
