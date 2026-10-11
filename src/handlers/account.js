'use strict';
/* handlers/account.js — 🏦 ACCOUNTS: multi ads-account manager.
   Add multiple official Telegram Ads accounts (tokens), validate live on add
   (getCurrentAccount with the candidate token), switch the active one for ALL
   ads operations (board, create, launch, reports), cross-account balance board.
   Secrets: tokens stored in DB, NEVER echoed in chat (redacted to last 4). */

const adsapi = require('../adsapi');
const db = require('../db');
const fmt = require('../format');
const guard = require('../guard');
const { log } = require('../log');

const sessions = new Map(); // chatId → 'await_token' | 'await_label'
const TTL = 15 * 60e3;
const get = chatId => { const s = sessions.get(chatId); if (s && Date.now() - s.ts > TTL) { sessions.delete(chatId); return null; } return s || null; };
const put = (chatId, state) => sessions.set(chatId, { state, ts: Date.now() });
const kill = chatId => sessions.delete(chatId);

const mask = t => '••••' + String(t).slice(-4);

/* list accounts (not removed), newest first */
async function listAccounts() {
  return (await db.q(`select id,label,token,platform_username,balance_ton,is_default,created_at
                      from ad_accounts where not removed order by is_default desc, id desc`)) || [];
}

async function hub(ctx) {
  kill(ctx.chatId);
  const rows = await listAccounts();
  const cur = adsapi.accountLabel();
  const lines = [
    fmt.header('🏦', 'ACCOUNTS — ADS MANAGER'),
    '',
    `Active account: <b>${fmt.esc(cur)}</b>`,
    rows.length ? '' : '<i>No extra accounts yet — the env account runs the show.</i>'
  ];
  if (rows.length) {
    lines.push('');
    lines.push('<b>Saved accounts</b>');
    for (const a of rows) {
      lines.push(`${a.is_default ? '⭐' : '▫️'} <b>${fmt.esc(a.label)}</b> · ${mask(a.token)}${a.balance_ton != null ? ` · ${Number(a.balance_ton).toFixed(2)} TON` : ''}${a.is_default ? ' · <i>active</i>' : ''}`);
    }
  }
  lines.push('');
  lines.push('<b>Add account:</b> paste the ads platform token — it is validated LIVE before saving. Tokens are never shown in chat.');
  const kbRows = rows.slice(0, 6).map(a => [
    ...(a.is_default ? [] : [{ t: `▶️ Use ${fmt.esc(a.label.slice(0, 12))}`, c: `acc:sw:${a.id}` }]),
    { t: '💰', c: `acc:bal:${a.id}` },
    { t: '🗑️', c: `acc:rm:${a.id}`, style: 'danger' }
  ]);
  kbRows.push([{ t: '➕ Add account', c: 'acc:add', style: 'primary' }, { t: '💎 All balances', c: 'acc:bals' }]);
  kbRows.push([{ t: '⬅️ Menu', c: 'menu:main' }]);
  return ctx.editOrSend(lines.join('\n'), fmt.kb(kbRows));
}

async function addFlow(ctx) {
  put(ctx.chatId, 'await_token');
  return ctx.editOrSend([
    fmt.header('➕', 'ADD ADS ACCOUNT'),
    '',
    'Send the <b>ads platform token</b> for the new account.',
    'I will validate it against <code>getCurrentAccount</code> LIVE and save it only if it answers.',
    '',
    '<i>Token format: starts with “AA…” (Base64-ish string from Telegram Ads platform → Settings → API).</i>'
  ].join('\n'), fmt.kb([[{ t: '❌ Cancel', c: 'acc:cancel' }]]));
}

async function addToken(ctx, token) {
  if (token.length < 20 || /[^A-Za-z0-9_\-]/.test(token)) {
    return ctx.sm('❌ That does not look like an ads token (unexpected characters). Try again or /cancel.');
  }
  const wait = await ctx.sm(`🔑 <b>Validating token</b> <code>${mask(token)}</code> against the ads platform…`);
  let info = null, err = null;
  try { info = await adsapi.adsCall('getCurrentAccount', { token }); }
  catch (e) { err = e; }
  if (err || !info) {
    await guard.audit(ctx.from.id, 'account.add', {}, `ERROR ${err ? err.code || err.message : 'no answer'}`);
    return ctx.edit(wait.chat.id, wait.message_id, `❌ <b>Token rejected:</b> <i>${fmt.esc(adsapi.explain(err || new Error('platform returned nothing')))}</i>\nNot saved. Send another token or Cancel.`, fmt.kb([[{ t: '🔁 Retry', c: 'acc:add' }], [{ t: '❌ Cancel', c: 'acc:cancel' }]]));
  }
  const label = info?.account?.name || info?.name || `Account ${new Date().toISOString().slice(0, 10)}`;
  const bal = info?.remaining_budget ?? info?.account?.remaining_budget ?? null;
  const r = await db.q(
    `insert into ad_accounts(label,token,platform_username,balance_ton,added_by)
     values ($1,$2,$3,$4,$5)
     on conflict (token) do update set label=excluded.label, balance_ton=excluded.balance_ton, removed=false
     returning id`,
    [String(label).slice(0, 60), token, info?.username ?? null, bal, ctx.from.id]);
  await guard.audit(ctx.from.id, 'account.add', { label, id: r?.[0]?.id }, 'ok');
  kill(ctx.chatId);
  return ctx.edit(wait.chat.id, wait.message_id, [
    fmt.header('✅', 'ACCOUNT SAVED'),
    '',
    `🏷️ <b>${fmt.esc(String(label).slice(0, 40))}</b> · ${mask(token)}`,
    bal != null ? `💎 Balance: <b>${Number(bal).toFixed(2)} TON</b>` : '',
    '',
    'Switch to it from the Accounts hub to run ads on it.'
  ].filter(Boolean).join('\n'), fmt.kb([[{ t: '🏦 Accounts hub', c: 'acc:hub', style: 'primary' }], [{ t: '⬅️ Menu', c: 'menu:main' }]]));
}

async function switchTo(ctx, id) {
  const a = (await db.q(`select id,label,token from ad_accounts where id=$1 and not removed`, [id]))?.[0];
  if (!a) return ctx.answerCb('Account not found.');
  adsapi.setAccount(a.token, a.label);
  await db.q(`update ad_accounts set is_default=false where not removed`);
  await db.q(`update ad_accounts set is_default=true where id=$1`, [id]);
  await guard.audit(ctx.from.id, 'account.switch', { id: a.id, label: a.label }, 'ok');
  await ctx.answerCb(`Active: ${a.label}`);
  return hub(ctx);
}

async function balanceOf(ctx, id) {
  const a = (await db.q(`select id,label,token from ad_accounts where id=$1 and not removed`, [id]))?.[0];
  if (!a) return ctx.answerCb('Account not found.');
  try {
    const info = await adsapi.adsCall('getCurrentAccount', { token: a.token });
    const bal = info?.remaining_budget ?? null;
    await db.q(`update ad_accounts set balance_ton=$2 where id=$1`, [id, bal]);
    await ctx.answerCb(`${a.label}: ${bal != null ? Number(bal).toFixed(2) + ' TON' : 'n/a'}`);
  } catch (e) { await ctx.answerCb(`Balance failed: ${String(e.message).slice(0, 60)}`); }
  return;
}

async function balancesAll(ctx) {
  const wait = await ctx.sm('💎 <b>Checking all account balances…</b>');
  const rows = await listAccounts();
  const lines = [fmt.header('💎', 'ALL BALANCES'), ''];
  for (const a of rows.slice(0, 10)) {
    try {
      const info = await adsapi.adsCall('getCurrentAccount', { token: a.token });
      const bal = info?.remaining_budget ?? null;
      await db.q(`update ad_accounts set balance_ton=$2 where id=$1`, [a.id, bal]);
      lines.push(`${a.is_default ? '⭐' : '▫️'} <b>${fmt.esc(a.label)}</b> — ${bal != null ? Number(bal).toFixed(2) + ' TON' : 'n/a'}`);
    } catch (e) {
      lines.push(`${a.is_default ? '⭐' : '▫️'} <b>${fmt.esc(a.label)}</b> — ❌ ${fmt.esc(String(e.code || e.message).slice(0, 40))}`);
    }
  }
  lines.push('');
  lines.push('<i>Default env account always active unless you switch.</i>');
  return ctx.edit(wait.chat.id, wait.message_id, lines.join('\n'), fmt.kb([[{ t: '🏦 Accounts hub', c: 'acc:hub' }], [{ t: '⬅️ Menu', c: 'menu:main' }]]));
}

async function removeFlow(ctx, id, isGo) {
  const key = `acc:rm:${id}`;
  if (!isGo) {
    guard.askConfirm(key, { id });
    return ctx.editOrSend(`⚠️ <b>Remove this account from the bot?</b>\n<i>Ads already created keep running on the platform — this only detaches it here.</i>`, fmt.kb([
      [{ t: '✅ Yes, remove', c: `${key}:go`, style: 'danger' }], [{ t: '❌ Keep', c: 'acc:hub' }]]));
  }
  if (!guard.takeConfirm(key)) return ctx.answerCb('Confirm expired — tap remove again.');
  const a = (await db.q(`select id,label,token,is_default from ad_accounts where id=$1 and not removed`, [id]))?.[0];
  if (a) {
    await db.q(`update ad_accounts set removed=true, is_default=false where id=$1`, [id]);
    if (a.is_default || adsapi.accountLabel() === a.label) adsapi.clearAccount();
    await guard.audit(ctx.from.id, 'account.remove', { id: a.id, label: a.label }, 'ok');
  }
  return hub(ctx);
}

/* text intake for add-flow; returns true if consumed */
async function onText(ctx, text) {
  const s = get(ctx.chatId);
  if (!s) return false;
  if (s.state === 'await_token') {
    if (/^\/cancel/.test(text)) { kill(ctx.chatId); return ctx.sm('Add-account cancelled — nothing saved.'); }
    await addToken(ctx, text.trim());
    return true;
  }
  return false;
}

async function onCb(ctx, action, arg) {
  if (action === 'hub') return hub(ctx);
  if (action === 'add') return addFlow(ctx);
  if (action === 'cancel') { kill(ctx.chatId); return ctx.editOrSend('🏦 Add-account cancelled — nothing saved.', fmt.kb([[{ t: '🏦 Accounts hub', c: 'acc:hub' }], [{ t: '⬅️ Menu', c: 'menu:main' }]])); }
  if (action === 'sw' && arg) return switchTo(ctx, Number(arg));
  if (action === 'bal' && arg) return balanceOf(ctx, Number(arg));
  if (action === 'bals') return balancesAll(ctx);
  if (action === 'rm' && arg) {
    const d = String(arg).split(':');
    return removeFlow(ctx, Number(d[0]), d[1] === 'go');
  }
  return hub(ctx);
}

module.exports = { hub, onText, onCb, sessions: { get, put, kill } };
