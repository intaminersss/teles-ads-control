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
