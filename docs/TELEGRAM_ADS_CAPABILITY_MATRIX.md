# TELEGRAM ADS CAPABILITY MATRIX
Source of truth: official Telegram Ads API (promoteapi.telegram.org) behaviors verified with the owner's authorized account token + official docs. Last verified: 2026-10-12.

| Capability | Status | Notes |
|---|---|---|
| List ads (getAdsList) | 1 — Verified & working | returns ads[] with counters |
| Ad detail + metrics (getAdsById — LIST shape) | 1 — Verified | views/clicks/joins/spent/remaining/daily cap |
| Pause / Resume (editAd is_paused) | 1 — Verified | pause required before delete; ~10-min platform cooldown observed |
| Delete ad (deleteAd → refund to balance) | 1 — Verified | refund lands automatically |
| Daily budget cap edit (editAd daily_budget_limit) | 1 — Verified | min ad budget 1.8 TON (platform-enforced) |
| Create ad (createAd, Idempotency-Key) | 1 — Verified | enters in_review; promote_url immutable after creation |
| Balance (getCurrentAccount) | 1 — Verified | TON remaining |
| Placement eligibility probe (getTargetChannel) | 1 — Verified | CHANNEL_TOO_SMALL etc. surfaced honestly |
| Ad states | 1 — Verified | active / on_hold / in_review / declined |
| Text/target edit on ACTIVE ad | 1 — Verified | re-enters review; old creative keeps serving until approved |
| Join attribution | 2 — Implemented, limits known | platform `joins` counter only — no funnel attribution beyond it |
| Drafts → launch (in-bot) | 1 — Verified flow; launches create REAL ads | gated: confirm + idempotency + audit + zod pre-validation |
| Channel research (advertiser intelligence) | 2 — Working via tgadsspy (authorized 3rd-party archive) | observed ad activity ≠ audience guarantees; FREE-plan endpoint limits documented |
| Audience demographics / reach forecasts / interest keywords | 5 — Unsupported | platform does not expose; never fabricated; disclosed in /about |
| Official Ads web-console operations outside API | 4 — Guided/manual | review verdicts happen platform-side; bot reflects states |
| MTProto/user-session Ads management | 5 — Rejected | bot token ≠ Ads authorization; spec-forbidden shortcut |

Statuses: 1 verified · 2 implemented+limits · 3 requires permission · 4 guided · 5 unsupported/blocked.
