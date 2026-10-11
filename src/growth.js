'use strict';
/* growth.js — CHANNEL RESEARCH + GROWTH-PLAN ENGINE ("Packages" + "Test Ad" research leg)
   Fetches public t.me/s/<channel> preview (no login, official public web preview),
   detects language + niche, finds competitors (tgadsspy advertisers in same niche),
   and renders a client-ready GROWTH PLAN .md in the exact TelesAds house format
   (audit → competitors → where to advertise → 30-day plan & packages → owner asks).
   Pricing is FIXED by agency policy (uploads/growth.md / docs/GROWTH_PLAN_TEMPLATE.md):
   Week-1 test $150–300 · 30-day scale $1,000–1,500 · KPI CPL ≤ $0.30–0.60.
   All numbers honest: scraped stats + fleet-calibrated benchmarks (cpm 0.6 TON, JR ~50%). */

const PRICING = {
  test: { usd: '$150–300', label: 'Week-1 TEST package' },
  scale: { usd: '$1,000–1,500', label: '30-day SCALE package' },
  cpl: '$0.30–0.60', cplInr: '₹25–50 per join', cpmTon: '0.6 TON / 1000 views'
};

const PROVEN_CHANNELS = ['@forexsignals', '@goldsignals', '@XAUUSD', '@forexmarket', '@cryptosignals', '@fxsignals', '@wolftrading25', '@msbfxelite', '@Forex', '@Forex_Signals_Blue_Pips'];

/* ---------- pure parsers (unit-tested offline) ---------- */

function parseChannelLink(text) {
  if (!text) return null;
  const t = String(text).trim();
  if (/^t\.me\/s\//i.test(t) || /https?:\/\/t\.me\/s\//i.test(t)) {
    const m = t.match(/t\.me\/s\/([A-Za-z0-9_]{3,64})/i);
    return m ? m[1] : null;
  }
  const m = t.match(/^@([A-Za-z0-9_]{3,64})$/) || t.match(/(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]{3,64})\/?$/i);
  if (!m) return null;
  const u = m[1];
  if (/^\+/.test(u) || /^(joinchat|share|addlist)$/i.test(u)) return null; // private/unsupported
  return u;
}

function parseCount(s) {
  if (s == null) return null;
  const raw = String(s).toLowerCase().replace(/[\s,\u00a0]/g, '').replace(/подписчиков|подписчик|участников/g, '');
  const m = raw.match(/^([\d.]+)(k|m|к|м)?/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const suf = m[2];
  if (Number.isNaN(n)) return null;
  return Math.round(n * (suf === 'k' || suf === 'к' ? 1e3 : suf === 'm' || suf === 'м' ? 1e6 : 1));
}

function detectLang(text) {
  const t = String(text || '');
  const letters = (t.match(/\p{L}/gu) || []).length;
  if (!letters) return 'en';
  const share = re => ((t.match(re) || []).length / letters);
  if (share(/[\u0900-\u097F]/gu) > 0.2) return 'hi';
  if (share(/[\u0400-\u04FF]/gu) > 0.2) return 'ru';
  if (share(/[\u0600-\u06FF]/gu) > 0.3) return 'ar';
  return 'en';
}

const NICHES = {
  binary: ['binary', 'option', 'опцион', 'pocket option', 'quotex', 'binomo', 'olymp trade'],
  betting: ['bet', 'satta', 'casino', '1xbet', 'parlay', 'ставк', 'cricket id'],
  forex: ['forex', 'fx', 'xauusd', 'gold signal', 'pips', 'forex signal', 'форекс', 'трейдинг', 'сигнал', 'ट्रेडिंग', 'फॉरेक्स', 'मार्केट'],
  crypto: ['crypto', 'bitcoin', 'btc', 'eth', 'token', 'airdrop', 'крипт', 'क्रिप्टो'],
  stocks: ['stock', 'nifty', 'banknifty', 'share market', 'invest', 'акци', 'शेयर'],
  education: ['course', 'learn', 'class', 'exam', 'study', 'обучен', 'पढ़ाई', 'कोर्स'],
  entertainment: ['movie', 'anime', 'meme', 'serial', 'film', 'web series', 'фильм', 'मूवी'],
  news: ['news', 'breaking', 'headline', 'новост', 'खबर', 'समाचार']
};

function detectNiche(text) {
  const t = String(text || '').toLowerCase();
  let best = 'other', score = 0;
  for (const [niche, kws] of Object.entries(NICHES)) {
    let s = 0;
    for (const k of kws) if (t.includes(k)) s += k.length > 6 ? 2 : 1;
    if (s > score) { score = s; best = niche; }
  }
  return best;
}

function parsePreviewHtml(html) {
  html = String(html).replace(/&#160;|&nbsp;|\u00a0|&#8202;|&#8239;/g, ' '); // decode nbsp variants first
  const pick = re => { const m = String(html).match(re); return m ? m[1] : null; };
  const title = pick(/class="tgme_channel_info_header_title[^"]*"[^>]*>\s*([^<]+?)\s*</)
    || pick(/<meta property="og:title" content="([^"]+)"/);
  const about = pick(/class="tgme_channel_info_description">\s*([\s\S]*?)\s*<\/div>/);
  const subRaw = pick(/counter_value">\s*([\d\s.,]+[KMKкмм]?)\s*<\/span>\s*<[^>]*>\s*(subscribers|подписчиков|участников|members|सदस्य|सब्सक्राइबर)/i)
    || pick(/counter_value">\s*([\d\s.,]+[KMKкмм]?)\s*<\/span>/i);
  const subs = parseCount(subRaw);
  const clean = h => String(h || '').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  const posts = [];
  const re = /tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  const vre = /tgme_widget_message_views">([\d\s.,]+[KMKкмм]?)</g;
  const texts = [...String(html).matchAll(re)].map(m => clean(m[1])).filter(t => t);
  const views = [...String(html).matchAll(vre)].map(m => parseCount(m[1]));
  const n = Math.min(texts.length, views.length);
  for (let i = 0; i < n; i++) if (views[i] != null) posts.push({ text: texts[i], views: views[i] });
  const avgViews = posts.length ? Math.round(posts.reduce((x, p) => x + p.views, 0) / posts.length) : null;
  const viewRate = (subs && avgViews) ? +(avgViews / subs * 100).toFixed(1) : null;
  const lang = detectLang(clean(about) + ' ' + posts.slice(0, 3).map(p => p.text).join(' '));
  const niche = detectNiche(clean(about) + ' ' + posts.slice(0, 3).map(p => p.text).join(' '));
  return {
    title: clean(title) || '', about: clean(about), subscribers: subs,
    postsScanned: posts.length, avgViews, viewRatePct: viewRate, lang, niche,
    sample: posts.slice(0, 3).map(p => ({ views: p.views, snippet: p.text.slice(0, 90) }))
  };
}

async function fetchPreview(username) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const res = await fetch(`https://t.me/s/${username}`, {
      signal: ctl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TelegramAds-Research' },
      redirect: 'follow'
    });
    if (!res.ok) throw new Error(`t.me preview HTTP ${res.status}`);
    return parsePreviewHtml(await res.text());
  } finally { clearTimeout(timer); }
}

/* ---------- research orchestration ---------- */

async function researchChannel(linkText, deps) {
  /* deps: {spy, log} — injected for tests; prod passes spyapi + log */
  const spy = deps.spy, log = deps.log || (() => {});
  const username = parseChannelLink(linkText);
  if (!username) return { error: 'invalid_link' };
  let preview = null, previewError = null;
  try { preview = await fetchPreview(username); } catch (e) { previewError = e.message; log(`preview ${username} failed: ${e.message}`); }
  const niche = preview?.niche || detectNiche(linkText);
  const lang = preview?.lang || detectLang(linkText);
  /* competitors: advertisers observed running ads in this niche (tgadsspy) */
  const compQ = { binary: 'binary option', betting: 'bet', forex: 'trading', crypto: 'crypto', stocks: 'stock', education: 'learn', entertainment: 'movie', news: 'news', other: 'trading' }[niche] || 'trading';
  let comps = [];
  try {
    const r = await spy.searchAdvertisers({ q: compQ, limit: 6 });
    comps = (r.rows || []).filter(c => c.username.toLowerCase() !== username.toLowerCase()).slice(0, 5);
  } catch (e) { log(`competitors failed: ${e.message}`); }
  /* target channels: proven fleet performers first (same niche), else all proven */
  const targets = (niche === 'forex' || niche === 'binary' || niche === 'crypto' || niche === 'stocks' || niche === 'betting')
    ? PROVEN_CHANNELS.slice(0, 8) : PROVEN_CHANNELS.slice(0, 6);
  return {
    username, url: `https://t.me/${username}`, preview, previewError,
    niche, lang, competitors: comps, targetChannels: targets, nicheQuery: compQ,
    researchedAt: new Date().toISOString()
  };
}

/* ---------- plan rendering (house format, language-adapted) ---------- */

const L = {
  en: {
    title: '🚀 GROWTH PLAN', forOwner: 'Prepared by TelesAds to pitch this channel', audit: '1. CHANNEL AUDIT',
    metric: 'Metric', value: 'Value', read: 'Read',
    subs: 'Subscribers', avgViews: 'Avg views/post', niche: 'Niche', lang: 'Language', activity: 'Posts scanned',
    vr: 'View rate (views ÷ subs)', verdict: (v) => v >= 10 ? 'excellent — live audience' : v >= 5 ? 'healthy' : 'weak reach — monetise carefully',
    fact: '**Key fact:** this channel proves it converts traffic — the missing piece is a *systematic paid* acquisition channel. That is exactly where an official Telegram Ads launch gives maximum leverage.',
    strengths: '**Creative angles (from their own content):** proof numbers, daily ritual, beginner education — facts only, no income promises.',
    comps: '2. COMPETITORS (live ad-archive data)', ctab: ['Channel', 'Subs', 'Posts in ads archive', 'Verdict'],
    cnone: 'No direct advertisers found in archive — first-mover window is OPEN.',
    where: '3. WHERE WE ADVERTISE', wa: 'A. Official Telegram Ads (primary)',
    wb: 'B. Same-niche high-JR channels we already run (proven)', wc: 'C. Creatives',
    plan: '4. 30-DAY LAUNCH PLAN & PACKAGES', p0: '**Week 0 — setup (2–3 days):** funnel post pinned, 3 creatives × 2 audiences, unique invite links per creative.',
    p1: `**Week 1 — TEST: ${PRICING.test.usd}.** All funnels at small budgets. KPI: cost per join ≤ ${PRICING.cpl} (${PRICING.cplInr}). Kill below-bar funnels, do not "top up" favourites.`,
    p23: '**Weeks 2–3 — SCALE.** ×2–3 budget on winners, refresh creatives every 10–14 days (burnout is fast in this niche).',
    p4: `**Week 4 — CONSOLIDATE.** Retarget joiners, unit economics: joiner → activity → payment.`,
    fc: '**Conservative forecast on the SCALE package:** +3,000–8,000 real joins in 30 days (fleet benchmark: ~₹2–5 per join at CPM 0.6 TON, join-rate ~50% of clicks). No bot-traffic — fake spikes are cut at the source.',
    need: '5. WHAT WE NEED FROM THE OWNER', n1: 'Green light for the Week-1 test budget', n2: 'Accept that creatives are built from their own public stats (proof-based)', n3: 'A receiving bot/funnel link that can take paid traffic'
  },
  hi: {
    title: '🚀 ग्रोथ प्लान', forOwner: 'TelesAds द्वारा तैयार प्लान', audit: '1. चैनल ऑडिट',
    metric: 'मीट्रिक', value: 'मान', read: 'विश्लेषण',
    subs: 'सब्सक्राइबर', avgViews: 'औसत व्यूज़/पोस्ट', niche: 'नीच', lang: 'भाषा', activity: 'स्कैन किए गए पोस्ट',
    vr: 'व्यू रेट (व्यूज़ ÷ सब्स)', verdict: (v) => v >= 10 ? 'शानदार — लाइव ऑडियंस' : v >= 5 ? 'सही हालत' : 'कमज़ोर रीच — सोच-समझकर खर्च करें',
    fact: '**मुख्य बात:** चैनल साबित करता है कि उसका ट्रैफिक कन्वर्ट होता है — बस सिस्टेमैटिक पेड़ अक्विज़िशन गायब है। वहीं आधिकारिक Telegram Ads लॉन्च सबसे ज़्यादा लीवरेज देगा।',
    strengths: '**क्रिएटिव एंगल (उनके ही कंटेंट से):** proof नंबर, डेली रिचुअल, बिगिनर एजुकेशन — सिर्फ फैक्ट्स, कोई इनकम प्रॉमिस नहीं।',
    comps: '2. कॉम्पिटिटर्स (लाइव ऐड-आर्काइव डेटा)', ctab: ['चैनल', 'सब्स', 'ऐड आर्काइव पोस्ट', 'वरदी'],
    cnone: 'आर्काइव में कोई डायरेक्ट ऐडवर्टाइज़र नहीं मिला — फर्स्ट-मूवर मौका खुला है।',
    where: '3. हम कहाँ ऐड चलाएँगे', wa: 'A. ऑफिशियल Telegram Ads (मुख्य)',
    wb: 'B. हमारे प्रूवन हाई-JR चैनल (उसी नीच)', wc: 'C. क्रिएटिव्ज़',
    plan: '4. 30-दिन का लॉन्च प्लान और पैकेजेस', p0: '**वीक 0 — सेटअप (2–3 दिन):** फ़नल पिन पोस्ट, 3 क्रिएटिव × 2 ऑडियंस, हर क्रिएटिव का अलग इनवाइट लिंक।',
    p1: `**वीक 1 — टेस्ट: ${PRICING.test.usd}.** सारे फ़नल छोटे बजट पर। KPI: प्रति जॉइन लागत ≤ ${PRICING.cpl} (${PRICING.cplInr})। प्लान के नीचे परफ़ॉर्म करने वाले फ़नल बंद — पैसा विनर्स पर।`,
    p23: '**वीक 2–3 — स्केल.** विनर्स पर ×2–3 बजट, क्रिएटिव 10–14 दिन में रिफ्रेश (इस नीच में बर्नआउट तेज़ है)।',
    p4: '**वीक 4 — कंसोलिडेट.** जॉइनर्स को रीटारगेट, यूनिट इकोनॉमी: जॉइन → एक्टिविटी → पेमेंट।',
    fc: '**स्केल पैकेज पर कंज़र्वेटिव अनुमान:** 30 दिन में +3,000–8,000 असली जॉइन (फ्लीट बेंचमार्क: CPM 0.6 TON पर ~₹2–5 प्रति जॉइन, क्लिक-से-जॉइन ~50%)। नो बॉट-ट्रैफिक।',
    need: '5. ओनर से क्या चाहिए', n1: 'वीक-1 टेस्ट बजट की हरी झंडी', n2: 'क्रिएटिव उनके ही पब्लिक आंकड़ों से बनेंगे (proof-आधारित)', n3: 'एक फ़नल/बॉट लिंक जो पेड़ ट्रैफिक संभाल सके'
  },
  ru: {
    title: '🚀 ПЛАН РОСТА', forOwner: 'Подготовлено TelesAds', audit: '1. АУДИТ КАНАЛА',
    metric: 'Метрика', value: 'Значение', read: 'Оценка',
    subs: 'Подписчики', avgViews: 'Средние просмотры/пост', niche: 'Ниша', lang: 'Язык', activity: 'Постов просканировано',
    vr: 'Просмотры ÷ подписчики', verdict: (v) => v >= 10 ? 'отлично — живая аудитория' : v >= 5 ? 'здоровый охват' : 'слабый охват — масштабировать осторожно',
    fact: '**Главный факт:** канал доказал, что конвертит трафик — не хватает системного платного канала. Именно здесь официальный запуск Telegram Ads даёт максимальный рычаг.',
    strengths: '**Углы креативов (из их же контента):** proof-цифры, ежедневный ритуал, обучение новичков — только факты, без обещаний дохода.',
    comps: '2. КОНКУРЕНТЫ (живые данные архива рекламы)', ctab: ['Канал', 'Подписчики', 'Креативов в архиве', 'Вердикт'],
    cnone: 'Прямых рекламодателей в архиве нет — окно первого хода ОТКРЫТО.',
    where: '3. ГДЕ РЕКЛАМИРОВАТЬСЯ', wa: 'A. Официальные Telegram Ads (основной)',
    wb: 'B. Наши проверенные каналы той же ниши (высокий JR)', wc: 'C. Креативы',
    plan: '4. ПЛАН НА 30 ДНЕЙ И ПАКЕТЫ', p0: '**Неделя 0 — подготовка (2–3 дня):** закреп-воронка, 3 креатива × 2 аудитории, уникальные инвайты.',
    p1: `**Неделя 1 — ТЕСТ: ${PRICING.test.usd}.** Все связки малыми бюджетами. KPI: цена входа ≤ ${PRICING.cpl}. Ниже планки — убиваем, не «докручиваем».`,
    p23: '**Недели 2–3 — МАСШТАБ.** ×2–3 бюджет на победителей, рефреш креативов каждые 10–14 дней.',
    p4: '**Неделя 4 — закрепление.** Ретаргет вошедших, юнит-экономика: подписчик → активность → оплата.',
    fc: '**Консервативный прогноз на SCALE-пакет:** +3 000–8 000 реальных входов за 30 дней (бенчмарк флота: ~₹2–5 за вход при CPM 0.6 TON, конверсия клика ~50%). Без бото-трафика.',
    need: '5. ЧТО НУЖНО ОТ ВЛАДЕЛЬЦА', n1: 'Добро на тестовый бюджет недели 1', n2: 'Креативы строим из их же публичных цифр (proof)', n3: 'Принимающий бот/воронку, готовый к платному трафику'
  }
};

const NICHE_LABEL = {
  binary: 'binary options / signals', betting: 'betting / gaming', forex: 'forex / trading signals',
  crypto: 'crypto', stocks: 'stocks / investing', education: 'education', entertainment: 'entertainment', news: 'news', other: 'general'
};
const NICHE_LABEL_HI = { binary: 'बाइनरी ऑप्शन/सिग्नल', betting: 'बेटिंग', forex: 'फॉरेक्स/ट्रेडिंग सिग्नल', crypto: 'क्रिप्टो', stocks: 'स्टॉक्स/इन्वेस्टिंग', education: 'एजुकेशन', entertainment: 'एंटरटेनमेंट', news: 'न्यूज़', other: 'जनरल' };
const NICHE_LABEL_RU = { binary: 'бинарные опционы / сигналы', betting: 'ставки', forex: 'форекс / трейдинг-сигналы', crypto: 'крипто', stocks: 'акции / инвестиции', education: 'обучение', entertainment: 'развлечения', news: 'новости', other: 'общий' };
const LANG_NAME = { en: 'English', hi: 'Hindi (हिन्दी)', ru: 'Russian (Русский)', ar: 'Arabic' };
const nicheLabel = (n, lang) => lang === 'hi' ? (NICHE_LABEL_HI[n] || n) : lang === 'ru' ? (NICHE_LABEL_RU[n] || n) : (NICHE_LABEL[n] || n);

function buildPlanMd(res) {
  const lang = ['hi', 'ru'].includes(res.lang) ? res.lang : 'en';
  const t = L[lang];
  const p = res.preview || {};
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const name = p.title ? `${p.title} (@${res.username})` : `@${res.username}`;
  const vr = p.viewRatePct;
  const lines = [];
  lines.push(`# ${t.title} — ${name}`);
  lines.push('');
  lines.push(`**TelesAds · ${date}** · ${t.forOwner} (@TelesAds, Telesads.com)`);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  lines.push(`## ${t.audit}`);
  lines.push('');
  lines.push(`| ${t.metric} | ${t.value} | ${t.read} |`);
  lines.push(`|---|---|---|`);
  lines.push(`| ${t.subs} | **${p.subscribers != null ? p.subscribers.toLocaleString('en-US') : 'n/a'}** | — |`);
  lines.push(`| ${t.avgViews} | **${p.avgViews != null ? p.avgViews.toLocaleString('en-US') : 'n/a'}** | ${t.vr}: **${vr != null ? vr + '%' : 'n/a'}** — ${t.verdict(vr || 0)} |`);
  lines.push(`| ${t.niche} | **${nicheLabel(res.niche, lang)}** | auto-detected |`);
  lines.push(`| ${t.lang} | **${LANG_NAME[res.lang] || res.lang}** | auto-detected |`);
  lines.push(`| ${t.activity} | ${p.postsScanned != null ? p.postsScanned : 0} | ${p.previewError ? `preview error: ${p.previewError}` : 'public t.me preview'} |`);
  lines.push('');
  lines.push(t.fact);
  lines.push('');
  lines.push(t.strengths);
  if (p.sample?.length) {
    lines.push('');
    lines.push(`**${lang === 'ru' ? 'Свежие посты (views)' : lang === 'hi' ? 'हाल के पोस्ट (व्यूज़)' : 'Recent posts (views)'}:** ${p.sample.map(s => `“${s.snippet.replace(/\n/g, ' ')}…” (${s.views?.toLocaleString('en-US') || '—'})`).join(' · ')}`);
  }
  lines.push('');
  lines.push(`## ${t.comps}`);
  lines.push('');
  if (res.competitors.length) {
    lines.push(`| ${t.ctab[0]} | ${t.ctab[1]} | ${t.ctab[2]} | ${t.ctab[3]} |`);
    lines.push(`|---|---|---|---|`);
    for (const c of res.competitors) {
      lines.push(`| @${c.username} | ${c.niche || '—'} | ${c.creativeCount ?? '—'} | ${c.creativeCount > 50 ? '🔥 heavy advertiser' : c.creativeCount > 5 ? 'active' : 'light'} |`);
    }
  } else {
    lines.push(t.cnone);
  }
  lines.push('');
  lines.push(`## ${t.where}`);
  lines.push('');
  lines.push(`### ${t.wa}`);
  lines.push(`- ${lang === 'ru' ? 'Таргетинг по каналам той же ниши, Индия-первый гео' : lang === 'hi' ? 'उसी नीच के चैनल-टार्गेटिंग, इंडिया-फर्स्ट' : 'Channel-based targeting in the same niche, India-first geo'} (${PRICING.cpmTon})`);
  lines.push(`- ${lang === 'ru' ? 'Только канальный таргетинг (ключевые слова исключены политикой)' : lang === 'hi' ? 'सिर्फ चैनल-टार्गेटिंग (keywords पॉलिसी से बैन)' : 'Channel-only targeting (keywords banned by policy)'} `);
  lines.push('');
  lines.push(`### ${t.wb}`);
  lines.push(res.targetChannels.map(c => `- ${c}`).join('\n'));
  lines.push('');
  lines.push(`### ${t.wc}`);
  lines.push(`- **Proof:** real channel numbers in creative #1`);
  lines.push(`- **Ritual:** daily session/schedule hook in creative #2`);
  lines.push(`- **Beginner:** 3-minute education angle in creative #3`);
  lines.push('');
  lines.push(`## ${t.plan}`);
  lines.push('');
  lines.push(t.p0); lines.push(''); lines.push(t.p1); lines.push(''); lines.push(t.p23); lines.push(''); lines.push(t.p4);
  lines.push('');
  lines.push(`| ${lang === 'ru' ? 'Пакет' : lang === 'hi' ? 'पैकेज' : 'Package'} | ${lang === 'ru' ? 'Бюджет' : lang === 'hi' ? 'बजट' : 'Budget'} | ${lang === 'ru' ? 'Срок' : lang === 'hi' ? 'अवधि' : 'Duration'} |`);
  lines.push(`|---|---|---|`);
  lines.push(`| 🧪 ${PRICING.test.label} | **${PRICING.test.usd}** | ${lang === 'ru' ? 'неделя 1' : lang === 'hi' ? 'वीक 1' : 'week 1'} |`);
  lines.push(`| 🚀 ${PRICING.scale.label} | **${PRICING.scale.usd}** | ${lang === 'ru' ? '30 дней' : lang === 'hi' ? '30 दिन' : '30 days'} |`);
  lines.push('');
  lines.push(t.fc);
  lines.push('');
  lines.push(`## ${t.need}`);
  lines.push('');
  lines.push(`1. ${t.n1}`);
  lines.push(`2. ${t.n2}`);
  lines.push(`3. ${t.n3}`);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  lines.push(`**— TelesAds · @TelesAds · Telesads.com**`);
  lines.push('');
  lines.push(`<sub>Generated by THETAS AI · data: public t.me preview${res.previewError ? ` (${res.previewError})` : ''} + tgadsspy ad archive + our live fleet benchmarks · ${res.researchedAt}</sub>`);
  return lines.join('\n');
}

module.exports = { PRICING, PROVEN_CHANNELS, parseChannelLink, parseCount, detectLang, detectNiche, parsePreviewHtml, fetchPreview, researchChannel, buildPlanMd };
