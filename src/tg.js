'use strict';
/* Minimal Telegram Bot API client — long-polling ONLY (BOT_MODE=webhook is forbidden by spec). */
const { config, redact } = require('./config');

const API = `https://api.telegram.org/bot${config.BOT_TOKEN}`;
let offset = 0;
let lastUpdateAt = 0;

async function call(method, body = {}, timeoutSec = 0) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), Math.max(10, timeoutSec + 10) * 1000);
  try {
    const res = await fetch(`${API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(timeoutSec ? { ...body, timeout: timeoutSec } : body),
      signal: ctl.signal
    });
    const j = await res.json().catch(() => ({ ok: false, description: 'bad-json' }));
    if (!j.ok) throw new Error(redact(j.description || `HTTP ${res.status}`));
    return j.result;
  } finally { clearTimeout(t); }
}

const sm = (chatId, text, kb) => call('sendMessage', {
  chat_id: chatId, text, parse_mode: 'HTML',
  link_preview_options: { is_disabled: true },
  ...(kb ? { reply_markup: kb } : {})
});
const edit = (chatId, msgId, text, kb) => call('editMessageText', {
  chat_id: chatId, message_id: msgId, text, parse_mode: 'HTML',
  link_preview_options: { is_disabled: true },
  ...(kb ? { reply_markup: kb } : {})
}).catch(e => (/not modified/.test(e.message) ? null : Promise.reject(e)));
const answerCb = (id, text) => call('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) }).catch(() => {});
const sendDoc = (chatId, filename, content, caption) => call('sendDocument', {
  chat_id: chatId, document: { filename, data: Buffer.from(content, 'utf8') }, caption
});
const getMe = () => call('getMe');

/** Long-poll loop. onUpdate(upd) should never throw. */
async function pollLoop(onUpdate, log) {
  const me = await getMe();
  log(`polling live as @${me.username} (id ${me.id}) — webhook mode disabled by config`);
  for (;;) {
    try {
      const ups = await call('getUpdates', {
        offset, timeout: 30,
        allowed_updates: ['message', 'callback_query']
      }, 35);
      for (const u of ups || []) {
        offset = u.update_id + 1;
        lastUpdateAt = Date.now();
        try { await onUpdate(u); }
        catch (e) { log(`handler error: ${redact(e.message)}`); }
      }
    } catch (e) {
      log(`poll error: ${redact(e.message)} — retry in 5s`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

module.exports = { call, sm, edit, answerCb, sendDoc, getMe, pollLoop, stats: () => ({ lastUpdateAt }) };
