'use strict';
/* handlers/copy.js — AI Copy Studio: ad-copy drafts with platform-policy guardrails. */
const ai = require('../ai');
const db = require('../db');
const fmt = require('../format');
const { config } = require('../config');

const TONES = { confident: 'confident and professional', friendly: 'friendly and approachable', urgent: 'urgent and action-driven', premium: 'premium and exclusive' };
const LANGS = { en: 'English', hi: 'Hinglish (Hindi-English mix, Devanagari-free)', ar: 'Arabic' };

const SYSTEM = `You write Telegram Ads copy. HARD POLICY RULES (finance ads): never promise guaranteed returns/profits; no "guaranteed", "risk-free", "100%", no income figures presented as typical; no superlatives like "best". Keep each variant under 160 characters. Output EXACTLY 3 numbered variants, nothing else.`;

const state = new Map(); // chatId -> {step, tone, lang}

async function copyMenu(ctx) {
  state.delete(ctx.chatId);
  await ctx.editOrSend(
    '✍️ <b>AI COPY STUDIO</b>\nDescribe your offer (what are you advertising, to whom?).\n\nExample: <i>free gold & forex signals telegram channel, indian traders</i>',
    fmt.kb([[{ t: '⬅️ Menu', c: 'menu:main' }]]));
  state.set(ctx.chatId, { step: 'offer' });
}

async function onText(ctx, text) {
  const st = state.get(ctx.chatId);
  if (!st) return false;
  if (st.step === 'offer') {
    st.offer = text.slice(0, 500); st.step = 'tone';
    await ctx.sm('🎛️ Pick a tone:', fmt.kb([
      [{ t: '💼 Confident', c: 'copy:tone:confident' }, { t: '🤝 Friendly', c: 'copy:tone:friendly' }],
      [{ t: '⚡ Urgent', c: 'copy:tone:urgent' }, { t: '👑 Premium', c: 'copy:tone:premium' }],
      [{ t: '⬅️ Menu', c: 'menu:main' }]]));
    return true;
  }
  return false;
}

async function pickTone(ctx, tone) {
  const st = state.get(ctx.chatId); if (!st) return;
  st.tone = tone; st.step = 'lang';
  await ctx.sm('🌐 Output language:', fmt.kb([
    [{ t: '🇬🇧 English', c: 'copy:lang:en' }, { t: '🇮🇳 Hinglish', c: 'copy:lang:hi' }, { t: '🇦🇪 Arabic', c: 'copy:lang:ar' }],
    [{ t: '⬅️ Menu', c: 'menu:main' }]]));
}

async function pickLang(ctx, lang) {
  const st = state.get(ctx.chatId); if (!st?.offer) return;
  st.lang = lang;
  const msg = await ctx.sm(`${fmt.header('✍️', 'COPY STUDIO')}
${fmt.spin(0)} starting AI chain…`);
  let phaseI = 0;
  const onAttempt = (p, n, total) => {
    phaseI++;
    ctx.edit(msg.chat.id, msg.message_id, `${fmt.header('✍️', 'COPY STUDIO')}
${fmt.spin(phaseI)} drafting via <b>${fmt.esc(p)}</b> <i>(engine ${n}/${total})</i>…`).catch(() => {});
  };
  try {
    const { text, meta } = await ai.chat(
      [{ role: 'system', content: SYSTEM },
       { role: 'user', content: `Offer: ${st.offer}\nTone: ${TONES[st.tone]}\nLanguage: ${LANGS[st.lang]}\nAd must drive users to open a Telegram bot. Output 3 numbered variants.` }],
      { purpose: 'copy', tgId: ctx.from.id, maxTokens: 900, onAttempt });
    st.variants = text;
    const defaultTarget = config.DEFAULT_TARGET_JSON || '{"type":"users","topic_ids":[12,26,7],"language_codes":["en"],"country_codes":["IN","AE"]}';
    const kbRows = [[{ t: '📋 Save all as draft', c: 'copy:to_draft' }], [{ t: '⬅️ Menu', c: 'menu:main' }]];
    st.target = JSON.parse(defaultTarget);
    await ctx.edit(msg.chat.id, msg.message_id,
      `${fmt.header('✅', '3 VARIANTS READY')}${meta.skipped_providers?.length ? `\n⚠️ circuit-skipped: ${fmt.esc(meta.skipped_providers.join(', '))}` : ''}\n${fmt.esc(text)}\n\n${fmt.BRAND.lineThin}\n<i>AI recommendation — NOT a performance guarantee · ${meta.provider}/${meta.model} · ${meta.attempts} attempt(s) · est. $${meta.est_cost_usd}</i>`,
      fmt.kb(kbRows));
    state.set(ctx.chatId, st);
  } catch (e) {
    const why = e.budget ? `💰 ${e.message}` : `❌ AI unavailable: <i>${fmt.esc(e.message)}</i>`;
    await ctx.edit(msg.chat.id, msg.message_id, why, fmt.kb([[{ t: '⬅️ Menu', c: 'menu:main' }]]));
  }
}

async function toDraft(ctx) {
  const st = state.get(ctx.chatId); if (!st?.variants) return;
  const first = st.variants.match(/^[^\d\n]*(?:\d[).]\s*)?(.+)/)?.[1]?.slice(0, 150) || st.offer.slice(0, 100);
  const d = await db.q(`insert into drafts(title,text,promote_url,target,initial_budget,daily_budget_limit,created_by)
                        values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [`AI copy ${new Date().toISOString().slice(0, 10)}`, first, 'https://t.me/REPLACE_ME', JSON.stringify(st.target), 1.8, 2, ctx.from.id]);
  await ctx.answerCb(`Draft saved (${d[0].id.slice(0, 8)}) — set a real promote_url in Drafts!`);
}

module.exports = { copyMenu, onText, pickTone, pickLang, toDraft };
