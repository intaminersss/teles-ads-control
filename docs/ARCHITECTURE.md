# ARCHITECTURE — TELES ADS CONTROL v3

## Runtime
Node 20 · single worker process · long-polling Telegram updates (webhook forbidden by spec) · Railway deploy (repo-source, auto-deploy on push) · Supabase Postgres (session pooler).

## Layers
```
┌─ Telegram interaction layer
│   src/tg.js        zero-dep Bot API client: bounded Retry-After retries + jitter,
│                    4096 chunking, typing, sendAnimation, sendMessageDraft (10.3)
│   src/index.js     update router: commands, callback routes (all taps acked),
│                    stopped_message_generation → AbortController registry,
│                    setMyCommands chat chrome, owner allowlist gate
│   src/ui.js        design system: brand headers, status pills, real-fraction bars,
│                    pager, style-by-meaning buttons (Bot API 10.2, verified)
├─ Application/service layer
│   src/handlers/*   ads (board/pager/actions) · research (tgadsspy + placement
│                    validation + lists + CSV) · copy (streaming wizard) ·
│                    drafts (launch gate) · reports (snapshot deltas) ·
│                    alerts (digest/balance) · admin (health/about/audit)
│   src/guard.js     allowlist, sliding-window rate limit, one-shot confirmations,
│                    10-min idempotency window, audit trail writer
├─ Integration layer
│   src/adsapi.js    official Telegram Ads API (promoteapi): verified behaviors +
│                    error-help map; payloads validated by zod BEFORE network
│   src/spyapi.js    tgadsspy advertisers (6-key rotation, bounded retries)
│   src/ai.js        provider router: AI_ORDER chain, key rotation, error
│                    classification (auth/rate/transient/bad_request), circuit
│                    breaker (3 fail → 5-min open → half-open), Retry-After +
│                    jitter, streaming SSE (onDelta) + abort fan-in, budget
│                    hard-stop pre-check, usage accounting
├─ Persistence
│   src/db.js        pg Pool → Supabase Postgres (12 tables, schema.sql)
│   jobs/ads_snapshot/ai_usage/audit_log = durable state; no Redis (documented)
├─ Quality
│   test/*.js        35 tests: unit, design-system, failure-matrix (mocked fetch),
│                    live read-only integrations, LIVE provider-switching proof
│   src/log.js       pino structured logs + redaction (paths + free-form)
│   src/validate.js  zod schemas: env-facing payloads, AI responses, ad targets
└─ Ops
    health HTTP :$PORT (public via Railway domain), /health + /audit in-bot,
    scheduler (5-min tick, date-key idempotent digest/alerts)
```

## Key decisions & reasons
1. **Zero-dep TG client over grammY** — production-proven across 6 bots; owner-only traffic; migration churn risk > benefit; capability parity natively implemented (retry, chunking, chrome). Full reasoning: manifest 3.2–3.9.
2. **Official streaming drafts (`sendMessageDraft`)** for AI generation UX — verified against Bot API 10.3 docs; ephemeral 30s → final `sendMessage` persist per official note.
3. **Budget as hard-stop** — pre-call DB check blocks network; enforced (FAIL-D proves zero network calls when over cap).
4. **jobs table over BullMQ/Redis** — workload trivial; infra not justifiable (manifest 7.2–7.3).
5. **Direct pg over supabase-js** — server-side worker; no PostgREST/Auth/Storage used (manifest 7.1).
6. **Repo-public + secrets-in-env** — Railway deploy without GitHub App requires public repo; secret-scan unit test guards against leaks.

## Failure semantics
- Telegram errors: 429/5xx/network → ≤2 bounded retries with jitter/Retry-After; auth errors → no retry.
- Provider errors: classified; auth/rate → circuit fail; transient → circuit fail; bad_request/malformed → move to next model/provider without breaker.
- Budget/DB failure: **fail-closed** (no network) with clean user error (FAIL-G).
- Consequential actions (pause/delete/launch/cap): confirm → idempotency window → audit row.
