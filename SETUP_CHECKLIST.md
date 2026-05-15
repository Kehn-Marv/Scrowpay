# Setup Checklist

> **Goal:** A new contributor or judge should be able to go from `git clone` to a running ScrowPay environment in **under 15 minutes**, with **only Docker Desktop** installed.
>
> Every step is copy-paste ready. Every external account needed is free-tier.

---

## What you'll end up with

- **Frontend** at <http://localhost:8080/web.html>
- **Sign-in** at <http://localhost:8080/sign-in.html>
- **Dashboard** at <http://localhost:8080/dashboard.html>
- **Admin console** at <http://localhost:8080/admin.html>
- **AI risk engine** at <http://localhost:5000>
- A real Turso database with full schema auto-created
- A live test user you can sign in as

---

## Step 0 — Install prerequisites

| Tool | Why | Where |
|---|---|---|
| **Docker Desktop** (with Compose v2) | Runs the entire stack — frontend nginx + Python AI engine | <https://www.docker.com/products/docker-desktop> |
| **Git** | Clones the repo | <https://git-scm.com/downloads> |

That's it. No Python, no Node.js, no nginx, nothing else needs to be installed locally. Docker handles everything.

Verify:

```powershell
git --version            # any recent version is fine
docker --version         # 20.x or newer
docker compose version   # v2.x
```

If `docker compose version` errors out, your Docker Desktop is too old — update it.

---

## Step 1 — Create the external accounts (free tier on everything)

You'll need credentials from these services. Links go to the exact page where you grab the credential.

### 1a. Turso (database) — **REQUIRED**
1. Sign up at <https://turso.tech>
2. Dashboard → **Create Database** → pick any name (e.g. `scrowpay-dev`) → pick the closest region
3. Click the database → **URL** tab → copy the `libsql://...` URL
4. **Tokens** tab → **Generate token** (full access, 30 days is fine for dev) → copy

You now have `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

### 1b. Squad (payments + identity verification) — **REQUIRED**
1. Sign up at <https://squadco.com>
2. Switch to **Sandbox** mode in the dashboard header
3. **Settings → API Keys** → copy both `secret_key` and `public_key` (sandbox versions)
4. **Virtual Accounts** → create one labeled "Escrow Holding Account" → copy the account number

You now have `SQUAD_SECRET_KEY`, `SQUAD_PUBLIC_KEY`, and `HOLDING_ACCOUNT`.

### 1c. Google AI Studio (Gemini) — **RECOMMENDED**
1. Go to <https://aistudio.google.com>
2. **Get API key** → **Create API key in new project**
3. Copy the key

Without it, the dispute auto-resolution agent and face re-verification are disabled (everything else still works).

### 1d. Cloudinary (image storage) — **RECOMMENDED**
1. Sign up at <https://cloudinary.com> (free tier is generous)
2. Dashboard home → copy the **Cloud name** (top-left)
3. **Settings (gear icon) → Upload → Add upload preset** — create THREE presets, all with **Signing mode = Unsigned**:

   | Preset name | Folder | Max file size |
   |---|---|---|
   | `scrowpay_disputes` | `scrowpay/disputes` | 10 MB |
   | `scrowpay_fulfillment` | `scrowpay/fulfillment` | 10 MB |
   | `scrowpay_face` | `scrowpay/face_refs` | 5 MB |

   For each, set **Allowed formats** to `jpg,jpeg,png,webp`.

Without it, the app falls back to base64 image storage (still works, but face re-verification is broken because Gemini needs a fetchable URL).

### 1e. Resend (transactional email) — **RECOMMENDED**
1. Sign up at <https://resend.com>
2. **API Keys → Create API Key** (Full access) → copy the `re_...` key

> **Important Resend test-mode caveat:** Until you verify a sending domain in Resend, the API will only accept emails sent **TO the same address you signed up with**. If you try to OTP a different email you'll see a 502. Verify a domain at **Resend → Domains → Add Domain** when you're ready to send to anyone.

Without Resend, in-app notifications still appear in the bell, but no email is sent and the signup OTP falls back to a hardcoded dev code.

---

## Step 2 — Clone and configure

```powershell
git clone <repository-url> scrowpay
cd scrowpay
```

ScrowPay needs **three** config files. None of them are committed; all three are templated.

### 2a. Root `.env` (read by the AI engine container)

```powershell
# Windows PowerShell
Copy-Item .env.example .env

# Mac/Linux
cp .env.example .env
```

Open `.env` and fill in:

```bash
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=eyJ...long-token-here...
SQUAD_SECRET_KEY=sandbox_sk_...
SQUAD_PUBLIC_KEY=sandbox_pk_...
SQUAD_ENVIRONMENT=sandbox
HOLDING_ACCOUNT=0123456789
AI_ENGINE_URL=http://localhost:5000

# Recommended
RESEND_API_KEY=re_...
RESEND_FROM_ADDRESS=ScrowPay <onboarding@resend.dev>
```

### 2b. `frontend/env.js` (read by the browser)

```powershell
# Windows
Copy-Item frontend\env.js.example frontend\env.js

# Mac/Linux
cp frontend/env.js.example frontend/env.js
```

Open `frontend/env.js` and paste the **same** Turso + Squad values you put in `.env`. The browser talks to Turso directly over HTTP and to Squad's API directly, so it needs them too.

### 2c. `frontend/gemini-config.js` and `frontend/cloudinary-config.js`

```powershell
# Windows
Copy-Item frontend\gemini-config.example.js     frontend\gemini-config.js
Copy-Item frontend\cloudinary-config.example.js frontend\cloudinary-config.js

# Mac/Linux
cp frontend/gemini-config.example.js     frontend/gemini-config.js
cp frontend/cloudinary-config.example.js frontend/cloudinary-config.js
```

Paste your Gemini API key into `frontend/gemini-config.js` and your Cloudinary cloud name into `frontend/cloudinary-config.js`. The preset names already match what you created in step 1d.

If you skip these two files the app still loads — see [graceful degradation](#graceful-degradation) below.

---

## Step 3 — Start everything

```powershell
docker compose up -d
```

First run takes 1–3 minutes (downloads the `python:3.11-slim` and `nginx:alpine` images, builds the AI engine, installs scikit-learn).

Watch progress:

```powershell
docker compose logs -f
```

Wait until you see both:

```
scrowpay-ai-engine  | * Running on http://0.0.0.0:5000
scrowpay-frontend   | nginx ready to accept connections
```

Press `Ctrl+C` to stop tailing the logs (the containers keep running in the background).

---

## Step 4 — Verify it works

```powershell
# AI engine health
curl http://localhost:5000/health
# Should return: {"status":"healthy","model_loaded":true,...}

# Frontend health
curl http://localhost:8080
# Should return HTML
```

Open <http://localhost:8080/web.html> in your browser. You should see the landing page.

Open the browser console (F12) — you should see lines like:

```
[TursoDBService] ✅ Connected to Turso database via HTTP API
[TursoDBService] ✅ users table ready
[TursoDBService] ✅ transactions table ready
...
```

The schema auto-creates on first connection. There is no manual migration step.

---

## Step 5 — Create a test account

1. Open <http://localhost:8080/web.html> → **Create Account**
2. Walk through the 9 stages. The signup OTP arrives by email **only if Resend is configured AND you're emailing your own Resend signup address** (test-mode limitation). Otherwise the dev fallback OTP `123456` is logged to the browser console.
3. For the **face liveness step**, blink naturally. The captured frame uploads to Cloudinary; you can see it in your Cloudinary dashboard under `scrowpay/face_refs/`.
4. End up at the dashboard. Try creating an escrow listing.

---

## Step 6 — Grant yourself admin access (optional)

The repo ships a helper script that reads your `.env` and flips the admin flag for you — no manual SQL needed.

### Windows

```powershell
# By user id (most reliable):
.\scripts\make-admin.ps1 -UserId 1

# Or by phone number:
.\scripts\make-admin.ps1 -PhoneNumber "+2348012345678"
```

### Mac / Linux / WSL

```bash
chmod +x scripts/make-admin.sh
./scripts/make-admin.sh --id 1
# or
./scripts/make-admin.sh +2348012345678
```

Requires `curl` and `jq` (`brew install jq` or `apt install jq`).

### Manual fallback

```sql
UPDATE users SET is_admin = 1 WHERE id = 1;
```

Then refresh the dashboard → **profile panel** → **Admin Console** appears.

Full options: [scripts/README.md](scripts/README.md).

---

## Daily commands cheat sheet

These are the only Docker commands you will use day-to-day. **No `python -m http.server`, no `npx`, no `pip install`** — Docker handles the entire stack.

```powershell
# Start (or restart) the whole stack
docker compose up -d

# Stop everything (containers stay; data persists)
docker compose down

# Restart after editing .env or any config
docker compose down && docker compose up -d

# Just restart the frontend (after editing frontend/env.js or HTML/JS)
docker compose restart frontend

# Just restart the AI engine (after editing ai-engine/app.py or .env)
docker compose restart ai-engine

# Tail logs
docker compose logs -f
docker compose logs -f ai-engine
docker compose logs -f frontend

# Rebuild after pulling new code or changing requirements.txt
docker compose up -d --build

# Full reset (containers + network)
docker compose down --remove-orphans
```

---

## Troubleshooting & FAQ

### "I just updated my Squad / Resend / Turso key in `.env`. Do I need to do anything?"

**Yes — you must restart the AI engine container.** `.env` is read **once** when the container is created, so changes don't take effect until you recreate the container.

```powershell
docker compose down
docker compose up -d
```

Or, equivalently in one line:

```powershell
docker compose down ; docker compose up -d
```

A `docker compose restart` is **not** enough on its own for env changes — it restarts the running container, but doesn't re-read `env_file`. Use `down && up`.

For browser-side keys (anything in `frontend/env.js`):

```powershell
docker compose restart frontend
```

Then **hard-refresh** your browser tab (Ctrl+Shift+R / Cmd+Shift+R) to bust the cached `env.js`.

---

### "Container name '/scrowpay-ai-engine' is already in use"

This happens when a previous `docker compose up` was interrupted and a stale container was left behind. Fix:

```powershell
# Remove the stuck container
docker rm -f scrowpay-ai-engine
docker rm -f scrowpay-frontend

# Start fresh
docker compose up -d
```

If that still doesn't work, do a full cleanup:

```powershell
docker compose down --remove-orphans
docker rm -f scrowpay-ai-engine scrowpay-frontend
docker compose up -d
```

---

### "Port already in use" / "bind: address already in use"

Some other process on your machine is already using port `5000` or `8080`.

**Find what's using the port:**

```powershell
# Windows
netstat -ano | findstr :5000
netstat -ano | findstr :8080

# Mac / Linux
lsof -i :5000
lsof -i :8080
```

**Either** kill that process, **or** change ScrowPay's published ports in `docker-compose.yml`:

```yaml
ai-engine:
  ports:
    - "5001:5000"   # host:container — change the LEFT side only
frontend:
  ports:
    - "8081:80"
```

If you change the AI-engine port, also update `AI_ENGINE_URL=http://localhost:5001` in both `.env` and `frontend/env.js`, then `docker compose down && up -d`.

---

### "Database connection failed" in the browser console

Pick the matching cause:

- **`TURSO_DATABASE_URL` doesn't start with `libsql://`** — fix it. `https://` won't work.
- **`TURSO_AUTH_TOKEN` is missing or truncated** — it's a JWT and must start with `eyJ`. Make sure no whitespace or quotes were pasted.
- **Token expired** — generate a new one in the Turso dashboard, paste into BOTH `.env` and `frontend/env.js`, then `docker compose down && up -d`.
- **You edited `frontend/env.js` but didn't refresh** — hard-refresh the browser (Ctrl+Shift+R). Plain refresh keeps the cached file.

---

### Frontend loads but the dashboard is blank

Open the browser console (F12). The first failed service init is logged. Most common causes:

- **`frontend/env.js` was never copied** — re-do step 2b. The default fallback values in `config.js` won't have valid Turso credentials.
- **Gemini / Cloudinary configs missing** — these only disable AI features, they don't blank the page. If the page is genuinely blank, look higher up in the console.

---

### "AI engine unreachable: Failed to fetch" / 502 / CORS errors

The Python container is either down or hitting an error before CORS headers can be added.

```powershell
# Is the container running?
docker compose ps

# Check the logs
docker compose logs --tail 50 ai-engine

# Healthy?
curl http://localhost:5000/health
```

If the container is `unhealthy` or `restarting`:

- Look for Python tracebacks in the logs — usually a missing env var or a Resend/Turso key issue.
- Restart it: `docker compose restart ai-engine`.
- If it keeps crashing, rebuild: `docker compose up -d --build ai-engine`.

---

### OTP email returns 502 "You can only send testing emails to your own email address"

This is **Resend's test-mode restriction**, not a bug. Until you verify a sending domain in Resend, you can only send to the email you signed up with.

Two options:

1. **Quick fix (test only)**: Sign in to <https://resend.com> with the address you want to test against, OR add the test recipient under **Audiences → Test addresses**.
2. **Proper fix**: **Resend Dashboard → Domains → Add Domain**, follow the DNS verification steps, then update `RESEND_FROM_ADDRESS` in `.env` to `noreply@yourdomain.com` and `docker compose down && up -d`.

In the meantime, the dev fallback OTP `123456` is logged to the browser console at signup, so you can keep testing.

---

### AI engine container is `unhealthy`

The healthcheck calls `GET /health` every 30 seconds. If it fails 3 times in a row, Docker marks the container unhealthy. The container still runs and serves traffic — it's just a status flag.

If you actually can't hit `http://localhost:5000/health`:

```powershell
docker compose logs --tail 100 ai-engine
docker compose restart ai-engine
```

---

### Cloudinary uploads fail

Open the browser network tab and find the request to `https://api.cloudinary.com/v1_1/<your-cloud-name>/...`:

- **404** → cloud name in `frontend/cloudinary-config.js` is wrong.
- **400 with "Invalid upload preset"** → the preset doesn't exist OR isn't set to **Unsigned**. Re-check step 1d.
- **400 with "File size too large"** → bump the preset's max file size in the Cloudinary dashboard.

---

### Squad sandbox returns 404 for virtual account / BVN

- Squad's sandbox only honours specific test BVNs — see Squad docs for valid test values. **Real BVNs do not work** in sandbox mode.
- If `getCustomerByVirtualAccount` 404s, that's expected for newly-signed-up users who don't have a Squad virtual account provisioned yet. The dashboard handles this gracefully and shows a zero balance with the label "Virtual account not provisioned yet".

---

### `docker-compose` (with hyphen) vs `docker compose` (space)

Both work — `docker-compose` is the legacy v1 shim, `docker compose` is the modern v2 plugin. This guide uses `docker compose` (space) but every command can be run with the hyphen too. Don't mix them in one shell session if you can help it.

---

### Resetting everything (nuclear option)

```powershell
# Stop and remove containers + network
docker compose down --remove-orphans

# Wipe the database (Turso dashboard → your DB → Settings → Delete database)
# Create a new one, paste the URL + token into .env and frontend/env.js

# Optionally remove the built AI-engine image to force a clean rebuild
docker image rm scrowpay-ai-engine || true

# Start fresh
docker compose up -d --build
```

The schema auto-recreates on first connection.

---

## Graceful degradation

The app is designed to keep working even when individual third-parties are unreachable.

| Cloud service offline | What happens |
|---|---|
| **Gemini** | Dispute auto-resolution falls back to the manual review queue; face re-verification is skipped (action proceeds). |
| **Cloudinary** | Image uploads fall back to base64-in-DB. Face re-verification breaks (Gemini needs a URL). |
| **Resend** | In-app notifications still appear in the bell. Signup OTP falls back to a dev code logged to the browser console. |
| **Squad sandbox** | Funding fails — this is a hard dependency; no workaround. |
| **AI engine** | Risk scoring falls back to "fail" verdict; manual override available in the admin console. |
| **Turso** | App fails to boot. Hard dependency. |

---

**You're done.** If anything above didn't work, please open an issue — that means the docs are wrong, and we want to fix them.
