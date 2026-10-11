# TEST AND VERIFICATION REPORT — v3 (2026-10-12)
All commands were executed in this workspace; results recorded verbatim below.

## 1. Automated suites (commands + results)
```
node --test test/unit.test.js test/v2.test.js test/failure.test.js
  → # tests 30  # pass 30  # fail 0
TEST tokens → node --test test/live.integration.test.js
  → # tests 4  # pass 4  # fail 0   (read-only: Ads account, getMe, tgadsspy, no-mutation guard)
GROQ key → node --test test/live.switch.test.js
  → # tests 1  # pass 1  # fail 0   (bogus-key provider → REAL Groq fallback, attempts=2, breaker records)
TOTAL: 35/35 PASS
```

## 2. §13 Provider-failure matrix (failure.test.js — mocked fetch, labeled)
| Scenario | Test | Result |
|---|---|---|
| 429 Retry-After → bounded same-provider retry succeeds | FAIL-A sc.1 | PASS (exactly 2 calls) |
| Persistent 429 → falls to next provider | FAIL-A sc.2 | PASS |
| Invalid API key (401) → no same-provider retry, breaker records | FAIL-B | PASS |
| ALL providers down → clean aggregated error | FAIL-C | PASS |
| Budget cap = HARD STOP (zero network calls) | FAIL-D | PASS — enforced, not displayed |
| Cooldown recovery (half-open → success) | FAIL-E | PASS |
| Malformed payload (no choices) → classified, moves on | FAIL-F | PASS (attempts=2) |
| DB down during budget check → fail-closed, no network | FAIL-G | PASS |
| Duplicate consequential op blocked | FAIL-H | PASS |
| Secret redaction in logs | FAIL-I | PASS |
| LIVE independent-provider fallback | live.switch | PASS (real Groq call ~20 tokens) |

## 3. Feature-path verification (interaction → backend → API → DB → reply)
| Path | Verification | Status |
|---|---|---|
| Boot → getMe → setMyCommands → polling | Railway deploy logs (f24ccd5f + next deploy) show clean sequence | VERIFIED |
| Ads board (list→API→render) | adsapi live read in integration test + prod logs | VERIFIED (data path) · UI VERIFICATION REQUIRED (owner tap) |
| Research search → tgadsspy → DB upsert → render | live smoke: "trading" → @bmrtradingbot 264 ads | VERIFIED |
| AI copy generation (non-stream) | live.switch test real completion | VERIFIED |
| AI streaming drafts (sendMessageDraft) | contract verified vs Bot API 10.3 docs; SSE parser unit-covered via failure suite; in-chat visual | VERIFICATION REQUIRED (owner /start) |
| Draft launch (confirm→idempotency→audit→createAd) | createAd live-verified historically (ads 94–98); guards unit-tested | VERIFIED logic · live launch intentionally NOT triggered (no paid actions without authorization) |
| Delete/pause actions | editAd/deleteAd live-verified historically (77/98 deletions) | VERIFIED |
| Reports/digest/alerts | scheduler running in prod logs; digest window logic unit-covered | PARTIALLY — first live digest pending 21:00 IST |
| Public health endpoint | Railway domain bot-production-c2eb.up.railway.app → GET / | VERIFIED via curl after deploy (see below) |

## 4. Known untested/unverified (honest)
- In-chat visual flows require owner interaction (bot cannot message non-/start users) — single action needed from owner.
- Custom-emoji button icons: eligibility-gated by Telegram; no IDs available → fallback path only (never invented).
- Gemini/Mistral/Pollinations/NVIDIA/OpenRouter legs configured but only exercised via config; chain order starts at Groq (live-tested). Fallback machinery itself is provider-agnostic and proven with mocks + one real provider.

## 5. Regression status
All v1/v2 capabilities retained; suite extended, nothing removed. Webhook-forbidden spec test still green (SPEC test).

## 6. Deployment verification cycle (v3) — recorded honestly
| Deploy | Result | Root cause | Fix |
|---|---|---|---|
| ebea05e | CRASHED | `log is not a function` — pino migration left 2 old call-shapes (health listen cb, wrap-error) | renamed to logLine/log.error |
| next | CRASHED | `logLine is not a function` — pollLoop still received pino object | pass logLine |
| **e48fa138+** | **SUCCESS** | — | clean boot: authorized → scheduler → polling; **public health check from sandbox: `GET https://bot-production-c2eb.up.railway.app/` → {"ok":true,"mode":"polling","uptime":76}`** |

**Process improvement adopted:** local boot-smoke (fake token, 4s run) now precedes every deploy — catches boot-path type errors without touching production. This cycle is exactly why spec §8 mandates log inspection instead of trusting exit codes.

## 7. Final suite state at deploy
35/35 PASS (30 offline + 5 live). Security scan green post-docs. Webhook-forbidden test green.

## 8. Rebrand cycle (THETAS AI) — production-surfaced bugs & fixes
Owner's real taps on the live bot surfaced 2 handler errors (found in Railway logs — the monitoring loop works):
1. `fmt.money is not a function` (reports) — v2 shim destructured non-existent export → aliased to ui.inr.
2. `r.map is not a function` (ui.js kb) — malformed keyboard rows crashed screen → kb() hardened (filters invalid rows); PLUS missing `ads:pN` pager route (taps fell through to adDetail(NaN)) → routed; `res:page` NaN clamped; searchPage state-safe.
All fixed, 35/35 tests green, deployed SUCCESS, public health verified. Tests updated to be rebrand-aware (THETAS AI) and archive-excluded (secrets-scan walks product code only; archive never enters git).
