'use strict';
/* Config — env validation + redaction helpers. Secrets never logged. */
try { require('dotenv').config(); } catch { /* dotenv optional (Railway injects env directly) */ }

const need = (k, dflt) => {
  const v = process.env[k] ?? dflt;
  if (v === undefined) { console.error(`[config] MISSING env: ${k}`); process.exitCode = 1; return ''; }
  return v;
};
const list = (k, dflt = '') => (process.env[k] ?? dflt).split(',').map(s => s.trim()).filter(Boolean);

const config = {
  BOT_TOKEN: need('TELEGRAM_BOT_TOKEN'),
  BOT_MODE: (process.env.BOT_MODE || 'polling').toLowerCase(), // polling only (webhook forbidden by spec)
  ALLOWED_USER_IDS: list('ALLOWED_USER_IDS').map(Number),
  ADMIN_IDS: list('ADMIN_IDS', process.env.ALLOWED_USER_IDS || '').map(Number),

  ADS_API_TOKEN: process.env.ADS_API_TOKEN || '',
  ADS_API_BASE: 'https://promoteapi.telegram.org',

  TGADSSPY_KEYS: list('TGADSSPY_KEYS', [process.env.TGADSSPY_KEY].filter(Boolean).join(',')),

  SUPABASE_DB_URL: need('SUPABASE_DB_URL'),
  PORT: Number(process.env.PORT || 8080),

  AI_ORDER: list('AI_ORDER', 'groq,nvidia,openrouter,gemini,mistral,pollinations'),
  PROVIDERS: {
    groq: { keys: list('GROQ_API_KEYS', process.env.GROQ_API_KEY || ''), models: list('GROQ_MODELS', 'llama-3.3-70b-versatile'), base: 'https://api.groq.com/openai/v1/chat/completions' },
    nvidia: { keys: list('NVIDIA_API_KEYS', process.env.NVIDIA_API_KEY || ''), models: list('NVIDIA_MODELS', 'meta/llama-3.1-70b-instruct'), base: 'https://integrate.api.nvidia.com/v1/chat/completions' },
    openrouter: { keys: list('OPENROUTER_API_KEYS', process.env.OPENROUTER_API_KEY || ''), models: list('OPENROUTER_MODELS', 'qwen/qwen-2.5-72b-instruct'), base: 'https://openrouter.ai/api/v1/chat/completions' },
    gemini: { keys: list('GEMINI_API_KEYS', process.env.GEMINI_API_KEY || ''), models: list('GEMINI_MODELS', 'gemini-2.0-flash'), base: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' },
    mistral: { keys: list('MISTRAL_API_KEYS', process.env.MISTRAL_API_KEY || ''), models: list('MISTRAL_MODELS', 'mistral-large-latest'), base: 'https://api.mistral.ai/v1/chat/completions' },
    pollinations: { keys: list('POLLINATIONS_API_KEYS', process.env.POLLINATIONS_API_KEY || ''), models: ['openai'], base: 'https://gen.pollinations.ai/openai/chat/completions' }
  },
  AI_TIMEOUT_MS: Number(process.env.AI_TIMEOUT_MS || 45000),

  DEFAULT_TARGET_JSON: process.env.DEFAULT_TARGET_JSON || ''
};

/** Redact anything that looks like a secret for logs/errors. */
function redact(str) {
  return String(str)
    .replace(/\b(sk|gsk|nvapi|hf_|tgs_|sbp_|brk_|mstrl)[-_][A-Za-z0-9._-]{6,}/g, m => m.slice(0, 8) + '***')
    .replace(/\b\d{8,10}:[A-Za-z0-9_-]{30,}/g, m => m.split(':')[0] + ':***')
    .replace(/(Authorization|X-Api-Key|Bearer)([^,}\]]{0,6})[^,}\]]*/gi, '$1$2***');
}

module.exports = { config, redact };
