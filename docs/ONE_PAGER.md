# ScrowPay — One-Pager

**AI-powered escrow for Nigerian peer-to-peer commerce.**

---

## The Problem

Millions of Nigerians buy and sell on WhatsApp, Twitter, Instagram, and Jiji every day — but there's no payment protection. Buyers get scammed (pay and get blocked), sellers get burned (ship and never get paid). The trust gap kills deals before they happen.

There is no consumer-grade escrow in Nigeria. The existing options are either bank-level (₦5M minimums, corporate-only) or completely informal (send money to a friend and hope for the best).

---

## What ScrowPay Does

ScrowPay holds money in a neutral account until both sides follow through. If there's a problem, AI resolves it.

**The flow:** Seller lists an item → Buyer funds escrow (money is held per your payment configuration — Squad holding + NIP in production; **demo `demo_balance` path** in the hackathon dashboard) → Goods are delivered → Buyer confirms → Money releases to seller.

If something goes wrong, the buyer raises a dispute. Our AI agent reviews the complaint and photo evidence and makes a ruling. High-confidence cases resolve automatically. Ambiguous ones go to a human moderator.

**Risk & trust:** Deterministic rules plus an **Isolation Forest** model (Flask) feed **`AnomalyDetectionEngine`**. In the **current** `dashboard.html` wiring, `evaluate()` runs **after** a successful fund (non-blocking) and updates **`TrustEngineService`** — it does **not** block the fund click today. See `FRAUD_DETECTION_FLOW.md` for the exact sequence.

---

## Squad APIs Used

We use **three Squad product lines** — they're not bolted on, they ARE the product:

| Squad API | What it powers |
|---|---|
| **Virtual Account** (`POST /virtual-account`) | Every user gets a real NUBAN. Squad validates BVN against NIBSS — that's our KYC. |
| **Transfer/Payout** (`POST /payout/transfer`, `/payout/account/lookup`, `/payout/requery`) | Every escrow release, refund, and withdrawal. NIP transfers to 21+ banks. |
| **Merchant Balance** (`GET /merchant/balance`) | Real-time balance on the dashboard, polled every 30 seconds. |

No Squad = no accounts, no funding, no payouts. It's the entire financial layer.

---

## Pillars Addressed

**AI Automation** — Post-funding anomaly scoring (deterministic rules + Isolation Forest) runs automatically and feeds the trust engine; **pre-fund blocking** is a documented next step, not the current dashboard gate. Gemini-powered dispute agent auto-resolves high-confidence cases without human intervention.

**Use of Data** — Real-time transaction and device signals (fingerprint, velocity, time-of-day patterns) feed the ML feature vector and Turso audit tables. Trust Scores (0–100) update after terminal lifecycle events **and** after post-fund anomaly evaluation.

**Financial Innovation** — First consumer-grade AI-protected escrow for Nigerian informal commerce. Combines identity verification, escrow, fraud prevention, and reputation in one product — none of the existing solutions do all four.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla JS + Tailwind (no build step) |
| Database | Turso (libSQL over HTTP) |
| Payments | Squad API |
| ML | Python Flask + scikit-learn Isolation Forest |
| Dispute AI | Google Gemini 2.0 Flash (multimodal) |
| Infra | Docker Compose (one command to run everything) |

---

## Impact

- **Target:** ~50M Nigerians in informal online commerce
- **Year 1:** 10,000 active users, ₦500M+ in escrow volume
- **Revenue:** 1.5% transaction fee (capped at ₦5,000)
- **Expansion:** Every African market with the same trust gap

---

**Team:** ScrowPay | **Built for:** Squad Hackathon | **Repo:** [github.com/Kehn-Marv/Scrowpay](https://github.com/Kehn-Marv/Scrowpay)
