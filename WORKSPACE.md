# THETAS AI WORKSPACE
**Product:** THETAS AI — Telegram-native advertising assistant
**Credit:** Fully Built By Agency @TelesAds · Telesads.com
**Live bot:** @AdaTonTeles_bot (Telegram display name: THETAS AI)

## Structure
```
Thetas Ai/
├── src/            full backend (bot: handlers, AI router, ads API, research, guards)
├── test/           35 tests (unit + design + failure-matrix + live)
├── docs/           manifest (36 repos), architecture, capability matrix, UI/UX, test report
├── .agents/skills/ vendored agent skills (telegram-bot-ui, playwright-skill, social-media-research)
├── assets/         launch animation GIF
├── schema.sql      Supabase DB (12 tables — live project ysrxukmpnioshntczpcf)
└── archive/        (workspace-only, NEVER in git) env/secrets, leads xlsx, research evidence,
                    pips-master backup, trackers, previous handover reports
```

## Live infra
- **Railway:** project teles-ads-control / service bot → repo intaminersss/thetas-ai (auto-deploy on push)
- **Public health:** https://bot-production-c2eb.up.railway.app/ → {"ok":true,"product":"THETAS AI"}
- **Supabase:** ap-south-1, pooler 6543, 12 tables
- **Ads fleet (owner account):** 96 live · 79 auto-resume · balance 15.86 TON

## Operations
- Deploy: push to main (verified auto-deploy) · Rollback: Railway → Deployments → Redeploy
- Tests: node --test test/unit.test.js test/v2.test.js test/failure.test.js
- Secrets: Railway env (19 vars) + archive/pips_secrets_local.txt (never commit)

## Deploy (v4+)
- **Railway CLI works WITHOUT GitHub push:** `RAILWAY_API_TOKEN=<account token> npx @railway/cli up --detach` (project already linked via .railway). Note: env var must be `RAILWAY_API_TOKEN` (account token), NOT `RAILWAY_TOKEN`.
- v4 shipped this way (deployment b24316de, SUCCESS, health verified).
- GitHub push PENDING: PAT ghp_hhCX… revoked (401); ghp_u5zq… (noontrade69-sketch) has read-only. Need fresh PAT (repo scope, intaminersss) to sync main (v4 commit 4ba08e8 is local).

## v5 (12 Oct 2026)
- 📦 Packages + 🧪 Test Ad funnel + .md reports — src/growth.js (research engine), handlers/packages.js, handlers/testad.js
- Agency pricing LOCKED in src/growth.js PRICING: test $150–300 · scale $1,000–1,500 · CPL ≤$0.30–0.60 (source: docs/GROWTH_PLAN_TEMPLATE.md)
- Channel research = t.me/s public preview scrape + tgadsspy advertisers + proven fleet channels; language hi/ru/en/ar + niche 8 buckets auto-detect
- Deploy: RAILWAY_API_TOKEN + `npx @railway/cli up --detach` (no GitHub needed). v5 dep 594bc98b SUCCESS.
- GitHub repo still at v3 (token dead) — sync pending fresh PAT.
