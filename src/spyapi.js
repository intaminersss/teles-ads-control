'use strict';
/* tgadsspy.com ads-archive client — 6-key rotation.
   VERIFIED endpoints (live-tested with provided keys):
   - GET /api/v1/advertisers?q=&limit= → active advertisers (tgUsername, creativeCount, primaryNiche, lastSeenAt).
   - /api/v1/search & /api/v1/channels exist but return empty channel data on FREE-plan keys — NOT used (honesty rule).
   Data meaning: accounts OBSERVED running Telegram ads — not audience demographics. */
const { config } = require('./config');

let keyIdx = 0;
const nextKey = () => {
  if (!config.TGADSSPY_KEYS.length) throw new Error('No TGADSSPY keys configured');
  const k = config.TGADSSPY_KEYS[keyIdx % config.TGADSSPY_KEYS.length];
  keyIdx++;
  return k;
};

async function spyGet(path, params = {}) {
  const url = new URL(`https://tgadsspy.com${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  let lastErr;
  for (let attempt = 0; attempt < Math.min(config.TGADSSPY_KEYS.length, 3); attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20000);
    try {
      const res = await fetch(url, { headers: { 'X-Api-Key': nextKey() }, signal: ctl.signal });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) { lastErr = new Error(`tgadsspy: non-JSON (HTTP ${res.status})`); continue; }
      const j = await res.json();
      if (!res.ok) { lastErr = new Error(`tgadsspy HTTP ${res.status}`); continue; }
      return j;
    } catch (e) { lastErr = e; }
    finally { clearTimeout(t); }
  }
  throw lastErr || new Error('tgadsspy unavailable');
}

/* Search advertiser-active accounts by keyword. */
async function searchAdvertisers({ q, limit = 8 } = {}) {
  const j = await spyGet('/api/v1/advertisers', { q, limit });
  const rows = (j.data || []).map(r => ({
    username: (r.tgUsername || r.slug?.replace(/^tg-/, '') || '').replace('@', ''),
    title: r.name || r.tgUsername || r.slug || '',
    creativeCount: r.creativeCount ?? null,
    niche: r.primaryNiche || '',
    lastSeenAt: r.lastSeenAt || null
  })).filter(r => r.username);
  return { rows, total: j.total ?? rows.length, source: 'tgadsspy advertisers (accounts observed running Telegram ads)' };
}

/* Compatibility wrapper used by research handler. */
const searchChannels = searchAdvertisers;

module.exports = { searchAdvertisers, searchChannels };
