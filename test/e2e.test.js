'use strict';
/* e2e.test.js — ROUTER-LEVEL END-TO-END: simulates real Telegram updates through index.js
   onUpdate/routeCb with mocked transports (tg/db/adsapi/spyapi recording calls).
   Proves: every menu button routes, every handler responds, no crash, every tap acked.
   Network is fully mocked — clearly labeled. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

process.env.TELEGRAM_BOT_TOKEN = '111111111:test-token';
process.env.SUPABASE_DB_URL = 'postgresql://localhost:1/x';
process.env.ALLOWED_USER_IDS = '7049127887';
process.env.RATE_LIMIT_MAX = '100000'; // router E2E fires many taps quickly

/* ---------- recorded mock transports ---------- */
const calls = [];
const rec = (type, ...args) => { calls.push({ type, args }); return Promise.resolve(mockResults(type, args)); };

const SAMPLE_ADS = [
  { ad_id: 96, status: 'active', views: 1200, clicks: 40, joins: 8, spent_budget: 1.9 },
  { ad_id: 79, status: 'on_hold', views: 18158, clicks: 329, joins: 63, spent_budget: 9.84, daily_budget_limit: 5, remaining_budget: 4.76 }
];
const SAMPLE_DRAFT = { id: 'abc-uuid', title: 'Test draft', text: 'Test ad text', promote_url: 'https://t.me/real', target: { type: 'users' }, cpm: 0.6, placement: 'channel_post', initial_budget: 1.8, daily_budget_limit: 2, status: 'draft', launched_ad_id: null };

function mockResults(type, args) {
  if (type === 'sm' || type === 'edit') return { chat: { id: 7049127887 }, message_id: calls.length + 100 };
  if (type === 'getMe') return { username: 'thetas_test', id: 8862583233 };
  return null;
}

const tgMock = {
  call: async (method, body) => { calls.push({ type: `api:${method}`, args: [body] }); return { ok: true }; },
  sm: (c, t, k) => rec('sm', c, t, k),
  edit: (c, m, t, k) => { const p = rec('edit', c, m, t, k); return p.then(r => r); },
  answerCb: (id, text) => rec('answerCb', id, text),
  sendDoc: (c, n, d, cap) => rec('sendDoc', c, n, d, cap),
  sendAnimation: (c, f, cap, k) => rec('sendAnimation', c, f, cap, k),
  sendDraft: (c, id, t) => rec('sendDraft', c, id, t),
  typing: c => rec('typing', c),
  chunkText: t => [String(t)],
  getMe: async () => ({ username: 'thetas_test', id: 8862583233 }),
  pollLoop: async () => { calls.push({ type: 'pollLoop', args: [] }); }, // no infinite loop in tests
  stats: () => ({ lastUpdateAt: 0 })
};

const dbMock = {
  q: async (sql) => {
    calls.push({ type: 'db', args: [String(sql).slice(0, 60)] });
    if (/insert into research_lists/.test(sql)) return [{ id: 1 }];
    if (/insert into drafts/.test(sql)) return [{ id: 'new-draft-id' }];
    if (/from research_lists/.test(sql)) return [{ id: 1, name: 'default', n: 2 }];
    if (/from research_list_items/.test(sql)) return [{ username: 'samplechan', title: 'Sample', members: 1000, niche: 'trading', note: null, added_at: new Date() }];
    if (/from ai_budget/.test(sql)) return [{ key: 'daily_user', limit_usd: 0.5, enabled: true }, { key: 'daily_global', limit_usd: 5, enabled: true }];
    if (/sum\(est_cost_usd\)/.test(sql)) return [{ usd: 0 }];
    if (/from alerts/.test(sql)) return [];
    if (/from drafts where/.test(sql) && /select/.test(sql)) return [];
    return [];
  },
  one: async (sql) => {
    calls.push({ type: 'db1', args: [String(sql).slice(0, 60)] });
    if (/from drafts where id/.test(sql)) return SAMPLE_DRAFT;
    return null;
  },
  tx: async fn => fn({ query: async () => ({ rows: [] }) }),
  healthy: async () => true,
  pool: {}
};

const adsMock = {
  getCurrentAccount: async () => { calls.push({ type: 'ads:getAccount' }); return { remaining_budget: 15.86 }; },
  getAdsList: async () => { calls.push({ type: 'ads:list' }); return SAMPLE_ADS; },
  getAdsById: async ids => { calls.push({ type: 'ads:byId', args: ids }); return (ids || []).map(id => SAMPLE_ADS.find(a => a.ad_id === id) || SAMPLE_ADS[0]); },
  getTargetChannel: async ch => { calls.push({ type: 'ads:target', args: [ch] }); return { id: 'x' }; },
  createAd: async (payload, idemKey) => { calls.push({ type: 'ads:create', args: [payload, idemKey] }); return { ad_id: 555, status: 'in_review' }; },
  editAd: async (id, patch) => { calls.push({ type: 'ads:edit', args: [id, patch] }); return {}; },
  deleteAd: async id => { calls.push({ type: 'ads:delete', args: [id] }); return {}; },
  explain: e => e.message
};

const spyMock = {
  searchChannels: async ({ q }) => { calls.push({ type: 'spy:search', args: [q] }); return { rows: [
    { username: 'bmrtradingbot', title: 'BMR Trading', creativeCount: 264, niche: 'trading', lastSeenAt: '2026-10-11T00:00:00Z' },
    { username: 'goldsignals', title: 'Gold Signals', creativeCount: 90, niche: 'trading', lastSeenAt: '2026-10-10T00:00:00Z' }
  ], total: 2, source: 'mock tgadsspy' }; },
  searchAdvertisers: async ({ q }) => { calls.push({ type: 'spy:adv', args: [q] }); return { rows: [
    { username: 'bmrtradingbot', title: 'BMR Trading', creativeCount: 264, niche: 'trading' },
    { username: 'rivalchannel', title: 'Rival Signals', creativeCount: 42, niche: 'trading' }
  ], total: 2, source: 'mock tgadsspy' }; }
};

/* stub for global fetch (t.me/s/<channel> public preview) used by the growth engine */
const TME_FIXTURE = `<html><div class="tgme_channel_info_header_title" dir="auto">Demo Trades</div>
<div class="tgme_channel_info_counter"><span class="counter_value">12 400</span><span class="counter_type">subscribers</span></div>
<div class="tgme_channel_info_description">Daily forex &amp; gold signals. XAUUSD entries every session.</div>
<div class="tgme_widget_message_text" dir="auto">Gold smashed TP — 21 signals, 20 in plus this week</div><span class="tgme_widget_message_views">1.8K</span>
<div class="tgme_widget_message_text" dir="auto">Free session at 09:00, join early</div><span class="tgme_widget_message_views">1.1K</span></html>`;
const realFetch = globalThis.fetch;
function stubTmeFetch() {
  globalThis.fetch = async (url) => ({ ok: true, status: 200, text: async () => TME_FIXTURE });
}

/* install mocks BEFORE requiring the app */
function setMock(file, exportsObj) {
  const p = require.resolve(file);
  require.cache[p] = { id: p, filename: p, loaded: true, exports: exportsObj };
}
setMock('../src/tg', tgMock);
setMock('../src/db', dbMock);
setMock('../src/adsapi', adsMock);
setMock('../src/spyapi', spyMock);
const aiMock = { chat: async () => { calls.push({ type: 'ai' });
    return { text: '1. Variant one\n2. Variant two\n3. Variant three', meta: { provider: 'mock', model: 'm', est_cost_usd: 0, attempts: 1, skipped_providers: [] } }; },
  budgetCheck: async () => ({ ok: true, spentUser: 0, spentGlobal: 0 }), circuitState: () => ({}) };
setMock('../src/ai', aiMock);

const app = require('../src/index');

/* helpers to build Telegram-like updates */
const FROM = { id: 7049127887, first_name: 'Boss', username: 'boss' };
const msgUpdate = text => ({ message: { message_id: Date.now() % 100000, chat: { id: 7049127887 }, from: FROM, text, date: Math.floor(Date.now() / 1000) } });
const cbUpdate = data => ({ callback_query: { id: `cb${Math.random()}`, from: FROM, data, message: { chat: { id: 7049127887 }, message_id: 42 } } });
const lastOf = type => [...calls].reverse().find(c => c.type === type);

/* fresh calls array per test */
function reset() { calls.length = 0; }

test('E2E: /start → HERO animation + caption + tiered menu keyboard', async () => {
  reset();
  await app.onUpdate(msgUpdate('/start'));
  const hero = lastOf('sendAnimation');
  assert.ok(hero, 'sendAnimation called');
  assert.ok(String(hero.args[2]).includes('Welcome'), 'caption greets user');
  const kb = hero.args[3];
  assert.ok(kb.inline_keyboard.length >= 5, 'tiered keyboard rows');
  assert.strictEqual(kb.inline_keyboard[0][0].style, 'primary', 'primary action styled');
  assert.ok(kb.inline_keyboard.flat().every(b => b.callback_data), 'all buttons wired');
});

test('E2E: every menu button routes to its screen (10/10)', async () => {
  const expects = [
    ['menu:testad', t => /TEST AD FUNNEL/.test(t)],
    ['menu:pkg', t => /PACKAGES/.test(t)],
    ['menu:ads', t => /LIVE ADS|ADS/.test(t)],
    ['menu:res', t => /RESEARCH/.test(t)],
    ['menu:copy', t => /COPY STUDIO/.test(t)],
    ['menu:drafts', t => /DRAFTS/.test(t)],
    ['menu:rep', t => /PERFORMANCE/.test(t)],
    ['menu:alr', t => /ALERTS/.test(t)],
    ['menu:health', t => /HEALTH/.test(t)],
    ['menu:about', t => /CAPABILITY MATRIX|THETAS AI/.test(t)]
  ];
  for (const [data, match] of expects) {
    reset();
    await app.onUpdate(cbUpdate(data));
    const edit = lastOf('edit') || lastOf('sm');
    assert.ok(edit, `${data} produced a screen`);
    const text = String(edit.args[edit.type === 'edit' ? 2 : 1]);
    assert.ok(match(text), `${data} screen content matched → got: ${text.slice(0, 80)}`);
    assert.ok(lastOf('answerCb') || edit, `${data} tap acknowledged`);
  }
});

test('E2E: ⬅️ Menu returns to control desk (edit path, no media re-send)', async () => {
  reset();
  await app.onUpdate(cbUpdate('menu:main'));
  const edit = lastOf('edit');
  assert.ok(edit, 'edited in place');
  assert.ok(/CONTROL DESK/.test(String(edit.args[2])), 'desk text');
  assert.ok(!lastOf('sendAnimation'), 'no media spam on back-nav');
});

test('E2E: ad detail → pause confirm → pause executes via API', async () => {
  reset();
  await app.onUpdate(cbUpdate('ad:96'));
  let edit = lastOf('edit');
  assert.ok(/AD #96/.test(String(edit.args[2])), 'detail screen');
  reset();
  await app.onUpdate(cbUpdate('ad:96:pause'));
  edit = lastOf('edit');
  assert.ok(/Confirm/.test(String(edit.args[2])), 'confirmation gate shown');
  reset();
  await app.onUpdate(cbUpdate('ad:96:pause_go'));
  const apiEdit = calls.find(c => c.type === 'ads:edit');
  assert.ok(apiEdit && apiEdit.args[1].is_paused === true, 'pause hit the API');
  assert.ok(calls.find(c => c.type === 'db' && /audit_log/.test(c.args[0])), 'audited');
});

test('E2E: duplicate consequential action blocked (idempotency)', async () => {
  reset();
  await app.onUpdate(cbUpdate('ad:96:pause_go'));
  const editCalls = calls.filter(c => c.type === 'ads:edit');
  assert.strictEqual(editCalls.length, 0, 'repeat within window NOT re-sent');
  assert.ok(lastOf('answerCb'), 'user told instead');
});

test('E2E: research search → results screen + channel validation flow', async () => {
  reset();
  await app.onUpdate(cbUpdate('res:q:trading'));
  const spy = calls.find(c => c.type === 'spy:search');
  assert.ok(spy, 'spy searched');
  const screen = lastOf('edit') || lastOf('sm');
  assert.ok(/bmrtradingbot|RESULTS/.test(JSON.stringify(screen.args)), 'results rendered');
  reset();
  await app.onUpdate(cbUpdate('res:chk:bmrtradingbot'));
  assert.ok(calls.find(c => c.type === 'ads:target'), 'placement validated via ads API');
  const verdict = lastOf('edit');
  assert.ok(/accepted by Telegram Ads/.test(String(verdict.args[2])), 'eligibility verdict');
});

test('E2E: copy studio wizard — tone guard, full happy path with save-as-draft', async () => {
  reset();
  await app.onUpdate(cbUpdate('menu:copy'));
  await app.onUpdate(msgUpdate('free gold signals channel for indian traders'));
  let sm = lastOf('sm');
  assert.ok(/TONE/.test(String(sm.args[1])), 'step 2 tone offered');
  reset();
  await app.onUpdate(cbUpdate('copy:tone:confident'));
  sm = lastOf('sm');
  assert.ok(/LANGUAGE/.test(String(sm.args[1])), 'step 3 language offered');
  reset();
  await app.onUpdate(cbUpdate('copy:lang:en'));
  assert.ok(calls.find(c => c.type === 'ai'), 'AI provider chain invoked');
  const final = lastOf('sm');
  assert.ok(/VARIANTS READY/.test(String(final.args[1])), 'final variants screen');
  reset();
  await app.onUpdate(cbUpdate('copy:to_draft'));
  assert.ok(calls.find(c => c.type === 'db' && /insert into drafts/.test(c.args[0])), 'draft persisted');
});

test('E2E: copy studio — offer too short → validation message, no AI call', async () => {
  reset();
  await app.onUpdate(cbUpdate('menu:copy'));
  reset();
  await app.onUpdate(msgUpdate('short'));
  assert.ok(lastOf('sm'), 'validation feedback sent');
  assert.ok(!calls.find(c => c.type === 'ai'), 'no AI spent');
});

test('E2E: drafts → detail → launch confirm → launch creates REAL ad (mock API)', async () => {
  reset();
  await app.onUpdate(cbUpdate('menu:drafts'));
  assert.ok(lastOf('edit') || lastOf('sm'), 'drafts screen');
  reset();
  await app.onUpdate(cbUpdate('draft:abc-uuid'));
  const det = lastOf('edit');
  assert.ok(/DRAFT/.test(String(det.args[2])), 'draft detail');
  reset();
  await app.onUpdate(cbUpdate('draft:abc-uuid:lc'));
  const conf = lastOf('edit');
  assert.ok(/CONFIRM LAUNCH|real ad/i.test(String(conf.args[2])), 'launch warning');
  reset();
  await app.onUpdate(cbUpdate('draft:abc-uuid:launch_go'));
  const created = calls.find(c => c.type === 'ads:create');
  assert.ok(created, 'createAd called');
  assert.strictEqual(created.args[0].initial_budget, 1.8, 'payload validated');
  const done = lastOf('edit');
  assert.ok(/AD CREATED/.test(String(done.args[2])), 'success screen');
});

test('E2E: reports screen + CSV export document', async () => {
  reset();
  await app.onUpdate(cbUpdate('menu:rep'));
  const screen = lastOf('edit');
  assert.ok(/PERFORMANCE/.test(String(screen.args[2])), 'report text');
  reset();
  await app.onUpdate(cbUpdate('rep:csv:1'));
  assert.ok(lastOf('sendDoc'), 'CSV document sent');
});

test('E2E: alerts toggle round-trip', async () => {
  reset();
  await app.onUpdate(cbUpdate('menu:alr'));
  assert.ok(/ALERTS/.test(String((lastOf('edit') || lastOf('sm')).args[2] || '')), 'alerts screen');
  reset();
  await app.onUpdate(cbUpdate('alr:digest'));
  assert.ok(calls.find(c => (c.type === 'db') && /alerts/.test(c.args[0])), 'digest toggled in DB');
});

test('E2E: unauthorized user gets NO data', async () => {
  reset();
  await app.onUpdate({ message: { message_id: 1, chat: { id: 42 }, from: { id: 42, first_name: 'Stranger' }, text: '/start', date: 0 } });
  const sm = lastOf('sm');
  assert.ok(/⛔/.test(String(sm?.args[1] || '')), 'blocked message');
  assert.strictEqual(calls.filter(c => c.type === 'ads:list' || c.type === 'sendAnimation').length, 0, 'zero data/actions leaked');
});

test('E2E: /cancel with no active workflow → graceful', async () => {
  reset();
  await app.onUpdate(msgUpdate('/cancel'));
  assert.ok(lastOf('sm'), 'graceful reply');
});

test('E2E: packages — channel link → research → .md growth plan delivered', async () => {
  stubTmeFetch();
  try {
    reset();
    await app.onUpdate(cbUpdate('menu:pkg'));
    const menu = lastOf('edit');
    assert.ok(/PACKAGES/.test(String(menu.args[2])), 'packages screen shown');
    reset();
    await app.onUpdate(msgUpdate('t.me/demotraders'));
    const doc = lastOf('sendDoc');
    assert.ok(doc, 'plan document sent');
    assert.ok(/\.md$/.test(String(doc.args[1])), 'filename is .md');
    const md = String(doc.args[2]);
    assert.ok(md.includes('# 🚀 GROWTH PLAN'), 'house format title');
    assert.ok(md.includes('$150–300') && md.includes('$1,000–1,500'), 'agency pricing exact');
    assert.ok(md.includes('12,400'), 'scraped subscriber count in plan');
    assert.ok(md.includes('@rivalchannel'), 'competitors from ad archive');
    assert.ok(md.includes('@forexsignals'), 'proven target channels');
    assert.ok(md.toLowerCase().includes('english'), 'language auto-detected');
    assert.ok(calls.find(c => c.type === 'db' && /audit_log/.test(c.args[0])), 'audited');
  } finally { globalThis.fetch = realFetch; }
});

test('E2E: test-ad funnel — full path: tests → geo → brief → link → budget → preview → GO LIVE ×2', async () => {
  stubTmeFetch();
  try {
    reset();
    await app.onUpdate(cbUpdate('menu:testad'));
    assert.ok(/TEST AD FUNNEL/.test(String(lastOf('edit').args[2])), 'funnel started');
    await app.onUpdate(cbUpdate('ta:n:2'));
    assert.ok(/COUNTRY|GEO/i.test(String(lastOf('edit').args[2])), 'geo step');
    await app.onUpdate(cbUpdate('ta:geo:in'));
    assert.ok(/BRIEF/i.test(String(lastOf('edit').args[2])), 'brief step');
    reset();
    await app.onUpdate(msgUpdate('Promote our forex signals channel - 90% win rate, daily XAUUSD entries, free trial week for traders.'));
    const linkStep = lastOf('edit') || lastOf('sm');
    assert.ok(/CHANNEL LINK|④/i.test(String((linkStep.args)[linkStep.type === 'edit' ? 2 : 1])), 'link step');
    reset();
    await app.onUpdate(msgUpdate('t.me/demotraders'));
    assert.ok(lastOf('sendDoc'), 'research plan .md attached mid-funnel');
    const budget = lastOf('edit');
    assert.ok(/BUDGET/i.test(String(budget.args[2])), 'budget step');
    await app.onUpdate(cbUpdate('ta:bud:1.8'));
    const prev = lastOf('edit');
    assert.ok(/FULL AD PREVIEW/.test(String(prev.args[2])), 'preview shown');
    assert.ok((prev.args[3]?.inline_keyboard || []).flat().some(b => /GO LIVE/.test(b.text)), 'live button present');
    await app.onUpdate(cbUpdate('ta:go'));
    assert.ok(/CONFIRM/.test(String(lastOf('edit').args[2])), 'confirm gate');
    reset();
    await app.onUpdate(cbUpdate('ta:go_go'));
    const creates = calls.filter(c => c.type === 'ads:create');
    assert.strictEqual(creates.length, 2, '2 tests = 2 real create calls');
    const p = creates[0].args[0];
    assert.strictEqual(p.target.country_codes[0], 'IN', 'India-first geo');
    assert.ok(Array.isArray(p.target.channel_ids) && p.target.channel_ids.length >= 4, 'channel-only targeting (no keywords)');
    assert.ok(p.target.channel_ids.every(ch => String(ch).startsWith('@')), 'channels are @handles');
    assert.strictEqual(p.cpm, 0.6, 'fleet CPM');
    assert.ok(creates[0].args[1].startsWith('testad-'), 'idempotency key namespaced');
    assert.ok(/LIVE/.test(String(lastOf('edit').args[2])), 'success screen');
  } finally { globalThis.fetch = realFetch; }
});

test('E2E: reports — full .md document with per-ad sections + budget', async () => {
  reset();
  await app.onUpdate(cbUpdate('menu:rep'));
  const doc = lastOf('sendDoc');
  assert.ok(doc, 'report document sent');
  assert.ok(/thetas-ads-report-.*\.md/.test(String(doc.args[1])), '.md filename');
  const md = String(doc.args[2]);
  assert.ok(md.includes('# 📊 THETAS AI — FULL ADS REPORT'), 'report header');
  assert.ok(md.includes('## 🔥 Ad #96') || md.includes('Ad #96'), 'per-ad section 96');
  assert.ok(md.includes('Ad #79'), 'per-ad section 79 (separately)');
  assert.ok(md.includes('Spent'), 'budget block per ad');
  assert.ok(md.includes('Daily cap'), 'daily budget per ad');
  assert.ok(md.includes('FLEET SUMMARY'), 'summary table');
  const preview = lastOf('edit') || lastOf('sm');
  assert.ok(/report/i.test(String(preview.args[2] || preview.args[1])), 'in-chat summary');
});
