'use strict';
/* format.js — v2 compatibility shim → design system lives in ui.js now */
const ui = require('./ui');
const { esc, toCsv, kb, MENU } = ui;
const money = ui.inr; // v1 name → v2 inr() (TON→INR estimate)

const STATUS_EMO = { active: '🟢', on_hold: '⏸️', in_review: '🟡', declined: '❌', paused: '⏸️' };
const statusLabel = s => `${STATUS_EMO[s] || '⚪'} ${esc(s || 'unknown')}`;

/* v1 names kept working: */
function adLine(a) { return ui.adRow(a).replace(/\n\s+/g, ' · ').replace(/\n/g, ' · '); }
const adsBoard = ui.adsBoard;

function channelCard(c, i) {
  const extra = c.members ? `${Number(c.members).toLocaleString('en')} members`
    : (c.creativeCount ? `${c.creativeCount} ads seen` : 'activity size unknown');
  const seen = c.lastSeenAt ? ` · last ad ${new Date(c.lastSeenAt).toISOString().slice(0, 10)}` : '';
  return `${ui.pill('active').split(' ')[0]} <b>${i + 1}. ${ui.esc(c.title || c.username)}</b>\n@${ui.esc(c.username)} · ${ui.esc(extra)}${c.niche ? ` · ${ui.esc(c.niche)}` : ''}${seen}`;
}

module.exports = { ...ui, esc, money, toCsv, kb, MENU, statusLabel, adLine, adsBoard, channelCard };
