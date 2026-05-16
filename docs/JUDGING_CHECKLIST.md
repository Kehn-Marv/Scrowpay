# Judging Checklist — ScrowPay

Honest answers to every judging criterion. Where we're strong, we say why. Where we're not perfect, we say that too.

---

## Product & Technical Build

**Does it work end-to-end without breaking during demo?**
Yes. The full flow works: sign up (BVN verification via Squad) → create transaction → join → fund escrow → ship → confirm/dispute → payout. We've run it multiple times. The AI risk scoring and dispute agent both return results live. The only thing hardcoded is the OTP (`123456`) — we skipped SMS integration to focus on the core product.

**Have we integrated at least one Squad API in a meaningful way?**
We use three Squad product lines across eight endpoints. Virtual Account API creates real bank accounts and verifies identity via BVN/NIBSS. Transfer API handles every escrow release, refund, and withdrawal. Merchant Balance API powers the real-time dashboard. Remove Squad and the product literally cannot move money.

**Is our codebase clean, readable, and documented?**
Yes. Every JS service has JSDoc on every public method. One class per file, all attached to `window.*`. The README answers what/how/run-it upfront. We have a full `docs/` folder, an `APP_GUIDE.md` with ~500 lines of walkthrough, and a `SETUP_CHECKLIST.md` with copy-paste commands.

**Could a judge reproduce our setup from the repo alone?**
Yes. Clone, copy `.env.example` to `.env`, paste in Turso + Squad sandbox keys, run `docker compose up -d`. Three config files to copy, all documented. No Node.js, no Python install needed — Docker handles everything.

---

## User & Problem Understanding

**Can we name and describe our target user with genuine specificity?**
Tunde, 27, Lagos — sells refurbished phones on Twitter/X. Loses ~3 deals a week because buyers won't pay first and he won't ship first. Amaka, 24, Abuja — buys fashion from Instagram vendors, been scammed twice via bank transfer. Both need a neutral middle-ground that verifies identity and holds funds.

**Have we spoken to at least 3 real people from our target community?**
Yes. We talked to sellers on Twitter who use "payment before delivery" and lose customers over it. We talked to buyers who've been burned and now only buy COD (which limits what they can access). We talked to a logistics rider who sees failed deliveries daily because of trust breakdown on both sides.

**Does our solution solve a problem we can prove exists?**
NOIPolls says 67% of Nigerian online shoppers cite fraud fear as their top concern. NIBSS reports ₦9.5 billion lost to electronic fraud in 2022. FCCPC's #1 complaint category is "non-delivery after payment." The trust gap isn't theoretical — it's the thing killing informal e-commerce growth.

**Does our product feel built for someone, not just about someone?**
The signup flow uses Nigerian phone formats, BVN (not SSN or passport), State → LGA → Area selection from real Nigerian geo-data, and Naira formatting throughout. The bank dropdown has 21 Nigerian banks with correct NIP codes. The Trust Score tiers use language that makes sense in this context ("Proceed with Caution" not "Medium Risk Level 2").

---

## The Four Pillars

**AI Automation — does it genuinely automate a financial process end-to-end?**
Yes. **After funding succeeds**, `AnomalyDetectionEngine.evaluate()` runs automatically (rules + Isolation Forest client). The verdict updates **`TrustEngineService`** via `onAnomalyEvaluated` — **no human in the loop** for that step. **Funding is not blocked by this call in the current build** (non-blocking / trust-oriented). The dispute agent reads complaints + photos and auto-resolves cases with **confidence > 90** (on a 0–100 scale) without admin intervention; lower confidence is routed for manual review.

**Use of Data — are the signals predictive, ethical, and real-time?**
The risk model uses six real-time signals: account age, transaction velocity, amount patterns, time-of-day, device fingerprint, and counterparty trust. Trust Scores update after every completed transaction, not on a batch schedule. We don't use demographic data (age, gender, location) for risk scoring — only behavioral and transactional signals.

**Are Squad APIs powering a core function?**
Squad powers identity verification (BVN → NIBSS validation), funding (virtual accounts), escrow holding, payouts (NIP transfers), and balance display. It's not a demo integration — it's the entire financial infrastructure. We use 8 endpoints across 3 product lines.

**Financial Innovation — is this genuinely new?**
Nigeria has no consumer-grade AI-protected escrow for informal commerce. Existing escrow services are corporate-focused (minimum ₦5M). Existing payment platforms (OPay, PalmPay) don't hold funds conditionally. We combine identity verification + conditional fund holding + AI fraud prevention + reputation scoring in one product. That combination doesn't exist in this market.

---

## AI & Intelligence Layer

**Does the AI make the product meaningfully smarter?**
Without the AI layer, we'd just be an escrow wallet. **Post-fund** anomaly scoring records risk and nudges trust — moving it **before** fund is how we close the loop on “lose money vs not.” The dispute agent resolves cases in seconds that would otherwise take days of back-and-forth. The Trust Score gives users information they literally cannot get anywhere else about their counterparty.

**Can we explain how the model works in plain language?**
The Isolation Forest works by randomly splitting transaction data into trees. Normal transactions take many splits to isolate. Weird ones (unusual amount + new account + odd time) get isolated quickly — fewer splits = more anomalous = higher risk score. It's unsupervised, so it doesn't need labeled fraud examples to train.

**Have we considered bias or fairness?**
We deliberately exclude demographic features (age, gender, location) from the risk model. Only behavioral signals: what you do, not who you are. New accounts start at a neutral Trust Score (50), not zero — so first-time users aren't automatically penalized. The dispute agent's low-confidence cases always go to a human, never auto-execute.

**Does it get better with more data?**
Yes. The Trust Score is counter-based — every transaction updates it. The risk model can be retrained on real transaction data as it accumulates. The dispute agent's verdicts are logged with confidence scores, so we can track accuracy over time and adjust thresholds. More usage = more signal = better decisions.

---

## Impact & Scalability

**How many people could this realistically reach in Year 1?**
Target: 10,000 active users processing ₦500M+ in escrow. Nigeria has ~50M people in informal online commerce. We only need 0.02% penetration for that target. The viral mechanic helps — every transaction exposes a new counterparty to ScrowPay.

**Is there a viable path to sustainability?**
Revenue model: 1.5% transaction fee capped at ₦5,000. At 10K users doing 2 transactions/month at average ₦25K, that's ~₦90M annual revenue. Additional paths: Instant Release as a premium feature, and B2B escrow-as-a-service API for marketplaces.

**Could this work outside our immediate city?**
It already works nationwide — the signup supports all 36 states + FCT, Squad's NIP transfers reach every Nigerian bank, and it's a web app (no app store dependency). For other African markets: swap the geo-data, add local bank codes, and integrate the local payment rail. The escrow logic, AI, and trust engine don't change.

**Does this advance financial inclusion measurably?**
It turns informal commerce into protected commerce. People who currently avoid online buying because of fraud fear can now transact safely. Sellers who lose customers to trust breakdown can now prove their reliability with a Trust Score. That's not incremental — it's unlocking transactions that currently don't happen at all.

---

## Presentation & Pitch

**Is the demo rehearsed and stable?**
Yes. We have a scripted 5-minute demo path (documented in README under "Demo flow for judges") that hits every major feature. We've tested it multiple times including the AI risk scoring and dispute resolution.

**Does every team member have a clear role?**
Yes. Roles are defined for the presentation.

**Can we answer "why Squad APIs?" without hesitation?**
Squad gives us three things no other Nigerian payment provider offers in one package: BVN-verified virtual accounts (identity + funding), NIP instant transfers (payouts to any bank), and a merchant ledger (balance tracking). We don't need a separate KYC provider, a separate payout provider, or a separate balance system. Squad is the whole financial stack.

**Is the one-pager something we'd hand to a judge cold?**
Yes — it's in `docs/ONE_PAGER.md`. One page. Problem, solution, Squad APIs used, pillars addressed, tech stack, impact numbers. No fluff.
