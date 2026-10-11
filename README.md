# THETAS AI (Fully Built By Agency @TelesAds — Telesads.com) v3

Telegram-native advertising assistant for the **official Telegram Ads platform**.
Built per the Autonomous Product Engineering Master Prompt (source requirements: `uploads/teles_telegram_ads_master_prompt (1).txt`).

## What it does (verified capabilities)
- 📊 Live ads board: list/detail, views/clicks/joins/spend, join-rate — official `promoteapi.telegram.org`
- ⏸️▶️ Pause/resume, 🗑️ delete (with confirmation + audit), 📅 daily cap edit
- 🚀 Drafts → real ad launch (confirmation + idempotency + audit)
- 🔬 Channel research: tgadsspy advertiser archive + Telegram Ads placement validation + saved lists + CSV
- ✍️ AI Copy Studio: multi-provider (Groq→NVIDIA→OpenRouter→Gemini→Mistral→Pollinations), rotation keys, DB-enforced daily budget stops
- 📈 Reports: period deltas + CSV export
- 🔔 Alerts: daily digest + balance threshold (in-process scheduler)
- 🧾 Audit log, rate limiting, owner-only access

## Honest limitations
- No audience demographics / reach forecasts (platform does not expose them)
- Join attribution = platform `joins` counter only
- AI cost figures are estimates; research data = observed ad activity, not audience guarantees
- Polling only (webhook forbidden by spec)

## Run
```
npm install && npm test
npm start   # requires env (see .env.example)
```
## Deploy (Railway)
Worker service from this repo (or `railway up`), env per `.env.example`. Health endpoint on `$PORT` for platform checks.

## Tests
35 tests across 5 suites: unit, design-system (v2), failure-matrix (§13: 429/401/outage/budget-hard-stop/cooldown/malformed/DB-down/duplicates/redaction), live read-only integrations, LIVE provider-switching proof.
Run: `node --test test/unit.test.js test/v2.test.js test/failure.test.js`

## Docs
docs/OPEN_SOURCE_INTEGRATION_MANIFEST.md · docs/ARCHITECTURE.md · docs/TELEGRAM_ADS_CAPABILITY_MATRIX.md · docs/UI_UX_DESIGN.md · docs/TEST_AND_VERIFICATION_REPORT.md

## v3 highlights
- Official `sendMessageDraft` streaming AI UX (Bot API 10.3) with Stop button + cancellation
- Button styles by meaning (Bot API 10.2 verified), setMyCommands chrome, all-taps-acked
- pino structured logging + zod validation (env payloads, AI responses, ad creation pre-checks)
- Retry-After + jitter on Telegram AND AI provider calls; circuit breaker w/ cooldown recovery
- Public health endpoint (Railway domain)
