'use strict';
/* ui.js — THETAS AI design system (premium Telegram-native identity).
   Product: THETAS AI — Fully Built By Agency @TelesAds (Telesads.com)
   Philosophy adopted from telegram-bot-ui skill: the whole surface = text + keyboards + transitions + working-state feedback.
   Every visual is plain HTML that Telegram actually renders — no CSS illusions. */

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const BRAND = { title: 'THETAS AI', mark: '▲', line: '━━━━━━━━━━━━━━━━━━━━', lineThin: '─────────────',
  credit: 'Fully Built By Agency @TelesAds · Telesads.com' };

/* Section header: brand bar + title */
const header = (icon, title) => `${BRAND.mark} <b>${BRAND.title}</b> ▸ ${icon} <b>${esc(title)}</b>\n${BRAND.line}`;

/* Status pill with fixed visual language */
const PILL = {
  active: '🟢 ACTIVE', on_hold: '⏸️ ON HOLD', paused: '⏸️ PAUSED',
  in_review: '🟡 IN REVIEW', declined: '❌ DECLINED', launched: '🚀 LAUNCHED',
  draft: '📝 DRAFT', failed: '❌ FAILED', archived: '📦 ARCHIVED'
};
const pill = s => PILL[s] || `⚪ ${esc(s || 'UNKNOWN')}`;

/* Real-fraction progress bar: filled = actual ratio (never fabricated) */
function bar(value, max, width = 10) {
  const v = Math.max(0, +value || 0), m = Math.max(0.000001, +max || 0);
  const filled = Math.min(width, Math.round((v / m) * width));
  return '▰'.repeat(filled) + '▱'.repeat(width - filled);
}

/* Spinner frames for real work phases (edited-message feedback) */
const SPIN = ['◜', '◠', '◝', '◞', '◡', '◟'];
const spin = i => SPIN[Math.abs(i) % SPIN.length];

/* Number formatting helpers */
const num = n => Number(n || 0).toLocaleString('en');
const inr = t => `₹${(t * 1.45 * 84).toFixed(0)}`; // TON→INR — ESTIMATE (fixed FX)
const ton = t => `${(+t || 0).toFixed(2)} TON`;

/* Custom emoji support — HONEST: only uses IDs provided via CUSTOM_EMOJI_IDS env map.
   No known IDs are bundled (none verified) → unicode fallback always available. */
let CUSTOM_EMOJI = {};
try { CUSTOM_EMOJI = JSON.parse(process.env.CUSTOM_EMOJI_IDS || '{}'); } catch { CUSTOM_EMOJI = {}; }
const hasCustom = name => Boolean(CUSTOM_EMOJI[name]);
/* Returns {text, entity?} — caller merges entities when sending (v2.1 when IDs provided) */
function cemoji(name, fallback) { return hasCustom(name) ? { text: '\u{E0000}', id: CUSTOM_EMOJI[name] } : { text: fallback }; }

/* Ad row — v2 premium compact card */
function adRow(a) {
  const { ad_id: id, views: v = 0, clicks: c = 0, joins: j = 0, spent_budget: s = 0 } = a;
  const jr = c ? (j / c * 100).toFixed(1) : '0.0';
  const cpj = j ? ` · <code>${inr(s / j)}/join</code>` : '';
  return `${pill(a.status)} <b>#${id}</b>\n      👀 <code>${num(v)}</code>  👆 <code>${num(c)}</code>  🚪 <code>${num(j)}</code>  JR <code>${jr}%</code>\n      💸 <code>${ton(s)}</code> (~${inr(s)})${cpj}`;
}

function adsBoard(ads) {
  if (!ads.length) return '📭 No ads in this account yet.\n<i>Launch your first draft from 📋 Drafts.</i>';
  const tv = ads.reduce((x, a) => x + (a.views || 0), 0), tc = ads.reduce((x, a) => x + (a.clicks || 0), 0);
  const tj = ads.reduce((x, a) => x + (a.joins || 0), 0), ts = ads.reduce((x, a) => x + (+a.spent_budget || 0), 0);
  const jr = tc ? (tj / tc * 100).toFixed(1) : '0.0';
  return [
    ...ads.map(adRow),
    '',
    `${BRAND.lineThin}`,
    `Σ <b>${ads.length} ads</b> · 👀 <code>${num(tv)}</code> 👆 <code>${num(tc)}</code> 🚪 <code>${num(tj)}</code> · JR <code>${jr}%</code>`,
    `Σ spend <code>${ton(ts)}</code> (~${inr(ts)})`
  ].join('\n');
}

/* Budget meter (real values only) */
const budgetMeter = (remaining, initial) =>
  `💼 <code>${bar(remaining, Math.max(remaining, initial || 0))}</code> ${ton(remaining)} free`;

/* Keyboard builder (t/c shorthand → Telegram shape) */
const kb = rows => ({
  inline_keyboard: (Array.isArray(rows) ? rows : [])
    .filter(r => Array.isArray(r) && r.length)
    .map(r => r.filter(b => b && (b.t || b.text)).map(b => {
      /* keep extra fields (style per Bot API 10.2) + accept t/c shorthand or native keys */
      const { t, c, u, text, callback_data, ...rest } = b;
      return { ...rest, text: t || text, callback_data: c || callback_data };
    }))
    .filter(r => r.length)
});

/* Pager rows: prev/next with honest page indicator */
function pagerRows(page, pages, base) {
  if (pages <= 1) return [];
  return [{ t: '◀️', c: `${base}:p${Math.max(0, page - 1)}` },
          { t: `${page + 1}/${pages}`, c: `${base}:noop` },
          { t: '▶️', c: `${base}:p${Math.min(pages - 1, page + 1)}` }];
}

/* Tiered menu — Operate / Automate / System (skill: group by meaning, primary action stands out) */
const MENU = kb([
  [{ t: '📊  My Ads — live board', c: 'menu:ads', style: 'primary' }],
  [{ t: '🔬  Research', c: 'menu:res' }, { t: '✍️  Copy Studio', c: 'menu:copy' }],
  [{ t: '📋  Drafts', c: 'menu:drafts' }, { t: '📈  Reports', c: 'menu:rep' }],
  [{ t: '🔔  Alerts', c: 'menu:alr' }],
  [{ t: '🩺 Health', c: 'menu:health' }, { t: 'ℹ️  About', c: 'menu:about' }]
]);

function toCsv(rows) {
  if (!rows.length) return '';
  const head = Object.keys(rows[0]);
  const cell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [head.join(','), ...rows.map(r => head.map(h => cell(r[h])).join(','))].join('\n');
}

module.exports = { esc, BRAND, header, pill, PILL, bar, SPIN, spin, num, inr, ton, cemoji, hasCustom, adRow, adsBoard, budgetMeter, kb, pagerRows, MENU, toCsv };
