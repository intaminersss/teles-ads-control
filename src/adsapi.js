'use strict';
/* Official Telegram Ads API client (promoteapi.telegram.org).
   CAPABILITY NOTES (verified through live use, not assumed):
   - Auth: Bearer token header + a browser-like User-Agent is required.
   - Known methods in use: getCurrentAccount, getAdsList, getAdsById, createAd,
     editAd (text/target/daily_budget_limit/is_paused), deleteAd, getTargetChannel.
   - editAd on an ACTIVE ad re-enters review (text/target). is_paused/daily caps apply directly.
   - min initial budget observed 1.8 TON; delete has cooldowns (AD_IS_ACTIVE → pause first).
   - getAdsById returns a LIST. Idempotency-Key header recommended on creates.
   - NOT available: audience demographics, reach forecasts, conversion attribution. */
const { config, redact } = require('./config');

/* ---- multi-account support (v6): handlers/account.js switches the active ads account.
     Per-call override wins over the module override; module override wins over env. ---- */
let TOKEN_OVERRIDE = null;                       // active account token (from ad_accounts table)
let OVERRIDE_LABEL = null;                       // human label for screens
const setAccount = (token, label = null) => { TOKEN_OVERRIDE = token || null; OVERRIDE_LABEL = label; };
const clearAccount = () => { TOKEN_OVERRIDE = null; OVERRIDE_LABEL = null; };
const activeToken = () => TOKEN_OVERRIDE || config.ADS_API_TOKEN || '';
const accountLabel = () => OVERRIDE_LABEL || (TOKEN_OVERRIDE ? 'custom account' : 'default (env)');

async function adsCall(method, { body = {}, idemKey, token } = {}) {
  const auth = token || activeToken();
  if (!auth) throw new Error('ADS_API_TOKEN not configured');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 25000);
  try {
    const res = await fetch(`${config.ADS_API_BASE}/${method}`, {
      method: body && Object.keys(body).length ? 'POST' : 'GET',
      headers: {
        'Authorization': `Bearer ${auth}`,
        'User-Agent': 'Mozilla/5.0',
        'Content-Type': 'application/json',
        ...(idemKey ? { 'Idempotency-Key': idemKey } : {})
      },
      ...(body && Object.keys(body).length ? { body: JSON.stringify(body) } : {}),
      signal: ctl.signal
    });
    const j = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
    if (!j.ok) { const e = new Error(j.error || `HTTP ${res.status}`); e.code = j.error; throw e; }
    return j.result;
  } finally { clearTimeout(t); }
}

const ERR_HELP = {
  COUNTRIES_TOO_MANY: 'Platform limit: max 5 countries per ad — split geo across multiple ads.',
  LANGUAGE_AND_CHANNEL_NOT_ALLOWED: 'Channel-targeted ads cannot combine language_codes — drop languages for channel targeting.',
  INITIAL_BUDGET_NOT_ALLOWED: 'Interest/users-topic targeting needs min 4 TON initial budget (channels type allows 1.8+).',
  AD_RESULT_BUDGET_TOO_SMALL: 'Minimum ad budget is 1.8 TON.',
  AD_IS_ACTIVE: 'Ad is active — pause it first, then retry (platform cooldown ~10 min).',
  CHANNEL_TOO_SMALL: 'Channel below Telegram Ads minimum size.',
  JOINCHAT_NOT_MEMBER: 'Private invite-links not accepted — use a public bot/channel link.',
  AD_NOT_FOUND: 'Ad not found (deleted by platform review?). Budget refunds automatically.'
};
const explain = e => ERR_HELP[e.code] ? `${e.message} — ${ERR_HELP[e.code]}` : e.message;

const getCurrentAccount = () => adsCall('getCurrentAccount');
const getAdsList = () => adsCall('getAdsList').then(r => r.ads || []);
const getAdsById = ids => adsCall('getAdsById', { body: { ad_ids: ids } }).then(r => Array.isArray(r) ? r : [r]);
const getTargetChannel = ch => adsCall('getTargetChannel', { body: { channel_id: ch } });
const createAd = (payload, idemKey) => adsCall('createAd', { body: payload, idemKey });
const editAd = (ad_id, patch) => adsCall('editAd', { body: { ad_id, ...patch } });
const deleteAd = ad_id => adsCall('deleteAd', { body: { ad_id } });

module.exports = { adsCall, getCurrentAccount, getAdsList, getAdsById, getTargetChannel, createAd, editAd, deleteAd, explain, setAccount, clearAccount, accountLabel, activeToken };
