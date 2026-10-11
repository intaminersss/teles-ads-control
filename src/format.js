'use strict';
/* format.js — UI text builders, HTML escaping, tables, CSV. */

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = t => `₹${(t * 1.45 * 84).toFixed(0)}`; // TON -> INR estimate (1 TON ≈ $1.45, $1 ≈ ₹84) — ESTIMATE

const STATUS_EMO = { active: '🟢', on_hold: '⏸️', in_review: '🟡', declined: '❌', paused: '⏸️' };
const statusLabel = s => `${STATUS_EMO[s] || '⚪'} ${esc(s || 'unknown')}`;

function adLine(a) {
  const { ad_id: id, views: v = 0, clicks: c = 0, joins: j = 0, spent_budget: s = 0 } = a;
  const jr = c ? (j / c * 100).toFixed(1) : '0.0';
  const cpj = j ? ` · ₹${(s / j * 1.45 * 84).toFixed(0)}/join` : '';
  return `${statusLabel(a.status)} <b>#${id}</b> — ${v}v ${c}c ${j}j · JR ${jr}% · ${s.toFixed(2)} TON (~${money(s)})${cpj}`;
}

function adsBoard(ads) {
  if (!ads.length) return '📭 No ads in this account yet.';
  const tv = ads.reduce((x, a) => x + (a.views || 0), 0);
  const tc = ads.reduce((x, a) => x + (a.clicks || 0), 0);
  const tj = ads.reduce((x, a) => x + (a.joins || 0), 0);
  const ts = ads.reduce((x, a) => x + (+a.spent_budget || 0), 0);
  const jr = tc ? (tj / tc * 100).toFixed(1) : '0.0';
  return [
    ...ads.map(adLine),
    '',
    `Σ <b>${ads.length} ads</b> · ${tv}v ${tc}c ${tj}j · JR ${jr}% · ${ts.toFixed(2)} TON (~${money(ts)})`
  ].join('\n');
}

function channelCard(c, i) {
  const extra = c.members
    ? `${Number(c.members).toLocaleString('en')} members`
    : (c.creativeCount ? `${c.creativeCount} ads seen` : 'activity size unknown');
  const seen = c.lastSeenAt ? ` · last ad ${new Date(c.lastSeenAt).toISOString().slice(0, 10)}` : '';
  return `<b>${i + 1}. ${esc(c.title || c.username)}</b>\n@${esc(c.username)} · ${extra}${c.niche ? ` · ${esc(c.niche)}` : ''}${seen}`;
}

function toCsv(rows) {
  if (!rows.length) return '';
  const head = Object.keys(rows[0]);
  const cell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [head.join(','), ...rows.map(r => head.map(h => cell(r[h])).join(','))].join('\n');
}

const kb = rows => ({ inline_keyboard: rows.map(r => r.map(b => ({ text: b.t, callback_data: b.c, ...b.u }))) });
const MENU = kb([
  [{ t: '📊 My Ads', c: 'menu:ads' }, { t: '🔬 Research', c: 'menu:res' }],
  [{ t: '✍️ Copy Studio', c: 'menu:copy' }, { t: '📋 Drafts', c: 'menu:drafts' }],
  [{ t: '📈 Reports', c: 'menu:rep' }, { t: '🔔 Alerts', c: 'menu:alr' }],
  [{ t: '🩺 Health', c: 'menu:health' }, { t: 'ℹ️ About', c: 'menu:about' }]
]);

module.exports = { esc, money, statusLabel, adLine, adsBoard, channelCard, toCsv, kb, MENU };
