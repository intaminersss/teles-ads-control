# 🧊 P2 DESIGNS — 3 decisions ke liye (THETAS AI · TelesAds)

Status: **DESIGN ONLY — tumhare haan/na ke baad build.**

---

## 1️⃣ Voice Note → Ad Brief (Whisper STT)

**Flow:** Tum voice note bhejo (funnel ke brief step pe) → bot download kare → Groq Whisper
(`whisper-large-v3-turbo`) se transcript → text brief me fill. Hindi/English/RU dono chalega.

- **Cost:** ~$0.04/ghanta (lakh voice notes me bhi negligible). Groq key already configured hai.
- **Effort:** M (1 build) — tg.js file-download + Groq audio call + funnel wire.
- **Risks:** bahut noisy audio → galat transcript (bot tumse "ye sahi hai?" confirm karwayega).
- **Verdict needed: HAAN / NAA**

## 2️⃣ Telegram Stars Payments (client plans auto-deliver)

**Flow:** Tum client ka plan banoge → "Sell to client" pe Stars price set (e.g. 500⭐) →
bot client ko `sendInvoice` (currency XTR) bhejta hai → client pay kare → **plan .md auto-deliver** +
payment record DB me.

- **Platform cut:** Telegram ~30% on Stars (Standard payout rules) — pricing usi hisab se.
- **Refund:** manual policy — tum decide (full 48h / case-by-case).
- **Payout:** Stars → Fragment se TON/USD — agency side (bot sirf collect karta hai).
- **Needs:** tumhare Stars pricing + refund policy ka jawab.
- **Effort:** L (invoice flow + records + delivery automation + refund commands).

## 3️⃣ Post-Join Attribution (partial)

**Reality check (honest):**
- Official platform API **per-ad joins already deta hai** (reports me yahi hai) — kaunse AD se join hua ye milta hai.
- **Per-USER source** sirf tab jab promote_url ek **BOT link** ho (`t.me/yourbot?start=ad96`) — bot ko
  `?start=ad96` dikhta hai → 100% attribution. **Channel-direct links me ye impossible hai** (platform
  channel links par start param nahi deta).

**Proposal:** promote_url me `?start=ad<N>` auto-append jab client ka receiving **bot** ho;
channel-promos ke liye ad-level attribution (already working). Client onboarding me ek sawaal:
"aapka funnel bot hai ya channel?"
- **Effort:** M.

---

**Jawab do:** 1 (voice) haan/na · 2 (Stars) haan/na + pricing · 3 (attribution) haan/na
