'use strict';
/* handlers/copy.js v3 — AI Copy Studio (THETAS AI).
   STREAMING UX via official sendMessageDraft (Bot API 10.3, verified contract):
   - stable draft_id → Telegram animates diffs; empty text = "Thinking…"
   - can_stop=true → user gets Stop button → stopped_message_generation → AbortController
   - final result persisted with real sendMessage (drafts are 30s ephemeral — official note)
   Conversation hardening (spec §3.5 without grammY): cancel button, 5-min timeout,
   input validation, state recovery (offer text kept if user re-enters). */
const ai = require('../ai');
const db = require('../db');
const fmt = require('../format');
const tg = require('../tg');
const guard = require('../guard');
const { z } = require('zod');
const { config } = require('../config');

const TONES = { confident: 'confident and professional', friendly: 'friendly and approachable', urgent: 'urgent and action-driven', premium: 'premium and exclusive' };
const LANGS = { en: 'English', hi: 'Hinglish (Hindi-English mix, Devanagari-free)', ar: 'Arabic' };

const SYSTEM = `You write Telegram Ads copy. HARD POLICY RULES (finance ads): never promise guaranteed returns/profits; no "guaranteed", "risk-free", "100%", no income figures presented as typical; no superlatives like "best". Keep each variant under 160 characters. Output EXACTLY 3 numbered variants, nothing else.`;

const OfferSchema = z.string().min(10, 'describe the offer in at least 10 characters').max(500);

const DRAFT_TTL = 5 * 60 * 1000;
const state = new Map(); // chatId -> {step, offer, tone, lang, variants, expires, draftId}
function sweep() { const now = Date.now(); for (const [k, v] of state) if (v.expires && v.expires < now) { state.delete(k); } }
setInterval(sweep, 60000).unref();

const freshState = chatId => {
  const s = { step: 'offer', expires: Date.now() + DRAFT_TTL, draftId: (chatId % 100000) + 1 };
  state.set(chatId, s);
  return s;
};

async function copyMenu(ctx) {
  const s = freshState(ctx.chatId);
  await ctx.editOrSend(
    `${fmt.header('✍️', 'COPY STUDIO')}\nDescribe your offer — <b>what</b> are you advertising, <b>to whom</b>?\n\nExample: <i>free gold &amp; forex signals telegram channel, indian traders</i>\n\n<i>Timeout: 5 min · send /cancel to abort anytime</i>`,
    fmt.kb([[{ t: '❌ Cancel', c: 'copy:cancel', style: 'danger' }], [{ t: '⬅️ Menu', c: 'menu:main' }]]));
  return s;
}

/* /cancel — works from any conversation state */
async function cancel(ctx) {
  if (!state.has(ctx.chatId)) return ctx.sm('Nothing to cancel — you are not in a workflow.');
  state.delete(ctx.chatId);
  await ctx.sm(`${fmt.header('✅', 'CANCELLED')}\nWorkflow closed. Nothing was launched, nothing was spent.`);
}

/* offer text intake — validated, recoverable */
async function onText(ctx, text) {
  const st = state.get(ctx.chatId);
  if (!st) return false;
  if (st.step === 'offer') {
    const check = OfferSchema.safeParse(text.trim());
    if (!check.success) {
      await ctx.sm(`⚠️ ${check.error.issues[0].message}. Try again, or /cancel.`);
      return true;
    }
    st.offer = check.data; st.step = 'tone'; st.expires = Date.now() + DRAFT_TTL;
    await ctx.sm(`${fmt.header('🎛️', 'STEP 2/3 — TONE')}\nOffer saved: <i>${fmt.esc(st.offer.slice(0, 120))}</i>\n\nPick a tone:`,
      fmt.kb([
        [{ t: '💼 Confident', c: 'copy:tone:confident' }, { t: '🤝 Friendly', c: 'copy:tone:friendly' }],
        [{ t: '⚡ Urgent', c: 'copy:tone:urgent' }, { t: '👑 Premium', c: 'copy:tone:premium' }],
        [{ t: '❌ Cancel', c: 'copy:cancel', style: 'danger' }, { t: '⬅️ Menu', c: 'menu:main' }]]));
    return true;
  }
  return false;
}

async function pickTone(ctx, tone) {
  const st = state.get(ctx.chatId); if (!st?.offer) return ctx.answerCb('Offer first — send text');
  st.tone = tone; st.step = 'lang'; st.expires = Date.now() + DRAFT_TTL;
  await ctx.sm(`${fmt.header('🌐', 'STEP 3/3 — LANGUAGE')}\nTone: <b>${TONES[tone].split(' and ')[0]}</b>. Output language:`,
    fmt.kb([
      [{ t: '🇬🇧 English', c: 'copy:lang:en' }, { t: '🇮🇳 Hinglish', c: 'copy:lang:hi' }, { t: '🇦🇪 Arabic', c: 'copy:lang:ar' }],
      [{ t: '❌ Cancel', c: 'copy:cancel', style: 'danger' }, { t: '⬅️ Menu', c: 'menu:main' }]]));
}

/* STREAMING generation via official sendMessageDraft + abortable fetch */
async function pickLang(ctx, lang) {
  const st = state.get(ctx.chatId); if (!st?.offer) return ctx.answerCb('Start over — send your offer');
  st.lang = lang;
  await tg.typing(ctx.chatId);
  await tg.sendDraft(ctx.chatId, st.draftId, '', { canStop: true }); // official "Thinking…" placeholder

  const stopped = process.telesStopped;
  const ctl = new AbortController();
  if (stopped) stopped.set(ctx.chatId, ctl);
  const t0 = Date.now();
  let streamErr = null;
  let result = null;
  try {
    result = await ai.chat(
      [{ role: 'system', content: SYSTEM },
       { role: 'user', content: `Offer: ${st.offer}\nTone: ${TONES[st.tone]}\nLanguage: ${LANGS[st.lang]}\nAd must drive users to open a Telegram bot. Output 3 numbered variants.` }],
      { purpose: 'copy', tgId: ctx.from.id, maxTokens: 900, signal: ctl.signal,
        onDelta: delta => { /* streamed partial drafts */ tg.sendDraft(ctx.chatId, st.draftId, delta); } });
  } catch (e) { streamErr = e; }
  finally { if (stopped) stopped.delete(ctx.chatId); }

  if (streamErr) {
    const cancelled = /stopped by user/i.test(streamErr.message);
    return ctx.sm(cancelled
      ? `${fmt.header('🛑', 'STOPPED')}\nGeneration stopped — nothing spent beyond tokens already used.`
      : `${fmt.header('❌', 'AI UNAVAILABLE')}\n<i>${fmt.esc(streamErr.budget ? streamErr.message : String(streamErr.message).slice(0, 200))}</i>`,
      fmt.kb([[{ t: '🔁 Try again', c: 'menu:copy' }], [{ t: '⬅️ Menu', c: 'menu:main' }]]));
  }

  st.variants = result.text;
  const defaultTarget = config.DEFAULT_TARGET_JSON || '{"type":"users","topic_ids":[12,26,7],"language_codes":["en"],"country_codes":["IN","AE"]}';
  try { st.target = JSON.parse(defaultTarget); } catch { st.target = { type: 'users' }; }
  /* persist final — drafts are ephemeral (official note), real message required */
  await ctx.sm(
    `${fmt.header('✅', '3 VARIANTS READY')}${result.meta.skipped_providers?.length ? `\n⚠️ circuit-skipped: ${fmt.esc(result.meta.skipped_providers.join(', '))}` : ''}\n${fmt.esc(result.text)}\n\n${fmt.BRAND.lineThin}\n<i>AI recommendation — NOT a performance guarantee · ${result.meta.provider}/${result.meta.model} · ${result.meta.attempts} attempt(s) · est. $${result.meta.est_cost_usd} · ${(Date.now() - t0) / 1000 | 0}s</i>`,
    fmt.kb([[{ t: '📋 Save all as draft', c: 'copy:to_draft' }], [{ t: '🔁 Regenerate', c: `copy:regen:${st.tone}:${st.lang}` }], [{ t: '⬅️ Menu', c: 'menu:main' }]]));
  state.set(ctx.chatId, st);
}

async function toDraft(ctx) {
  const st = state.get(ctx.chatId); if (!st?.variants) return ctx.answerCb('Nothing to save — generate variants first');
  const first = st.variants.match(/^\s*(?:\d[.)]\s*)?(.+)/)?.[1]?.slice(0, 150) || st.offer.slice(0, 100);
  const d = await db.q(`insert into drafts(title,text,promote_url,target,initial_budget,daily_budget_limit,created_by)
                        values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [`AI copy ${new Date().toISOString().slice(0, 10)}`, first, 'https://t.me/REPLACE_ME', JSON.stringify(st.target), 1.8, 2, ctx.from.id]);
  await guard.audit(ctx.from.id, 'copy.toDraft', {}, `draft ${d[0].id.slice(0, 8)}`);
  await ctx.answerCb(`Draft saved (${d[0].id.slice(0, 8)}) — set a real promote_url in Drafts!`);
}

module.exports = { copyMenu, onText, pickTone, pickLang, toDraft, cancel };
