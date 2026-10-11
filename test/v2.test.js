'use strict';
/* v2 tests — design system, circuit breaker, assets. node --test */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

process.env.TELEGRAM_BOT_TOKEN = '111111111:test-token';
process.env.SUPABASE_DB_URL = 'postgresql://localhost:1/x';
process.env.ALLOWED_USER_IDS = '7049127887';

const root = path.join(__dirname, '..');

test('ui: bar() reflects REAL fractions and clamps', () => {
  const { bar } = require('../src/ui');
  assert.strictEqual(bar(0, 10), '▱'.repeat(10));
  assert.strictEqual(bar(5, 10), '▰'.repeat(5) + '▱'.repeat(5));
  assert.strictEqual(bar(10, 10), '▰'.repeat(10));
  assert.strictEqual(bar(15, 10), '▰'.repeat(10), 'clamped');
  assert.strictEqual(bar(3, 0).length, 10, 'no div-by-zero');
});

test('ui: header/pill/spin consistent design tokens', () => {
  const { header, pill, spin } = require('../src/ui');
  assert.ok(header('📊', 'X').includes('TELES ADS'));
  assert.strictEqual(pill('active'), '🟢 ACTIVE');
  assert.ok(['◜', '◠', '◝', '◞', '◡', '◟'].includes(spin(0)));
});

test('ui: pager rows honest page indicator', () => {
  const { pagerRows } = require('../src/ui');
  assert.deepStrictEqual(pagerRows(0, 1), [], 'no pager for single page');
  const p = pagerRows(0, 3, 'ads');
  assert.strictEqual(p[0].c, 'ads:p0', 'prev clamped');
  assert.strictEqual(p[2].c, 'ads:p1');
});

test('ui: custom emoji NEVER invented — fallback without env IDs', () => {
  const ui = require('../src/ui');
  assert.strictEqual(ui.hasCustom('crown'), false);
  assert.strictEqual(ui.cemoji('crown', '👑').text, '👑');
});

test('ai: error classification routes correctly', () => {
  const { classify } = require('../src/ai');
  assert.strictEqual(classify('429 too many requests'), 'rate');
  assert.strictEqual(classify('401 Unauthorized'), 'auth');
  assert.strictEqual(classify('500 internal'), 'transient');
  assert.strictEqual(classify('timeout AbortError'), 'transient');
  assert.strictEqual(classify('400 bad request model'), 'bad_request');
});

test('ai: circuit breaker opens after threshold and cools down', () => {
  const ai = require('../src/ai');
  const { _internals } = ai;
  const p = 'testprov';
  for (let i = 0; i < ai.BREAKER.threshold; i++) _internals.recordFail(p);
  assert.strictEqual(_internals.circuit.get(p).openedAt !== null, true, 'opened');
  // state() reflects it
  assert.strictEqual(ai.circuitState()[p].open, true);
  // simulate cool-down passage
  _internals.circuit.get(p).openedAt = Date.now() - ai.BREAKER.coolMs - 1;
  assert.strictEqual(ai.circuitState()[p].open, false, 'half-open after cooldown');
  _internals.recordSuccess(p);
  assert.strictEqual(ai.circuitState()[p].fails, 0);
});

test('asset: launch animation GIF exists, non-trivial, GIF format', () => {
  const p = path.join(root, 'assets/launch.gif');
  assert.ok(fs.existsSync(p), 'missing assets/launch.gif');
  const buf = fs.readFileSync(p);
  assert.ok(buf.length > 3000, 'too small to be a real animation');
  assert.ok(buf.slice(0, 3).toString('ascii') === 'GIF', 'not a GIF');
});

test('tg: sendAnimation exported (multipart upload capability)', () => {
  const src = fs.readFileSync(path.join(root, 'src/tg.js'), 'utf8');
  assert.ok(src.includes('sendAnimation'), 'helper present');
  assert.ok(src.includes('sendAnimation(chatId'), 'signature');
  const tg = require('../src/tg');
  assert.strictEqual(typeof tg.sendAnimation, 'function');
});
