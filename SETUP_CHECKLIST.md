# Setup Checklist

> **Goal of this document:** A judge or new contributor should be able to go from `git clone` to a working ScrowPay environment in **under 15 minutes** by following this file alone.
>
> Every step is copy-paste ready. Every external account needed is free-tier.

---

## What you'll end up with

- Frontend running at <http://localhost:8080>
- AI risk engine running at <http://localhost:5000>
- Real Turso database with full schema auto-created
- A live test user you can sign in as

---

## Step 0 — Install prerequisites

| Tool | Why | How |
|---|---|---|
| Git | Clone the repo | <https://git-scm.com/downloads> |
| Docker Desktop | Runs the frontend + AI engine | <https://www.docker.com/products/docker-desktop> |

That's the only thing you need locally. Everything else lives in the browser or as a managed cloud service.

Verify:

```bash
git --version            # any recent version is fine
docker --version         # 20.x or newer
docker compose version   # v2.x
```

---

## Step 1 — Create the external accounts (free tier on everything)

You'll need credentials from these services. The links go to the exact page where you get the credential.

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

You now have a Gemini API key. Without it, the dispute auto-resolution agent and face re-verification are disabled (everything else still works).

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

You now have a Cloudinary cloud name. Without it, the app falls back to base64 image storage (still works but face re-verification can't function since Gemini needs a fetchable URL).

### 1e. Resend (transactional email) — **OPTIONAL**
1. Sign up at <https://resend.com>
2. **API Keys → Create API Key** (Full access) → copy the `re_...` key

Without this, notifications still appear in the in-app bell but no email is sent.

---

## Step 2 — Clone and configure

```bash
git clone <repository-url> scrowpay
cd scrowpay
```

### 2a. Root `.env`

```bash
# Linux / macOS
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
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

# Optional but recommended
RESEND_API_KEY=re_...
RESEND_FROM_ADDRESS=ScrowPay <onboarding@resend.dev>
```

### 2b. Frontend Gemini config

```bash
cp frontend/gemini-config.example.js frontend/gemini-config.js
```

Edit `frontend/gemini-config.js` and paste your Gemini API key into the `apiKey` field.

### 2c. Frontend Cloudinary config

```bash
cp frontend/cloudinary-config.example.js frontend/cloudinary-config.js
```

Edit `frontend/cloudinary-config.js` and paste your Cloudinary cloud name into the `cloudName` field. The preset names already match what you created in Step 1d.

### 2d. (Auto) `frontend/env.js`

Docker Compose generates this from `.env` at container start — you don't need to create it manually.

If you're running the frontend **without** Docker (`python -m http.server`), copy it yourself:

```bash
cat > frontend/env.js <<'EOF'
window.ENV = {
  TURSO_DATABASE_URL: '<paste from .env>',
  TURSO_AUTH_TOKEN:   '<paste from .env>',
  SQUAD_SECRET_KEY:   '<paste from .env>',
  SQUAD_PUBLIC_KEY:   '<paste from .env>',
  SQUAD_ENVIRONMENT:  'sandbox',
  AI_ENGINE_URL:      'http://localhost:5000',
  HOLDING_ACCOUNT:    '<paste from .env>'
};
EOF
```

---

## Step 3 — Start everything

```bash
docker compose up -d
```

First run takes 1–2 minutes (downloads images, builds the AI engine).

Watch progress:

```bash
docker compose logs -f
```

Wait until you see:

```
ai-engine    | * Running on http://0.0.0.0:5000
frontend     | nginx ready to accept connections
```

---

## Step 4 — Verify it works

```bash
# AI engine health
curl http://localhost:5000/health

# Should return: {"status":"healthy","model_loaded":true,...}
```

Open <http://localhost:8080/web.html> in your browser. You should see the landing page.

Open the browser console — you should see lines like:

```
[TursoDBService] ✅ Connected to Turso
[TursoDBService] ✅ users table ready
[TursoDBService] ✅ transactions table ready
...
```

The schema auto-creates on first connection. No manual migration step.

---

## Step 5 — Create a test account

1. Open <http://localhost:8080/web.html> → **Create Account**
2. Walk through the 9 stages. For OTP use `123456` (hardcoded; see [Known limitations](README.md#-known-limitations--roadmap)).
3. For the **face liveness step**, blink naturally. The captured frame uploads to Cloudinary; you can see it in your Cloudinary dashboard under `scrowpay/face_refs/`.
4. End up at the dashboard. Try creating an escrow listing.

---

## Step 6 — Grant yourself admin access (optional)

The repo ships a helper script that reads your `.env` and flips the admin flag for you — no manual SQL needed.

### Windows

```powershell
# From the project root - by user id (most reliable):
.\scripts\make-admin.ps1 -UserId 1

# Or by phone number:
.\scripts\make-admin.ps1 -PhoneNumber "+2348012345678"
```

You can also edit the `$DEFAULT_PHONE` constant at the top of `scripts/make-admin.ps1` and just run `.\scripts\make-admin.ps1` with no args. Or double-click `scripts\make-admin.bat`.

> If a phone-number lookup fails even though the user exists, the script will list recent users with their `id`s; re-run with `-UserId <n>` to bypass phone matching (hidden whitespace / encoding differences in the stored phone can defeat exact equality).

### macOS / Linux / WSL

```bash
chmod +x scripts/make-admin.sh

# By phone number:
./scripts/make-admin.sh +2348012345678

# Or by user id (most reliable):
./scripts/make-admin.sh --id 1
```

Requires `curl` and `jq` (`brew install jq` or `apt install jq`).

### Manual fallback

If you'd rather not run the script, this SQL does the same thing — paste it into the Turso dashboard's SQL console or `turso db shell`:

```sql
-- By phone:
UPDATE users SET is_admin = 1 WHERE phone_number = '<your phone number>';

-- Or by id (use this if the phone has hidden chars from signup):
UPDATE users SET is_admin = 1 WHERE id = 1;
```

### What you get

Refresh the dashboard. Open the **profile panel** (avatar top-right) → **Admin Console**. Or go directly to <http://localhost:8080/admin.html>.

If you ever swap Turso databases (new URL / new token), just update `.env` and re-run the script — no code changes needed. Full script reference: [scripts/README.md](scripts/README.md).

---

## Troubleshooting

### "Database connection failed" in browser console
- Check that `TURSO_DATABASE_URL` starts with `libsql://` (not `https://`)
- Check that `TURSO_AUTH_TOKEN` is a complete JWT (starts with `eyJ`)
- Check that the Docker containers picked up the new `.env`: `docker compose down && docker compose up -d`

### Frontend loads but blank dashboard
- Open browser console; the first failed service initialisation will be logged
- Most likely missing `frontend/env.js` (re-run `docker compose up -d` to regenerate it)

### AI engine container keeps restarting
- `docker compose logs ai-engine` — usually it's a Resend key issue
- The AI engine can run without `RESEND_API_KEY`; remove the env var from `.env` and restart

### Cloudinary uploads fail
- Check the browser network tab; the request goes to `https://api.cloudinary.com/v1_1/<your-cloud-name>/...`
- If the cloud name is wrong you'll see a 404
- If the preset doesn't exist OR isn't set to "Unsigned" you'll see a 400 with `Invalid upload preset`

### Gemini calls fail
- Open the browser console and look for `[DisputeAgentService] available: false` — that means `gemini-config.js` was not read
- Check that the file exists at `frontend/gemini-config.js` and `apiKey` is set
- Free-tier Gemini has rate limits; if you get 429s, wait a minute

### Squad sandbox doesn't return BVN/NIN data
- Squad's sandbox only honours specific test BVNs/NINs — see the Squad docs for valid test values
- Real BVNs/NINs don't work in sandbox mode

For more issues, see [DEPLOYMENT.md § Troubleshooting](DEPLOYMENT.md#troubleshooting).

---

## What if I'm running on a network with intermittent connectivity?

The app is designed to degrade gracefully:

| Cloud service offline | Effect |
|---|---|
| Gemini | Dispute auto-resolution falls back to manual review queue; face re-verification skipped (action proceeds) |
| Cloudinary | Image uploads fall back to base64-in-DB |
| Resend | Notifications still in-app, no email |
| Squad (sandbox down) | Funding fails — no workaround, this is a hard dependency |
| AI engine | Risk scoring falls back to "fail" verdict; manual override available in admin console |
| Turso | App fails to boot |

---

## Resetting everything

```bash
# Stop containers
docker compose down

# Wipe the database (Turso dashboard → Database → Settings → Delete database)
# Then create a new one and update .env

# Restart
docker compose up -d
```

The schema will be re-created automatically.

---

**You're done.** If anything above didn't work, please open an issue — that means the docs are wrong, and we want to fix them.
