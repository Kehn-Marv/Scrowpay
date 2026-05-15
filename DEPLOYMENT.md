# ScrowPay Deployment Guide

How to run ScrowPay locally and how to deploy it to production. **Docker is the only supported way to run the stack** — everything below assumes you have Docker Desktop installed.

For first-time setup, follow [SETUP_CHECKLIST.md](SETUP_CHECKLIST.md) first; this file is the longer reference.

## Table of contents

1. [Quick start](#quick-start)
2. [Environment variables](#environment-variables)
3. [Local development with Docker](#local-development-with-docker)
4. [Production deployment](#production-deployment)
5. [Squad API: sandbox vs production](#squad-api-sandbox-vs-production)
6. [Troubleshooting](#troubleshooting)
7. [Security checklist](#security-checklist)

---

## Quick start

### Prerequisites

- **Docker Desktop** with Compose v2 — <https://www.docker.com/products/docker-desktop>
- **Git**

That's all. No Python, no Node.js, no nginx — Docker handles the entire stack.

### 5-minute setup

```powershell
# 1. Clone
git clone <repository-url> scrowpay
cd scrowpay

# 2. Create the three config files
Copy-Item .env.example                       .env
Copy-Item frontend\env.js.example            frontend\env.js
Copy-Item frontend\gemini-config.example.js  frontend\gemini-config.js
Copy-Item frontend\cloudinary-config.example.js frontend\cloudinary-config.js

# 3. Edit each one and paste in your real credentials
#    (Turso, Squad, Gemini, Cloudinary, Resend — see SETUP_CHECKLIST.md)

# 4. Start everything
docker compose up -d

# 5. Tail the logs to confirm it booted
docker compose logs -f
```

Then open:

| Page | URL |
|---|---|
| Landing | <http://localhost:8080/web.html> |
| Sign-in | <http://localhost:8080/sign-in.html> |
| Dashboard | <http://localhost:8080/dashboard.html> |
| Admin | <http://localhost:8080/admin.html> |
| AI engine | <http://localhost:5000> |
| Health | <http://localhost:5000/health> |

---

## Environment variables

Three files hold credentials, none of them are committed:

| File | Read by | What it holds |
|---|---|---|
| `.env` | The AI engine container (`ai-engine/app.py`) | Resend key, plus a copy of Turso/Squad keys for parity |
| `frontend/env.js` | The browser | Turso, Squad, AI-engine URL, holding account |
| `frontend/gemini-config.js` | The browser | Gemini API key |
| `frontend/cloudinary-config.js` | The browser | Cloudinary cloud name + preset names |

The Turso and Squad keys appear in **both** `.env` and `frontend/env.js`. That's intentional — the browser talks to Turso over HTTP and to Squad's API directly, while the Python service uses its copy for the email/OTP endpoint.

Templates for each file live alongside them as `*.example`. Step-by-step credential acquisition is in [SETUP_CHECKLIST.md § Step 1](SETUP_CHECKLIST.md#step-1--create-the-external-accounts-free-tier-on-everything).

> **Heads up:** `.env` is read **once** when a container is created. After editing `.env` you must run `docker compose down && docker compose up -d` — a plain `restart` is not enough.

---

## Local development with Docker

### Daily commands

```powershell
# Start (or restart) the stack
docker compose up -d

# Stop everything
docker compose down

# Restart after editing .env
docker compose down ; docker compose up -d

# Just restart one service
docker compose restart frontend     # after editing env.js or any HTML/JS
docker compose restart ai-engine    # after editing app.py

# Tail logs
docker compose logs -f
docker compose logs -f ai-engine
docker compose logs -f frontend

# Rebuild (after changing requirements.txt or Dockerfile)
docker compose up -d --build
```

### What the stack contains

```
┌─────────────────────────────────────────┐
│  scrowpay-frontend  (nginx:alpine)      │
│  • serves frontend/ on port 8080        │
└──────────────┬──────────────────────────┘
               │
┌──────────────┴──────────────────────────┐
│  scrowpay-ai-engine  (Python 3.11)      │
│  • Flask + scikit-learn                 │
│  • port 5000                            │
│  • reads /app from ai-engine/           │
│  • env injected from root .env          │
└─────────────────────────────────────────┘
```

The frontend container mounts `./frontend` read-only — any HTML/JS edit is live on browser refresh, no rebuild needed. The AI engine container is built from `ai-engine/Dockerfile` so changes to `app.py` need a `docker compose restart ai-engine`, and changes to `requirements.txt` need a `docker compose up -d --build ai-engine`.

### Hot-reload tips

- **HTML / JS / CSS changes** — just refresh the browser (hard-refresh, Ctrl+Shift+R, after editing `env.js`).
- **`app.py` changes** — `docker compose restart ai-engine`.
- **`requirements.txt` changes** — `docker compose up -d --build ai-engine`.
- **`.env` changes** — `docker compose down ; docker compose up -d`.

---

## Production deployment

You have two natural deployment shapes:

### Shape A — Self-hosted on a single VPS (simplest)

Run the same `docker compose up -d` you use locally on a VPS, behind a TLS-terminating reverse proxy.

```bash
# On a fresh Ubuntu/Debian VPS:
ssh user@your-server
sudo apt update && sudo apt install docker.io docker-compose-plugin git -y

git clone <repository-url> scrowpay
cd scrowpay

# Set up the three config files with PRODUCTION credentials
cp .env.example .env
cp frontend/env.js.example frontend/env.js
cp frontend/gemini-config.example.js frontend/gemini-config.js
cp frontend/cloudinary-config.example.js frontend/cloudinary-config.js
# Edit each file with `nano` / `vim`

docker compose up -d
docker compose logs -f
```

Now put nginx (or Caddy) in front for TLS:

```nginx
# /etc/nginx/sites-available/scrowpay
server {
    listen 443 ssl http2;
    server_name app.yourdomain.com;
    ssl_certificate     /etc/letsencrypt/live/app.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.yourdomain.com/privkey.pem;

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name app.yourdomain.com;
    return 301 https://$host$request_uri;
}
```

Then update `AI_ENGINE_URL` in `frontend/env.js` to `https://app.yourdomain.com/api` so the browser hits your TLS endpoint, and `docker compose restart frontend`.

### Shape B — Frontend on Vercel/Netlify, AI engine on a small VPS

The frontend is pure static files. Any static-site host works.

**Vercel:**

```bash
npm install -g vercel
cd frontend
vercel --prod
```

**Netlify:**

```bash
npm install -g netlify-cli
cd frontend
netlify deploy --prod --dir .
```

For both: open the project's **Environment Variables** panel and set anything you want injected into `frontend/env.js` at build time. Or simpler — generate `env.js` locally with production values and let the platform serve it as a static asset (gitignored, scp'd into a build step).

For the AI engine, follow Shape A on a small VPS but **only run the `ai-engine` service**:

```bash
docker compose up -d ai-engine
```

Put nginx + Let's Encrypt in front of port 5000, expose at `https://api.yourdomain.com`, and put that URL into your frontend's `AI_ENGINE_URL`.

### Database (Turso)

Turso is fully managed — no deployment needed. For production:

- Create a separate Turso database (don't share with dev).
- Generate a long-lived auth token under that database's **Tokens** tab.
- Add a daily backup task using the Turso CLI:
  ```bash
  turso db shell <prod-db-name> .dump > backup_$(date +%Y%m%d).sql
  ```

### Image storage (Cloudinary), email (Resend), Gemini

All three are managed services — no deployment. Just point your production keys at production resources:

- **Cloudinary**: optionally create a separate cloud for production, or just use folders to separate (`prod/disputes/...`).
- **Resend**: verify your sending domain (`yourdomain.com`) under **Domains**, then set `RESEND_FROM_ADDRESS=ScrowPay <noreply@yourdomain.com>` in `.env`.
- **Gemini**: rotate your AI Studio key periodically.

---

## Squad API: sandbox vs production

| | Sandbox | Production |
|---|---|---|
| Secret-key prefix | `sandbox_sk_` | `sk_live_` |
| Public-key prefix | `sandbox_pk_` | `pk_live_` |
| Base URL | `sandbox-api-d.squadco.com` | `api-d.squadco.com` |
| BVN | Test values only | Real values |
| Money | None — fake | **Real** |
| Use for | Local dev, demos, staging | Production only |

### Switching environments

1. Update `SQUAD_SECRET_KEY`, `SQUAD_PUBLIC_KEY`, `SQUAD_ENVIRONMENT` in **both** `.env` and `frontend/env.js`.
2. `docker compose down ; docker compose up -d`
3. Hard-refresh the browser to bust cached `env.js`.
4. Verify in the AI engine logs that the new key is detected.

---

## Troubleshooting

The most common day-to-day issues are covered with copy-paste fixes in [SETUP_CHECKLIST.md § Troubleshooting & FAQ](SETUP_CHECKLIST.md#troubleshooting--faq). Below are the production-specific ones.

### Container exits immediately on startup

```bash
docker compose logs --tail 100 ai-engine
```

Almost always a missing env var. Check the `.env` was copied to the server correctly (no Windows line endings — use `dos2unix .env` if scp'd from Windows).

### "Database connection failed" in production

- Free-tier Turso has a connection cap — if you're seeing intermittent failures under load, upgrade the plan.
- Check the auth token hasn't expired. Production tokens should be long-lived (rotate quarterly via the Turso dashboard).
- Verify the database URL is reachable from the VPS (egress isn't firewalled).

### Squad API errors

- Production Squad keys must be requested from Squad support after KYC. They will not work without business verification.
- Status page: <https://status.squadco.com>
- Check `SQUAD_ENVIRONMENT=production` is set — the SquadAPIService swaps base URLs based on this flag.

### Slow AI engine response

Expected: <3 seconds per `/api/v1/score` call.

```bash
docker stats scrowpay-ai-engine
```

If RAM is exhausted, bump limits in `docker-compose.yml`:

```yaml
ai-engine:
  deploy:
    resources:
      limits:
        cpus: '2'
        memory: 1G
```

### CORS errors in browser

The Flask service has flask-cors configured for `r"/api/v1/*"` and `r"/health"`. If you still see CORS errors:

- Make sure your reverse proxy isn't stripping the `Access-Control-Allow-Origin` header. Add `proxy_pass_header Access-Control-Allow-Origin;` if needed.
- Verify the OPTIONS preflight returns 204 with CORS headers:
  ```bash
  curl -i -X OPTIONS https://api.yourdomain.com/api/v1/notify/otp \
    -H "Origin: https://app.yourdomain.com" \
    -H "Access-Control-Request-Method: POST"
  ```

### Logs and debugging

```bash
docker compose logs -f                   # all
docker compose logs -f ai-engine
docker compose logs --tail 100 ai-engine
docker compose logs --since 1h ai-engine
docker compose logs > scrowpay-logs.txt  # export
```

### Health checks

```bash
# AI engine
curl https://api.yourdomain.com/health
# {"status":"healthy","model_loaded":true,"model_version":"1.0.0",...}

# Frontend
curl -I https://app.yourdomain.com
# HTTP/2 200
```

---

## Security checklist

Before you point real users at this:

- [ ] All env files (`.env`, `frontend/env.js`, `frontend/gemini-config.js`, `frontend/cloudinary-config.js`) are NOT in git
- [ ] You're using **production** Squad keys, not sandbox
- [ ] HTTPS terminated at the reverse proxy (Let's Encrypt or paid cert)
- [ ] Turso auth token has a sensible expiry and is rotated quarterly
- [ ] Resend sending domain is verified — no longer using `onboarding@resend.dev`
- [ ] Firewall: only ports 80, 443 (and 22 for SSH) exposed publicly. **5000 and 8080 should NOT be reachable from the internet.**
- [ ] Rate limiting at nginx / Cloudflare (the in-app rate limiter is a backstop, not a primary defence)
- [ ] Security headers (already in `nginx.conf` for the in-container nginx; replicate in your TLS-terminating proxy)
- [ ] Logs forwarded somewhere durable (CloudWatch / Loki / Papertrail)
- [ ] Backup strategy for the Turso database (daily `.dump` is fine for dev; weekly snapshots + daily incremental for prod)

---

## Updating in production

```bash
ssh user@your-server
cd scrowpay

# Pull new code
git pull

# Rebuild the AI engine if Python deps changed
docker compose up -d --build

# Otherwise just recreate
docker compose down ; docker compose up -d

# Verify
docker compose logs -f
curl https://api.yourdomain.com/health
```

For zero-downtime, run two VPSes behind a load balancer and rolling-restart them. For a hackathon project, a 30-second outage during deploy is fine.

---

## Support

1. Check this file
2. Check [SETUP_CHECKLIST.md § Troubleshooting](SETUP_CHECKLIST.md#troubleshooting--faq)
3. Tail logs: `docker compose logs -f`
4. Check health endpoints
5. Squad docs: <https://squadco.com/docs>
6. Turso docs: <https://docs.turso.tech>
