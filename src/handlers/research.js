'use strict';
/* handlers/research.js — channel discovery via tgadsspy + Telegram Ads placement validation + saved lists + CSV export. */
const spyapi = require('../spyapi');
const adsapi = require('../adsapi');
const db = require('../db');
const fmt = require('../format');

async function researchMenu(ctx) {
  await ctx.editOrSend(
    '🔬 <b>CHANNEL RESEARCH</b>\nSend a keyword to discover advertiser-active channels.\n\n' +
    'Data source: tgadsspy ads archive (observed ad activity — not audience guarantees).',
    fmt.kb([
      [{ t: '🔥 Trading', c: 'res:q:trading' }, { t: '💰 Forex', c: 'res:q:forex' }],
      [{ t: '🪙 Crypto', c: 'res:q:crypto' }, { t: '📣 Marketing', c: 'res:q:marketing' }],
      [{ t: '📁 Saved lists', c: 'res:lists' }], [{ t: '⬅️ Menu', c: 'menu:main' }]
    ]));
}

const RESEARCH_PAGE = 6;
const searchState = new Map(); // chatId -> {query, rows, page}

async function runSearch(ctx, query, page = 0) {
  if (searchState.has(ctx.chatId) && searchState.get(ctx.chatId).query === query && page > 0) {
    return renderResults(ctx, page);
  }
  const t0 = Date.now();
  let st = await ctx.editOrSend(`${fmt.header('🔬', 'RESEARCH')}
${fmt.spin(0)} connecting to tgadsspy archive…`);
  let spinI = 0;
  const tick = setInterval(() => { spinI++; ctx.edit(st.chat.id, st.message_id, `${fmt.header('🔬', 'RESEARCH')}
${fmt.spin(spinI)} scanning advertisers for “<b>${fmt.esc(query)}</b>”…`).catch(() => {}); }, 1200);
  let rows, source;
  try {
    const r = await spyapi.searchChannels({ q: query, limit: 24 });
    rows = r.rows; source = r.source;
  } finally { clearInterval(tick); }
  if (!rows.length) {
    return ctx.editOrSend(`📭 No channels found for “${fmt.esc(query)}”. Try a broader keyword.`,
      fmt.kb([[{ t: '⬅️ Research', c: 'menu:res' }]]));
  }
  for (const r of rows) {
    await db.q(`insert into channels(username,title,members,niche,geo,lang,raw,updated_at)
                values ($1,$2,$3,$4,$5,$6,$7,now())
                on conflict (username) do update set title=$2, members=$3, niche=$4, updated_at=now()`,
      [r.username, r.title, r.members, r.niche, r.geo, r.lang, JSON.stringify(r)]);
  }
  searchState.set(ctx.chatId, { query, rows, page: 0 });
  const ms = Date.now() - t0;
  st = await ctx.editOrSend(`${fmt.header('🔬', 'RESULTS')}
✅ <b>${rows.length}</b> advertiser-active accounts in <code>${ms}ms</code>
<i>${fmt.esc(source)}</i>`);
  return renderResults(ctx, 0);
}

async function renderResults(ctx, page) {
  const { query, rows } = searchState.get(ctx.chatId) || {};
  if (!rows) return ctx.answerCb('Run a search first');
  const pages = Math.ceil(rows.length / RESEARCH_PAGE);
  page = Math.min(page, pages - 1);
  const slice = rows.slice(page * RESEARCH_PAGE, page * RESEARCH_PAGE + RESEARCH_PAGE);
  const kbRows = slice.map((r, i) => [{ t: `${page * RESEARCH_PAGE + i + 1}. ${(r.title || r.username).slice(0, 24)}`, c: `res:chk:${r.username}` }]);
  kbRows.push(...fmt.pagerRows(page, pages, `res:page:${query}`));
  kbRows.push([{ t: '⬅️ Research', c: 'menu:res' }]);
  return ctx.editOrSend(
    `${fmt.header('🔬', `“${query}”`)}
` +
    slice.map((r, i) => fmt.channelCard(r, page * RESEARCH_PAGE + i)).join('\n\n') +
    `\n\n<i>Observed ad activity — not audience guarantees. Tap to validate for Ads placements.</i>`,
    fmt.kb(kbRows));
}

async function searchPage(ctx, query, page) {
  const st = searchState.get(ctx.chatId);
  if (st && st.query === query) return renderResults(ctx, page);
  return runSearch(ctx, query, 0);
}

async function researchFail(ctx, e) {
  return ctx.editOrSend(`❌ Research failed: <i>${fmt.esc(e.message)}</i>`, fmt.kb([[{ t: '⬅️ Research', c: 'menu:res' }]]));
}

async function checkChannel(ctx, username) {
  let verdict = `✅ <b>@${fmt.esc(username)}</b> — accepted by Telegram Ads (eligible placement).`;
  try { await adsapi.getTargetChannel(`@${username}`); }
  catch (e) {
    verdict = e.code === 'CHANNEL_TOO_SMALL'
      ? `❌ <b>@${fmt.esc(username)}</b> — CHANNEL_TOO_SMALL (below platform minimum).`
      : `⚠️ <b>@${fmt.esc(username)}</b> — <code>${fmt.esc(e.code || e.message)}</code>`;
  }
  return ctx.editOrSend(verdict, fmt.kb([
    [{ t: '💾 Save to list', c: `res:save:${username}` }],
    [{ t: '⬅️ Research', c: 'menu:res' }]]));
}

async function saveChannel(ctx, username) {
  const list = await db.one(`select id from research_lists order by id limit 1`);
  let listId = list?.id;
  if (!listId) listId = (await db.q(`insert into research_lists(name,created_by) values ('default',$1) returning id`, [ctx.from.id]))[0].id;
  await db.q(`insert into research_list_items(list_id,username) values ($1,$2) on conflict do nothing`, [listId, username]);
  await ctx.answerCb(`@${username} saved to list “default”`);
}

async function lists(ctx) {
  const ls = await db.q(`select l.id, l.name, count(i.username)::int n
                         from research_lists l left join research_list_items i on i.list_id = l.id
                         group by l.id, l.name order by l.id`);
  const kbRows = ls.map(l => [{ t: `📁 ${l.name} (${l.n})`, c: `res:csv:${l.id}` }]);
  kbRows.push([{ t: '⬅️ Research', c: 'menu:res' }]);
  return ctx.editOrSend(
    ls.length ? '📁 <b>SAVED RESEARCH LISTS</b>\nTap a list to export as CSV.'
              : '📭 No saved lists yet — search and save channels first.',
    fmt.kb(kbRows));
}

async function exportCsv(ctx, listId) {
  const l = await db.one(`select name from research_lists where id=$1`, [listId]);
  const rows = await db.q(`select i.username, c.title, c.members, c.niche, i.note, i.added_at
                           from research_list_items i left join channels c on c.username = i.username
                           where i.list_id=$1 order by i.added_at`, [listId]);
  if (!rows.length) return ctx.answerCb('List is empty');
  const csv = fmt.toCsv(rows.map(r => ({ username: '@' + r.username, title: r.title, members: r.members, niche: r.niche, note: r.note || '', added_at: r.added_at?.toISOString?.() || r.added_at })));
  await ctx.sendDoc(`teles-research-${l?.name || listId}.csv`, csv, `📄 ${rows.length} channels — source: tgadsspy + Telegram Ads validation (${new Date().toISOString().slice(0, 10)})`);
}

module.exports = { researchMenu, runSearch, searchPage, researchFail, checkChannel, saveChannel, lists, exportCsv };
