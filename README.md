# TELES ADS CONTROL

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
- `test/unit.test.js` — 13 pure-logic tests
- `test/live.integration.test.js` — 4 read-only live tests (skip without tokens)
