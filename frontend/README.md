# ScrowPay Frontend

Vanilla JavaScript single-page-application. No build step. No framework. Every service is a single class attached to `window.*` and loaded in a defined order by `dashboard.html`.

For the system-wide overview, see the [root README](../README.md). For an exhaustive technical walkthrough, see [APP_GUIDE.md](../APP_GUIDE.md).

---

## Pages

| File | Purpose |
|---|---|
| `web.html` | Landing page. Hero + feature highlights + Create Account / Sign In CTAs. |
| `account-creation.html` | **10-stage** signup: phone **+ email** → **email OTP** → BVN → name/DOB/gender → Squad virtual account → face intro → blink liveness → address → **6-digit PIN** → success. Captures/uploads face reference to Cloudinary when available. |
| `sign-in.html` | Phone + 6-digit PIN authentication. SHA-256 hash with phone as salt. |
| `dashboard.html` | The main app. ~9,000 lines of HTML + inline JS that orchestrates all services. Lists transactions, lets users create/join/fund/ship/accept/dispute, shows trust score, balance, notifications bell, profile panel. |
| `admin.html` | Phase G admin console. Gated by `users.is_admin = 1`. Pending dispute queue, face verification audit, risky transaction monitor, user directory. |

---

## Services (alphabetical)

Each file exports a single class onto `window.*`. JSDoc-documented; many have inline architecture comments at the top explaining responsibilities and dependencies.

| File | Class | Responsibility |
|---|---|---|
| `IsolationForestService.js` | `IsolationForestService` | HTTP client for the Python Isolation Forest engine; logs every call to `ai_risk_logs`. |
| `AnomalyDetectionEngine.js` | `AnomalyDetectionEngine` | Umbrella that composes rules + ML into one `compositeScore` + decision. |
| `BalanceService.js` | `BalanceService` | Available vs locked balance calculations across virtual accounts. |
| `CloudinaryService.js` | `CloudinaryService` | Browser-side unsigned uploads to Cloudinary. Three preset profiles: disputes, fulfillment, face refs. |
| `DashboardService.js` | `DashboardService` | Top-level UI orchestrator. Called from `dashboard.html` after sign-in. |
| `DeviceFingerprintService.js` | `DeviceFingerprintService` | FingerprintJS v4 wrapper. Returns stable `visitorId`, persisted to `device_fingerprints`. Legacy hash fallback. |
| `DisputeAgentService.js` | `DisputeAgentService` | Gemini 2.0 Flash dispute resolution agent. Multimodal: reads complaint + up to 4 photos, returns structured JSON verdict. May ask one clarifying question. |
| `DisputeService.js` | `DisputeService` | Dispute persistence, photo upload (Cloudinary), `applyResolution`, `resolveManually` (admin override), Trust Engine attribution. |
| `EmailOTPService.js` | `EmailOTPService` | Generate/send/verify 6-digit email OTPs via the AI-engine Resend proxy. Validates against `email_otps`. |
| `FaceVerificationService.js` | `FaceVerificationService` | Gemini multimodal face re-verification (Phase F). `shouldReverify()` decision function + `verify()` Gemini call. Persists every attempt to `face_verifications`. |
| `InputValidationService.js` | `InputValidationService` | Format validators for phone, BVN, email, PIN, amounts. |
| `NotificationService.js` | `NotificationService` | Per-user notification persistence + Resend email proxy. Powers the dashboard bell icon. |
| `RiskEngineService.js` | `RiskEngineService` | Deterministic rule-based risk engine (new account, off-hours, large amount, etc.). |
| `SessionService.js` | `SessionService` | localStorage-backed session with 24h expiry + 30min inactivity timeout. |
| `StateMachineService.js` | `StateMachineService` | The transaction lifecycle. `transition(txnId, newState, actorId, metadata)` is the single entry point; runs validation + side effects + audit + notifications. |
| `ToastNotificationService.js` | `ToastNotificationService` | Transient in-tab toasts (success / error / info / warning). |
| `TransactionService.js` | `TransactionService` | Transaction CRUD + fulfillment proof upload (Cloudinary). |
| `TrustEngineService.js` | `TrustEngineService` | v2 counter-based trust score: signals (successful deliveries, disputes won/lost, account age) → score → tier. Persists to `trust_score_history`. |
| `TrustScoreService.js` | `TrustScoreService` | **Legacy.** Old hand-rolled score. Still written to for back-compat but the engine doesn't read it. |
| `address-data-service.js` | `AddressDataService` | Cascading state → LGA → ward dropdowns from `state-lga-area.json` (~350KB). |
| `error-handler-service.js` | `ErrorHandlerService` | Standardised error shapes, retry classification, user-friendly messages. |
| `id-validation-service.js` | `IDValidationService` | BVN format checks. |
| `mediapipe-service.js` | `MediaPipeService` | MediaPipe Face Mesh wrapper; computes Eye Aspect Ratio (EAR) for blink liveness. Runs entirely in-browser. |
| `otp-service.js` | `OTPService` | Hardcoded `123456` phone OTP (placeholder; not a real SMS provider). |
| `pin-service.js` | `PINService` | PIN validation (blocks weak patterns), SHA-256 hashing with phone-as-salt. |
| `security-logger.js` | `SecurityLogger` | Rate-limit hits, blocked transactions, unauthorized access attempts → `security_logs`. |
| `squad-api-service.js` | `SquadVirtualAccountService` | Squad API client: BVN verification, virtual account creation, account-name resolution, transfers. |
| `turso-db-service.js` | `TursoDBService` | libSQL HTTP client. Owns schema creation + idempotent migrations. The only thing that talks to Turso directly. |

### Configuration files

| File | What it is | In git? |
|---|---|---|
| `config.js` | Reads env vars from `window.ENV` (built from `env.js`) | ✓ |
| `env.js` | Local dev env vars. Generated by Docker from `.env` at container start. | ✗ (gitignored) |
| `turso-config.js` | Tiny shim around the libSQL HTTP endpoint. | ✓ |
| `gemini-config.example.js` | Template for Gemini key. | ✓ |
| `gemini-config.js` | Real Gemini key. Copy from `.example`. | ✗ (gitignored) |
| `cloudinary-config.example.js` | Template for Cloudinary cloud name + preset names. | ✓ |
| `cloudinary-config.js` | Real Cloudinary config. Copy from `.example`. | ✗ (gitignored) |

### Schemas

| File | What it is |
|---|---|
| `escrow-schema.sql` | Reference SQL for the core escrow tables. The runtime schema is created by `turso-db-service.js`; this file is for human reading. |
| `anomaly-engine-schema.sql` | Reference SQL for the AI / anomaly audit tables. |

### Data

| File | What it is |
|---|---|
| `state-lga-area.json` | Nigerian states (36) → LGAs (774) → wards. Bundled (~350KB) so the signup address picker works offline. |
| `state-lga-area-data.js` | JS module wrapping the JSON. Kept for legacy reasons; new code reads the JSON directly via `address-data-service.js`. |

---

## Service load order

`dashboard.html` loads scripts in a strict order because each layer depends on lower ones. The summary:

1. **Config & connection layer** — `env.js`, `config.js`, `turso-config.js`, `gemini-config.js`, `cloudinary-config.js`
2. **Database & session** — `turso-db-service.js`, `SessionService.js`
3. **External APIs** — `squad-api-service.js`
4. **Validation & utilities** — `InputValidationService.js`, `error-handler-service.js`, `ToastNotificationService.js`
5. **Device fingerprinting** — `DeviceFingerprintService.js`
6. **Risk pipeline** — `IsolationForestService.js`, `RiskEngineService.js`, `AnomalyDetectionEngine.js`
7. **Domain services** — `BalanceService.js`, `TrustEngineService.js`, `TrustScoreService.js`
8. **Cloudinary + notifications** — `CloudinaryService.js`, `NotificationService.js`
9. **Dispute system** — `DisputeAgentService.js`, `DisputeService.js`
10. **State machine + transactions** — `TransactionService.js`, `StateMachineService.js`
11. **Face re-verification** — `FaceVerificationService.js`
12. **Top-level orchestrator** — `DashboardService.js`

If you add a new service, find the right tier above and slot it in.

---

## Authentication flow

```
Sign up → 9 stages → users row written + Squad VA created + face ref uploaded → redirect to sign-in.html
Sign in → phone + PIN → SHA-256(pin + phone) lookup → session stored in localStorage → dashboard.html
```

Session is `localStorage` only (not `sessionStorage`); expires after 24h or 30 min of inactivity.

---

## Database

Schema is created and migrated **automatically** by `TursoDBService.initializeSchema()` on first connect. There are no separate migration files. Every `CREATE TABLE` and `ALTER TABLE` is idempotent.

Tables (12 total):

`users`, `transactions`, `transaction_state_history`, `disputes`, `trust_scores`, `trust_score_history`, `device_fingerprints`, `ai_risk_logs`, `security_logs`, `notifications`, `email_otps`, `face_verifications`.

Detailed schema in [APP_GUIDE.md § 10](../APP_GUIDE.md).

---

## Tech stack

- **JS** — Vanilla, ES2020+
- **CSS** — Tailwind CSS via CDN, with custom CSS variables in `<style>` blocks
- **Fonts** — DM Sans + Syne via Google Fonts
- **Database** — Turso (libSQL HTTP)
- **External APIs** — Squad, Gemini, Cloudinary, Resend (via AI engine proxy), MediaPipe (CDN), FingerprintJS (CDN)

No bundler. No transpiler. No `node_modules`. The browser runs the files exactly as committed.

---

## Local development

From the repo root:

```bash
docker-compose up -d           # runs ai-engine + nginx-served frontend
open http://localhost:8080/web.html
```

Or, frontend-only:

```bash
cd frontend
python -m http.server 8000
open http://localhost:8000/web.html
```

For frontend-only dev, the AI risk engine is unreachable so transaction funding will fall back to rule-only verdicts. Everything else works.

---

## Code style

- One class per file
- JSDoc on every public method
- Service-level architecture comments at the top of each file
- No frameworks, no bundlers — keep it that way

See [CONTRIBUTING.md](../CONTRIBUTING.md) in the repo root.
