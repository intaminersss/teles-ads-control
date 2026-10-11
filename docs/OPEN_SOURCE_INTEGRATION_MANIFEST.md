# OPEN SOURCE INTEGRATION MANIFEST — TELES ADS CONTROL
Inspection date: 2026-10-12. Evidence: GitHub API license/freshness pull (batch, logged in session), direct README/SKILL fetches, and live install/integration tests in this repo.
Statuses: **INTEGRATED** (production) · **DEV-TOOL** · **SKILL-VENDORED** · **EVALUATED-REJECTED** (reason) · **UNAVAILABLE**.

## 3.x Telegram UI & frameworks
| # | Repo | License | Freshness | Verdict | Evidence & Reason |
|---|---|---|---|---|---|
| 3.1 | hlibsuslov/telegram-bot-ui | MIT | 2026-08-07 | **SKILL-VENDORED** | SKILL.md (18,131B) vendored to `.agents/skills/telegram-bot-ui/`; instructions READ & APPLIED: chat-chrome setMyCommands (added), every-tap-acknowledged (added), style-by-meaning buttons (added, verified vs Bot API 10.2 changelog), honest progress rules (spinners tied to real phases), escape-per-format, no invented custom_emoji_id |
| 3.2 | grammyjs/grammY | MIT | 2026-10-01 | **EVALUATED-REJECTED** | Existing zero-dependency Bot API client is production-proven across 6 deployed bots; owner-only traffic makes middleware/concurrency value marginal; migration risk > benefit. Retained capability parity: Retry-After retry (tg.js), safe HTML (esc + chunkText), commands chrome — natively |
| 3.3 | yerdaulet-damir/tgx | MIT | 2026-07-19 | **EVALUATED-REJECTED** | Self-declared **alpha** (README badge), ★2; master prompt forbids adopting alpha framework without tested rollback; grammY-based anyway (grammY not selected) |
| 3.4 | grammyjs/menu | MIT | 2026-08-27 | **EVALUATED-REJECTED** | Requires grammY runtime; equivalent static inline menus natively implemented + pagination unit-tested |
| 3.5 | grammyjs/conversations | MIT | 2026-07-23 | **EVALUATED-REJECTED** | Requires grammY; its required capabilities (cancel, back-nav, validation, timeout, state recovery) implemented natively in handlers/copy.js v3 — tested |
| 3.6 | grammyjs/runner | MIT | 2024-09-27 | **EVALUATED-REJECTED** | Owner-only bot, single poller; concurrency could duplicate consequential actions (launches) — against spec §3.6 caution |
| 3.7 | grammyjs/auto-retry | MIT | 2026-08-27 | **EVALUATED-REJECTED** | Requires grammY transformer; equivalent implemented natively: Retry-After parsing + bounded retries + jitter in src/tg.js call() — failure-tested |
| 3.8 | grammyjs/parse-mode | MIT | 2026-07-24 | **EVALUATED-REJECTED** | Requires grammY; equivalent: single esc() per format + 4096 chunkText (official limit) — tested |
| 3.9 | grammyjs/transformer-throttler | MIT | 2026-03-06 | **EVALUATED-REJECTED** | Owner-only volume; 429 handled via retryPlan() with Retry-After — failure-tested (FAIL-A) |
| 3.10 | telegraf/telegraf | MIT | 2026-09-24 | **EVALUATED-REJECTED** | Competing framework; grammY also rejected — see 3.2; running two frameworks is forbidden by spec |
| 3.11 | aiogram/aiogram | MIT | 2026-10-11 | **EVALUATED-REJECTED** | Python framework; production backend is Node 20 — no justified Python worker exists |
| 3.12 | AndreyDarik/AnimationsInTelegram | MIT | 2024-12-19 | **SKILL-APPROACH-ADOPTED** | Approach adopted (programmatic animation assets, send real media ≠ CSS); implemented natively: assets/launch.gif generated with PIL, uploaded via sendAnimation — live-tested delivery pending owner /start |

## 4.x Research & discovery
| # | Repo | License | Freshness | Verdict | Evidence & Reason |
|---|---|---|---|---|---|
| 4.1 | Panniantong/Agent-Reach | MIT | 2026-10-08 | **EVALUATED-REJECTED** | Source toolkit for agent web access; product's research needs met by tgadsspy API (integrated) + no user-approved web-research scope; adding browser-sourced content increases injection surface (spec §14 untrusted-content rule) |
| 4.2 | Exey/tg-channel-stats | n/a | n/a | **UNAVAILABLE** | GitHub returns **301 Moved Permanently** — listed URL does not resolve to expected project (spec §10 Step 1 failure). Desktop PySide6 GUI is non-embeddable per spec anyway. No maintained replacement needed: research handled by tgadsspy + Ads placement validation |
| 4.3 | assafelovic/gpt-researcher | Apache-2.0 | 2026-10-10 | **EVALUATED-REJECTED** | Separate Python service + LLM cost for deep web reports; spec allows rejection when cost/latency not justified — ads research needs (advertiser intelligence) already served with live-tested data |
| 4.4 | searxng/searxng | AGPL-3.0 | 2026-10-11 | **EVALUATED-REJECTED** | Self-hosted metasearch = extra service to operate; license (AGPL) also a compatibility note for private product. Documented per spec ("If self-hosting is too expensive… document") |
| 4.5 | browser-use/browser-use | MIT | 2026-10-09 | **EVALUATED-REJECTED** | Browser automation in ad-platform context risks platform-rule violations; spec forbids bypassing access controls; no authorized browser workflow exists in product |
| 4.6 | ScrapeCreators/social-media-research-skills | MIT | 2026-08-26 | **SKILL-VENDORED (inert)** | README vendored to `.agents/skills/social-media-research/`; requires ScrapeCreators API key (not provided) → not wired to product; documented honestly |

## 5.x Agent orchestration
| # | Repo | License | Freshness | Verdict | Evidence & Reason |
|---|---|---|---|---|---|
| 5.1 | crewAIInc/crewAI | MIT | 2026-10-10 | **EVALUATED-REJECTED** | Multi-agent orchestration adds runtime complexity with no task needing agent collaboration; deterministic code is more reliable for every implemented flow (spec §7 "use deterministic code wherever more reliable") |
| 5.2 | langchain-ai/langgraph | MIT | 2026-10-11 | **EVALUATED-REJECTED** | No durable multi-stage workflow beyond a 3-step wizard + queued jobs table; ordinary typed functions + jobs table are simpler (spec §5.2 guidance) |
| 5.3 | pydantic/pydantic-ai | MIT | 2026-10-11 | **EVALUATED-REJECTED (Python)** | Structured AI validation need met with **zod** schemas on the JS side (src/validate.js — AiResponseSchema tested) |
| 5.4 | openai/openai-agents-python | MIT | 2026-10-08 | **EVALUATED-REJECTED** | Same rationale as 5.1/5.3; no OpenAI-key dependency wanted for core flows |
| 5.5 | OpenHands/software-agent-sdk | MIT | 2026-10-11 | **EVALUATED-REJECTED** | Coding-agent tooling; no in-bot coding agent permitted (spec §5.5 explicitly warns against placing it in customer-facing backend) |
| 5.6 | sickn33/agentic-awesome-skills | MIT | 2026-10-11 | **SKILL-CATALOG-INSPECTED** | Catalog (2,677 skills, v19.4.0) inspected; no directly relevant skill beyond what telegram-bot-ui provides; whole-catalog install explicitly forbidden by spec; nothing selected |

## 6.x AI memory & routing
| # | Repo | License | Freshness | Verdict | Evidence & Reason |
|---|---|---|---|---|---|
| 6.1 | mem0ai/mem0 | Apache-2.0 | 2026-10-09 | **EVALUATED-REJECTED** | No cross-session AI memory requirement; retention/privacy surface unjustified (spec §6.1 asks whether truly needed — answer: no) |
| 6.2 | BerriAI/litellm | NOASSERTION | 2026-10-11 | **EVALUATED-REJECTED** | Python gateway service; spec explicitly allows "small tested internal router" — implemented in src/ai.js with error classification, jittered Retry-After retries, circuit breaker, budget hard-stops — **proven by failure suite FAIL-A..G + live switching test** |

## 7.x Database, queues, workers
| # | Repo | License | Freshness | Verdict | Evidence & Reason |
|---|---|---|---|---|---|
| 7.1 | supabase/supabase-js | MIT | 2026-10-09 | **EVALUATED-REJECTED** | Direct Postgres (pg 8.x) is the sound access path for server-side worker; supabase-js targets PostgREST/Auth/Storage APIs not used; service-role key never exposed; DB connectivity + 12 tables live-verified |
| 7.2 | taskforcesh/bullmq | MIT | 2026-10-11 | **EVALUATED-REJECTED** | Requires Redis service; workload (5-min scheduler ticks, digest, balance alerts) is trivial; jobs table + in-process scheduler with idempotent date-keys meet spec §7.2 requirements (bounded retries, idempotency, state) at zero infra cost |
| 7.3 | redis/redis | NOASSERTION | 2026-10-11 | **EVALUATED-REJECTED** | No requirement beyond BullMQ's — documented per spec ("document the decision rather than adding infrastructure without need") |

## 8.x Quality & operations
| # | Repo | License | Freshness | Verdict | Evidence & Reason |
|---|---|---|---|---|---|
| 8.1 | microsoft/playwright | Apache-2.0 | 2026-10-10 | **DEV-TOOL (not installed)** | No web surface to E2E (product is Telegram-native by spec); browser tests n/a; would be dead weight in CI |
| 8.2 | lackeyjb/playwright-skill | MIT | 2026-10-01 | **SKILL-VENDORED (inert)** | SKILL.md + README vendored to `.agents/skills/playwright-skill/` for future admin-tooling test methodology; runtime not installed (no browser surface) |
| 8.3 | vitest-dev/vitest | MIT | 2026-10-10 | **EVALUATED-REJECTED** | Node 20 built-in `node --test` already provides the required suite (35 tests green); avoiding runner churn per spec "preserve working functionality" |
| 8.4 | colinhacks/zod | MIT | 2026-10-11 | **INTEGRATED (prod dep)** | zod 4.6.6 — src/validate.js: AdsTargetSchema, CreateAdSchema (pre-launch payload validation), AiResponseSchema (malformed-provider rejection — failure-tested FAIL-F) |
| 8.5 | pinojs/pino | MIT | 2026-10-10 | **INTEGRATED (prod dep)** | pino 10.4.0 — src/log.js: structured JSON logs, redact paths + free-form redact() passthrough; wired into index.js/tg.js |
| 8.6 | open-telemetry/opentelemetry-js | Apache-2.0 | 2026-10-10 | **EVALUATED-REJECTED** | Single-process owner-only worker; structured logs + audit table give sufficient observability; OTel collector infra not justifiable |
| 8.7 | getsentry/sentry-javascript | NOASSERTION | 2026-10-10 | **EVALUATED-REJECTED** | Spec: "Integrate if a Sentry project/configuration is available" — none provided; installing would violate "never assume monitoring is active" rule; documented as future option |

## Official documentation consulted (spec §3 refs)
- Bot API changelog (fetched): current **Bot API 10.3**; 10.2 added `style` + `icon_custom_emoji_id` on buttons — **verified before use**; `sendMessageDraft`/`sendRichMessageDraft` streaming methods verified (10.3) — **implemented in Copy Studio**
- Bot API reference (fetched): sendMessageDraft full contract implemented per docs (draft_id stable, 0–4096 chars, can_stop, keep_on_stop, ephemeral 30s → finalize with sendMessage)
- Custom-emoji eligibility: remains eligibility-gated; project has **no verified custom-emoji IDs** → unicode fallback + env hook, never invented (both skill rule and spec §11 rule)

**Totals: 36/36 entries dispositioned — 3 production deps integrated (pg, zod, pino), 4 skills vendored/adopted, 28 evaluated-rejected with reasons, 1 unavailable (moved).**
