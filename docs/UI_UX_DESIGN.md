# UI_UX_DESIGN — TELES ADS CONTROL v3

Design system: `src/ui.js`. Methodology: telegram-bot-ui skill (vendored, `.agents/skills/telegram-bot-ui/SKILL.md`) — the whole surface = text + formatting + keyboards + chat chrome + state transitions.

## Visual identity
- Brand bar: `▮ TELES ADS ▸ <MODULE>` + `━━━` divider on every screen.
- Status language (fixed pills): 🟢 ACTIVE · ⏸️ ON HOLD/PAUSED · 🟡 IN REVIEW · ❌ DECLINED · 📝 DRAFT · 🚀 LAUNCHED.
- Progress bars `▰▰▱▱` only ever render REAL fractions (unit-tested).
- Buttons carry `style` by MEANING (Bot API 10.2, verified): `success` = confirm-launch/resume, `danger` = delete/pause/cancel, `primary` = launch entry. No decorative coloring.

## Screens & transitions
- **Desk (main menu):** 8 modules, 2-col grid; greeting personalized (escaped).
- **My Ads:** balance meter bar + paginated cards (4/page, honest `page x/y`), tap → detail (metrics, spent, remaining, target echo) + contextual actions.
- **Research:** keyword or quick-topics → spinner edits tied to REAL phases (connecting → scanning) → paginated result cards (6/page) with source+freshness → tap → placement validation verdict → save to list → CSV export (document).
- **Copy Studio (streaming wizard):** offer (validated ≥10 chars) → tone → language → `sendMessageDraft` official streaming draft with **Stop button** (`can_stop`) → final persisted message (drafts are 30s ephemeral per official docs) → save-as-draft / regenerate. Cancel via button or `/cancel` from any step; 5-min state timeout; offer text recovered on re-entry.
- **Drafts:** list → detail (title/text/url/target/budget) → LAUNCH gate: warning screen → confirm (style success) → idempotency-locked → launch → result + 🎬 launch animation (self-generated GIF).
- **Reports:** period deltas + lifetime spend, labeled data sources + generation timestamp; CSV export.
- **Alerts:** digest toggle + balance thresholds (5/10 TON).
- **Health/About:** live component status incl. DB + Ads API; capability matrix with honest statuses.

## Feedback rules (skill non-negotiables applied)
- EVERY callback tap is acknowledged (answerCallbackQuery) — no hanging spinners.
- Long ops: typing indicator + edit-in-place progress; percentages NEVER invented.
- Errors: safe, actionable, escaped (no internal leaks); retry affordances where meaningful.
- Empty states everywhere; long texts split at official 4096 limit.
- Custom emoji: NOT used — no verified IDs exist; unicode fallback (never invent IDs).
- Localization: English/Hinglish tone support in AI outputs; UI strings single-locale EN (documented).
