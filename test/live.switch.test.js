'use strict';
/* LIVE AI-switching test — proves REAL provider fallback, not a status display.
   Strategy: provider list with a BOGUS-key provider first, real Groq second.
   chat() must: fail on provider 1 (auth error → breaker), succeed on provider 2 (Groq),
   report attempts=2. Uses ~10 completion tokens on the real provider. */
const test = require('node:test');
const assert = require('node:assert');

test('LIVE: actual provider switching (bogus key → Groq fallback)', { skip: !process.env.TEST_GROQ_KEY ? 'no TEST_GROQ_KEY' : false }, async () => {
  process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '111111111:test';
  process.env.SUPABASE_DB_URL = process.env.SUPABASE_DB_URL || 'postgresql://localhost:1/x';
  // in-memory DB substitute: budget check + usage insert must not block switching proof
  const dbPath = require.resolve('../src/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    q: async () => [0], one: async () => null,
    tx: async fn => fn({ query: async () => ({ rows: [] }) }),
    healthy: async () => true, pool: { connect: async () => ({ release() {}, query: async () => ({ rows: [] }) }) }
  } };
  delete require.cache[require.resolve('../src/ai')];
  process.env.AI_ORDER = 'groq,fakeprov';                 // pretend config
  process.env.GROQ_API_KEYS = process.env.TEST_GROQ_KEY;
  process.env.GROQ_MODELS = 'allam-2-7b';
  process.env.PROVIDERS_override = '';
  const cfgPath = require.resolve('../src/config');
  delete require.cache[cfgPath];
  process.env.FAKEPROV_KEYS = 'sk-bogus-bogus';
  // inject a fake provider by rewriting config map after load:
  const { config } = require('../src/config');
  config.AI_ORDER = ['fakeprov', 'groq'];
  config.PROVIDERS.fakeprov = { keys: ['sk-bogus-invalid-key-for-switch-test'], models: ['x'], base: 'https://api.groq.com/openai/v1/chat/completions' };
  config.PROVIDERS.groq.keys = [process.env.TEST_GROQ_KEY];

  const ai = require('../src/ai');
  const attempts = [];
  const r = await ai.chat([{ role: 'user', content: 'Reply with exactly: SWITCH OK' }], {
    purpose: 'switch-test', tgId: null, maxTokens: 20,
    onAttempt: (p, n, total) => attempts.push(`${p} ${n}/${total}`)
  });
  assert.ok(r.text.toUpperCase().includes('SWITCH'), `got: ${r.text.slice(0, 40)}`);
  assert.strictEqual(r.meta.provider, 'groq', 'fell through to Groq');
  assert.strictEqual(r.meta.attempts, 2, `attempts: ${r.meta.attempts}`);
  assert.deepStrictEqual(attempts, ['fakeprov 1/2', 'groq 2/2'], 'onAttempt saw real tries');
  assert.ok(ai.circuitState().fakeprov.fails >= 1, 'failure recorded for bogus provider (breaker needs threshold to open — covered in unit test)');
});
