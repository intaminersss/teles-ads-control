'use strict';
/* growth.test.js — offline unit tests for the Packages/Test-Ad research engine:
   link parsing, count parsing, language + niche detection, t.me/s HTML parsing,
   plan rendering (house format + pricing + language variants). No network. */
const test = require('node:test');
const assert = require('node:assert');
const growth = require('../src/growth');

test('parseChannelLink: @name, t.me/name, https://t.me/s/name, junk, private', () => {
  assert.strictEqual(growth.parseChannelLink('@binarki2020'), 'binarki2020');
  assert.strictEqual(growth.parseChannelLink('t.me/binarki2020'), 'binarki2020');
  assert.strictEqual(growth.parseChannelLink('https://t.me/s/binarki2020'), 'binarki2020');
  assert.strictEqual(growth.parseChannelLink('https://t.me/binarki2020/'), 'binarki2020');
  assert.strictEqual(growth.parseChannelLink('https://t.me/+Pt5PGWJI8H9kYWU1'), null); // private invite
  assert.strictEqual(growth.parseChannelLink('hello world'), null);
  assert.strictEqual(growth.parseChannelLink(''), null);
});

test('parseCount: spaced thousands, K/M suffixes, ru suffixes', () => {
  assert.strictEqual(growth.parseCount('7 779'), 7779);
  assert.strictEqual(growth.parseCount('3,861'), 3861);
  assert.strictEqual(growth.parseCount('13.8K'), 13800);
  assert.strictEqual(growth.parseCount('1.2M'), 1200000);
  assert.strictEqual(growth.parseCount('8 253 подписчиков'), 8253);
  assert.strictEqual(growth.parseCount(''), null);
});

test('detectLang: hindi / russian / english by script', () => {
  assert.strictEqual(growth.detectLang('यह चैनल ट्रेडिंग सिग्नल देता है रोज़ाना'), 'hi');
  assert.strictEqual(growth.detectLang('Канал про бинарные опционы и сигналы'), 'ru');
  assert.strictEqual(growth.detectLang('Daily forex signals with 90% accuracy'), 'en');
});

test('detectNiche: buckets hit on multi-language keywords', () => {
  assert.strictEqual(growth.detectNiche('binary options signals pocket option daily'), 'binary');
  assert.strictEqual(growth.detectNiche('XAUUSD gold signals free pips'), 'forex');
  assert.strictEqual(growth.detectNiche('bitcoin crypto airdrop token news'), 'crypto');
  assert.strictEqual(growth.detectNiche('Канал про трейдинг и форекс сигналы'), 'forex');
  assert.strictEqual(growth.detectNiche('we post memes and movies'), 'entertainment');
  assert.strictEqual(growth.detectNiche('a quiet place'), 'other');
});

const FIXTURE = `
<div class="tgme_channel_info_header"><div class="tgme_channel_info_header_title" dir="auto">NitroEdge <span>✦</span></div></div>
<div class="tgme_channel_info_counters">
  <div class="tgme_channel_info_counter"><span class="counter_value">7&#160;779</span><span class="counter_type">subscribers</span></div>
</div>
<div class="tgme_channel_info_description">Бинарные опционы · сигналы · ИИ-анализ. 6 сессий в день.</div>
<div class="tgme_widget_message_wrap"><div class="tgme_widget_message">
  <div class="tgme_widget_message_bubble">
    <div class="tgme_widget_message_text" dir="auto">Week 05.10–09.10: <b>21 signals, 20 in plus</b>. Join free.</div>
    <span class="tgme_widget_message_views">1.4K</span>
  </div></div></div>
<div class="tgme_widget_message_wrap"><div class="tgme_widget_message">
  <div class="tgme_widget_message_bubble">
    <div class="tgme_widget_message_text" dir="auto">Quotex strategy — expiry explained in 3 minutes</div>
    <span class="tgme_widget_message_views">910</span>
  </div></div></div>
`;

test('parsePreviewHtml: title, subs, avg views, view-rate, lang+niche auto-detect', () => {
  const r = growth.parsePreviewHtml(FIXTURE);
  assert.strictEqual(r.title.includes('NitroEdge'), true);
  assert.strictEqual(r.subscribers, 7779);
  assert.strictEqual(r.postsScanned, 2);
  assert.strictEqual(r.avgViews, Math.round((1400 + 910) / 2));
  assert.strictEqual(r.viewRatePct > 10, true);
  assert.strictEqual(r.lang, 'ru');
  assert.strictEqual(r.niche, 'binary');
});

test('buildPlanMd: house format, exact agency pricing, language-adapted, target channels', () => {
  const res = {
    username: 'binarki2020', url: 'https://t.me/binarki2020',
    preview: { title: 'NitroEdge', about: 'x', subscribers: 7779, postsScanned: 2, avgViews: 1155, viewRatePct: 14.9, lang: 'ru', niche: 'binary', sample: [{ views: 1400, snippet: '21 signals' }] },
    previewError: null, niche: 'binary', lang: 'ru',
    competitors: [{ username: 'pocketoption_ru', title: 'PO', creativeCount: 12, niche: 'binary' }],
    targetChannels: growth.PROVEN_CHANNELS.slice(0, 8),
    researchedAt: new Date().toISOString()
  };
  const md = growth.buildPlanMd(res);
  assert.ok(md.includes('# 🚀 ПЛАН РОСТА'), 'russian title for ru channel');
  assert.ok(md.includes('$150–300'), 'test package price exact');
  assert.ok(md.includes('$1,000–1,500'), 'scale package price exact');
  assert.ok(md.includes('$0.30–0.60'), 'CPL KPI exact');
  assert.ok(md.includes('7,779'), 'subs formatted');
  assert.ok(md.includes('@pocketoption_ru'), 'competitor row');
  assert.ok(md.includes('@forexsignals'), 'proven target channel');
  assert.ok(md.includes('## 1. АУДИТ КАНАЛА'), 'audit section');
  assert.ok(md.includes('@TelesAds'), 'brand credit');
  const en = growth.buildPlanMd({ ...res, lang: 'en' });
  assert.ok(en.includes('# 🚀 GROWTH PLAN'), 'english variant');
  const hi = growth.buildPlanMd({ ...res, lang: 'hi' });
  assert.ok(hi.includes('ग्रोथ प्लान'), 'hindi variant');
});
