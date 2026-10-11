# 🗺️ THETAS AI — NEXT WAVE PLAN: 54 NEW FEATURES (v7)

**THETAS AI — Fully Built By Agency @TelesAds (Telesads.com)**
Status: **APPROVED by owner (all P0+P1 + 2 additions #55/#56) — Wave A SHIPPED 12 Oct.** P2 designs: docs/P2_DESIGNS.md
Already LIVE: 67 features (docs/FEATURES.md) — ye plan uske **aage** ki wave hai.
Approve kaise kare: **"All approve"** likho, ya numbers batao (e.g. "1,2,5-12,20-30"). Decisions wale items ke liye pehle jawab do.

**Effort:** S = 1 short build · M = 2–3 builds · L = bada (design+tests zyada)
**Path** = bot me kahan dikhega (sab existing button-hub design me, koi messy dump nahi)

---

## 🔥 TIER P0 — SABSE PEHLE (high value, ready to build, 20 items)

### 📊 Ads Manager upgrades (Path: 📊 My Ads → detail/board)
| # | Feature | Kya karega | Effort |
|---|---|---|---|
| 1 | **Auto-push winners** | Ad ka JR ≥40% cross → scheduler khud cap +1 TON kare (fleet rule: winners ko bina pooche budget). Har auto-action ka notification + audit | M |
| 2 | **Auto-pause burners** | 500 views ke baad JR <5% → auto-pause + ping. Budget bachao switch | M |
| 3 | **Budget pacing meter** | Aaj kitna TON kharch hua vs 3 TON fleet cap — live bar board ke top pe, per account | S |
| 4 | **Ad comparison** | 2 ads pick → side-by-side funnel (CTR/JR/CPJ/spend) ek screen | S |
| 5 | **Creative age + refresh alerts** | Ad 10+ din purana → "refresh creative" alert (is niche me burnout fast hai) | S |
| 6 | **Single-ad client report** | Ek ad ka share-ready .md (client ko bhejne ke liye) | S |

### 📦 Packages / Growth engine (Path: 📦 Packages)
| # | Feature | Kya karega | Effort |
|---|---|---|---|
| 7 | **PDF export of plan** | Growth plan .md → branded PDF (TelesAds cover page) — clients ko professional file | M |
| 8 | **Plan language toggle** | Last plan EN↔RU↔HI me regenerate (bina naya scan) | S |
| 9 | **Client CRM lite** | Har sent plan ka record (client label + channel + date) → resend/history | M |
| 10 | **Pricing editor (owner-only)** | $150–300 / $1,000–1,500 / CPL values DB me — khud badal sako, bot turant naya pricing use kare | S |
| 11 | **Competitor deep-dive** | Kisi bhi competitor channel ka quick audit card (scan on tap) | S |
| 12 | **Niche benchmark card** | "Binary niche: avg CPL ₹X, JR Y%" — fleet data se honest benchmarks | M |
| 13 | **Plans library** | Saare generated plans saved + browse + resend | S |
| 14 | **Plan follow-up reminder** | 7 din baad owner ko ping: "X ko plan bheja tha — follow up?" | S |

### 🧪 Test funnel / Create (Path: 🧪 Test Ad)
| # | Feature | Kya karega | Effort |
|---|---|---|---|
| 15 | **Creative library** | Winner ad-texts saved → funnel me "pick from library" (naya likhna nahi) | M |
| 16 | **Multi-channel batch** | Ek brief → N target channels pe alag ads ek hi launch me | M |
| 17 | **Pre-launch checklist** | GO se pehle auto-scan: link targetable? balance enough? niche match? policy words? | M |
| 18 | **Draft import to funnel** | Existing draft se funnel start (brief/link skip) | S |
| 19 | **Budget split advisor** | 3 tests → "1.8/1.8/2.4 TON" fleet priors se suggestion | S |
| 20 | **Compliance checker** | Banned-words scan (income promises etc. — platform policy) before launch | M |

### ⚙️ Ops / UX (Path: desk/system)
| # | Feature | Kya karega | Effort |
|---|---|---|---|
| 21 | **Daily digest 9am IST** | Roz subah fleet summary auto-message (spend, joins, alerts) | S |
| 22 | **Quick actions /q** | Last-used 4 actions ek command me (speed) | S |
| 23 | **Onboarding tour** | /start me "Take the tour" → 6-screen guided walkthrough | S |
| 24 | **Catalog search** | 67-features catalog me search box-style | S |

---

## ⭐ TIER P1 — NEXT (solid value, 24 items)

### 📊 Ads Manager
| # | Feature | Kya karega | Effort |
|---|---|---|---|
| 25 | Bulk cap +1 on all winners | Winners board me "sabka cap badhao" ek confirm me | S |
| 26 | Bulk delete paused (cleanup) | Purane paused ads — confirm + refund note, sequential | M |
| 27 | Effective-CPM flags | Per-ad real CPM calc; fleet median se mehnga → flag | S |
| 28 | Launch queue (window scheduling) | "Raat 11 baje live karo" → scheduler pause/resume windows | L |

### 📦 Packages / Growth
| # | Feature | Kya karega | Effort |
|---|---|---|---|
| 29 | Multi-channel portfolio plan | Ek client ke 2–3 channels → ek combined plan | M |
| 30 | Channel health re-check | Saved research lists: views gir gaye? channel active? → status refresh | M |
| 31 | Niche trend page | Kaunse niches me advertisers badh rahe hain (archive deltas) | M |
| 32 | Channel comparison (research) | 2–3 channels side-by-side audit table | S |
| 33 | Batch research queue | Channel list → auto one-by-one audit → consolidated .md report | M |
| 34 | Rival ad-alerts | Competitor ne naye ads daale → ping (archive watch) | M |
| 35 | Saved-list sharing | Research list ko .md/.csv doc me export with one tap | S |

### ✍️ AI / Copy
| # | Feature | Kya karega | Effort |
|---|---|---|---|
| 36 | Hook-type labeled variants | Variants proof/urgency/beginner tags ke saath (kaunsa angle kya) | S |
| 37 | One-shot multi-language copy | EN+HI variants ek hi generation me | S |
| 38 | Copy-from-channel | Channel ka best post → ad angle suggest (AI) | M |
| 39 | Custom tone presets | Owner apne tones save kare (e.g. "Desi Bold") | S |
| 40 | AI usage dashboard | Month ka $ spend per provider + per user | S |

### 🏦 Accounts / Money
| # | Feature | Kya karega | Effort |
|---|---|---|---|
| 41 | Account spend leaderboard | Kaunsa account profitable (spend vs joins value) | M |
| 42 | Per-account health check | Token validity + balance alert per account | S |
| 43 | Top-up tracker | Manual log: "account 2 me +5 TON" → reports me graph | S |
| 44 | P&L snapshot | Spend vs joins-value (owner set kare ₹/join value) | M |
| 45 | Account label/note edit | Rename + notes on saved accounts | S |

### ⚙️ Ops
| # | Feature | Kya karega | Effort |
|---|---|---|---|
| 46 | Backup/restore export | Settings + lists + drafts → .json backup doc | M |
| 47 | 2nd-admin console | 8602229617 ke liye read-only dashboard view (safety) | M |
| 48 | Feature-catalog "What's new" | Har deploy ke naye features auto-list screen | S |

---

## 🧊 TIER P2 — DECISIONS CHAHIYE (6 items — pehle jawab do, phir build)

| # | Feature | Kyun decision chahiye | Effort |
|---|---|---|---|
| 49 | Voice note → brief | Speech-to-text provider chahiye (abhi wired nahi). Groq Whisper option hai — cost ~$0.01/min. Haan? | M |
| 50 | Owner broadcast to clients | Client CRM (#9) ke baad — opted-in clients ko message. Spam-risk policy tum set karo | M |
| 51 | Ad hour-windows (true scheduling) | Platform pe sirf pause/resume se hoga — 24/7 chalu bot zaroori. Theek? | L |
| 52 | Telegram Stars payments (plan deposits) | Client pehle Stars de → plan delivery auto. Payment flow + refund policy tumhari | L |
| 53 | Multi-user self-serve mode | Abhi owner-only; clients ko limited access dogey? (big security design) | L |
| 54 | Post-join attribution | Kaunse ad se aaya join — platform API attribution nahi deta; sirf ?start= trick se partial. Honest limitation — partial version? | L |

---

## 📐 DESIGN RULES (har feature pe lagu — messy nahi hoga)

1. **Desk 10 buttons fixed** — naye features existing sections me ghulenge (Ads/Accounts/Packages detail screens me)
2. Har naye tool ka **confirm + audit + idempotency** (consequential actions)
3. **Tiered catalog auto-update** — naya feature → 67-catalog me apne section me dikhega
4. Har wave: **E2E tests pehle likhe jaate hain, phir build** — 55/55 streak maintain
5. Deploy → verify → **bot report + GitHub push** (always-commit rule)

## 🏗️ BUILD ORDER (agar "All approve" bolte ho)

**Wave A (pehla):** #3,4,5,6,8,10,13,14,18,19,21,22,23,24 (saare S) → ek solid update
**Wave B:** #1,2,7,9,11,12,15,16,17,20 (M-tier core)
**Wave C:** #25–48 (P1 remaining)
**P2:** tumhare decisions ke baad

**Total: 56 features (54 + #55 single-ad report [already #6] + #56 LIVE notification system)**

## ✅ SHIPPED IN WAVE A (12 Oct, v7 — 60/60 tests)
#3 pacing meter · #4 ad compare · #5 creative-age alerts · #6 single-ad report (#55) · #8 plan lang toggle ·
#10 pricing editor · #13 plans library · #14 follow-up reminders · #18 draft import · #19 budget split ·
#21 morning digest 9am IST · #22 /q quick actions · #23 tour · #24 catalog search ·
**#56 LIVE notifications (per 1k views / joins / 0.5 TON spend, per-ad rules + global toggle)**

— THETAS AI · plan doc v1 · waiting for approval
