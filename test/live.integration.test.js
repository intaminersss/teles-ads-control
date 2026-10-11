'use strict';
/* LIVE integration tests — READ-ONLY ONLY (no paid ops). Requires real env; skips cleanly without. */
const test = require('node:test');
const assert = require('node:assert');

const TOK = process.env.TEST_ADS_TOKEN || '';
const BOT = process.env.TELEGRAM_BOT_TOKEN || '';
const SPY = process.env.TEST_SPY_KEY || '';

test('LIVE: Telegram Ads account reachable (read-only)', { skip: !TOK ? 'no TEST_ADS_TOKEN' : false }, async () => {
  const r = await fetch('https://promoteapi.telegram.org/getCurrentAccount', {
    headers: { Authorization: `Bearer ${TOK}`, 'User-Agent': 'Mozilla/5.0' }
  });
  const j = await r.json();
  assert.ok(j.ok, 'getCurrentAccount ok');
  assert.ok(typeof j.result.remaining_budget === 'number');
});

test('LIVE: bot identity via getMe (read-only)', { skip: !BOT ? 'no TELEGRAM_BOT_TOKEN' : false }, async () => {
  const j = await (await fetch(`https://api.telegram.org/bot${BOT}/getMe`)).json();
  assert.ok(j.ok && j.result.username);
});

test('LIVE: tgadsspy advertisers endpoint reachable (read-only)', { skip: !SPY ? 'no TEST_SPY_KEY' : false }, async () => {
  const r = await fetch('https://tgadsspy.com/api/v1/advertisers?limit=1', { headers: { 'X-Api-Key': SPY } });
  const ct = r.headers.get('content-type') || '';
  assert.ok(ct.includes('application/json'), `expected JSON, got ${ct}`);
  const j = await r.json();
  assert.ok(Array.isArray(j.data));
});

test('LIVE: never performs paid operations in tests', () => {
  const fs = require('fs');
  const src = fs.readFileSync(__filename, 'utf8');
  const mutating = ['create', 'delete', 'edit'].map(x => x + 'Ad').join('|');
  assert.ok(!new RegExp(mutating).test(src), 'no mutating ads calls in tests');
});
