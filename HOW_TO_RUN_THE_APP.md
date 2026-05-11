# 🚀 How to Run ScrowPay - Complete Guide

## Quick Answer

**Windows:**
```bash
start-dev.bat
```

**Mac/Linux:**
```bash
docker-compose up -d
```

**Then open:** 
- **Recommended:** `file:///C:/Users/chukw/Desktop/Scrowpay/frontend/website.html` (or double-click `website.html` in the frontend folder)
- **Alternative:** http://localhost:8080/website.html (may have image loading issues on first load)

---

## Detailed Instructions

### Prerequisites Check

Before starting, verify you have:

1. **Docker Desktop** installed and running
   ```bash
   docker --version
   # Should show: Docker version 20.10.x or higher
   ```

2. **Docker Compose** installed
   ```bash
   docker-compose --version
   # Should show: docker-compose version 1.29.x or higher
   ```

3. **Internet connection** (for Turso database and Squad API)

---

## Method 1: Automated Start (Recommended)

### Windows Users:

1. Open File Explorer
2. Navigate to your ScrowPay folder
3. **Double-click** `start-dev.bat`

OR in Command Prompt:
```bash
cd path\to\scrowpay
start-dev.bat
```

**What it does:**
- ✅ Checks Docker installation
- ✅ Verifies `.env` file exists
- ✅ Stops any running containers
- ✅ Starts AI Engine + Frontend
- ✅ Opens browser automatically
- ✅ Shows logs

### Mac/Linux Users:

```bash
cd path/to/scrowpay
chmod +x start-dev.sh
./start-dev.sh
```

---

## Method 2: Manual Start

### Step 1: Navigate to Project

```bash
cd path/to/scrowpay
```

### Step 2: Start Services

```bash
docker-compose up -d
```

**What this does:**
- Downloads Docker images (first time only)
- Builds AI Engine container
- Starts nginx frontend server
- Runs in background (`-d` = detached mode)

### Step 3: Wait for Services

**First time:** 2-3 minutes (downloading images, training AI model)
**Subsequent runs:** 10-30 seconds

### Step 4: Verify Services

```bash
# Check if containers are running
docker-compose ps

# Should show:
# scrowpay-ai-engine    Up    0.0.0.0:5000->5000/tcp
# scrowpay-frontend     Up    0.0.0.0:8080->80/tcp
```

### Step 5: Check Health

**AI Engine:**
```bash
curl http://localhost:5000/health
```
Should return:
```json
{
  "status": "healthy",
  "model_loaded": true,
  "model_path": "/app/models/isolation_forest_model.pkl"
}
```

**Frontend:**
```bash
curl http://localhost:8080
```
Should return HTML content

### Step 6: Open in Browser

**Recommended Method (Direct File Access):**
1. Navigate to your ScrowPay folder: `C:\Users\chukw\Desktop\Scrowpay\frontend\`
2. Double-click `website.html` to open it in your browser
3. Or paste this in your browser: `file:///C:/Users/chukw/Desktop/Scrowpay/frontend/website.html`

**Alternative Method (nginx Server):**
```
http://localhost:8080/website.html
```
Note: The nginx server may have image loading issues on first load, but corrects itself after a while.

---

## What's Running?

After starting, you have:

### 1. Frontend (File Access + Port 8080)
- **Recommended:** Open `frontend/website.html` directly (double-click or use file:/// path)
- **Alternative:** http://localhost:8080 (nginx server - may have image loading issues)
- **Container:** scrowpay-frontend
- **Technology:** Static HTML/JS files + nginx server
- **Files:** All HTML/JS/CSS from `frontend/` folder

**Available Pages:**
- `frontend/website.html` (Landing page) ← **Use this**
- `frontend/account-creation.html` (Registration)
- `frontend/sign-in.html` (Login)
- `frontend/dashboard.html` (Main app)

**Why file access?** The nginx server at localhost:8080 has image loading issues on first load. Direct file access works perfectly.

### 2. AI Risk Engine (Port 5000)
- **URL:** http://localhost:5000
- **Container:** scrowpay-ai-engine
- **Technology:** Python Flask API
- **Model:** Isolation Forest (scikit-learn)

**Available Endpoints:**
- http://localhost:5000/health (Health check)
- http://localhost:5000/api/v1/score (Risk scoring - POST)

---

## Viewing Logs

### All Services:
```bash
docker-compose logs -f
```

### AI Engine Only:
```bash
docker-compose logs -f ai-engine
```

### Frontend Only:
```bash
docker-compose logs -f frontend
```

### Stop Viewing Logs:
Press `Ctrl + C`

---

## Stopping the App

### Stop Services (Keep Data):
```bash
docker-compose down
```

### Stop and Remove Everything:
```bash
docker-compose down -v
```

---

## Restarting After Code Changes

### Restart Without Rebuild:
```bash
docker-compose restart
```

### Rebuild and Restart:
```bash
docker-compose up -d --build
```

### Rebuild Specific Service:
```bash
# Rebuild AI Engine only
docker-compose up -d --build ai-engine

# Rebuild Frontend only
docker-compose up -d --build frontend
```

---

## Troubleshooting

### Issue: "Docker is not running"

**Solution:**
1. Open Docker Desktop
2. Wait for it to start (whale icon in system tray)
3. Try again

### Issue: "Port 8080 is already in use"

**Solution:**
```bash
# Find what's using port 8080
# Windows:
netstat -ano | findstr :8080

# Mac/Linux:
lsof -i :8080

# Kill the process or change port in docker-compose.yml
```

### Issue: "AI Engine not responding"

**Solution:**
```bash
# Check AI engine logs
docker-compose logs -f ai-engine

# Look for errors
# Common issues:
# - Model not loaded
# - Python dependencies missing
# - Port conflict

# Restart AI engine
docker-compose restart ai-engine
```

### Issue: "Frontend shows 404"

**Solution:**
```bash
# Check if frontend container is running
docker-compose ps

# Check frontend logs
docker-compose logs -f frontend

# Verify files are mounted
docker-compose exec frontend ls /usr/share/nginx/html

# Restart frontend
docker-compose restart frontend
```

### Issue: "Database connection failed"

**Solution:**
1. Check internet connection
2. Verify Turso credentials in `frontend/env.js`:
   ```javascript
   TURSO_DATABASE_URL: 'libsql://...'
   TURSO_AUTH_TOKEN: 'eyJ...'
   ```
3. Test connection:
   ```bash
   curl https://scrowpay-db-scrop.aws-ap-northeast-1.turso.io
   ```

### Issue: "Squad API errors"

**Solution:**
1. Verify API keys in `frontend/env.js`:
   ```javascript
   SQUAD_SECRET_KEY: 'sandbox_sk_876fbc30f583383825bb9b7bee108e4fdd3458e5b053'
   SQUAD_PUBLIC_KEY: 'sandbox_pk_876fbc30f583383825bb8318e070892edd304990d75c'
   ```
2. Check if keys are sandbox keys (start with `sandbox_`)
3. Verify Squad API status: https://squadco.com/status

---

## Environment Configuration

### Current Setup (Already Configured):

**File: `frontend/env.js`**
```javascript
window.ENV = {
  // Turso Database
  TURSO_DATABASE_URL: 'libsql://scrowpay-db-scrop.aws-ap-northeast-1.turso.io',
  TURSO_AUTH_TOKEN: 'eyJ...',
  
  // Squad API (Updated with your new keys!)
  SQUAD_SECRET_KEY: 'sandbox_sk_876fbc30f583383825bb9b7bee108e4fdd3458e5b053',
  SQUAD_PUBLIC_KEY: 'sandbox_pk_876fbc30f583383825bb8318e070892edd304990d75c',
  SQUAD_ENVIRONMENT: 'sandbox'
};
```

**File: `.env`** (for Docker environment)
```bash
TURSO_DATABASE_URL=libsql://scrowpay-db-scrop.aws-ap-northeast-1.turso.io
TURSO_AUTH_TOKEN=eyJ...
SQUAD_SECRET_KEY=sandbox_sk_876fbc30f583383825bb9b7bee108e4fdd3458e5b053
SQUAD_PUBLIC_KEY=sandbox_pk_876fbc30f583383825bb8318e070892edd304990d75c
SQUAD_ENVIRONMENT=sandbox
AI_ENGINE_URL=http://localhost:5000
```

---

## Testing the App

### Quick Test (5 minutes):

1. **Start app:** `start-dev.bat` or `docker-compose up -d`
2. **Open:** http://localhost:8080/website.html
3. **Create account:** Click "Create Account", complete registration
4. **Note account number:** Shown in modal during registration
5. **Verify dashboard:** See account number displayed
6. **Test login:** Logout, login with phone + PIN
7. **Verify persistence:** Account number still visible

### Full Test (10 minutes):

See: `QUICK_START_TESTING.md` or `END_TO_END_TESTING_GUIDE.md`

---

## Docker Commands Reference

### Start Services:
```bash
docker-compose up -d
```

### Stop Services:
```bash
docker-compose down
```

### View Logs:
```bash
docker-compose logs -f
```

### Check Status:
```bash
docker-compose ps
```

### Restart Services:
```bash
docker-compose restart
```

### Rebuild:
```bash
docker-compose up -d --build
```

### Remove Everything:
```bash
docker-compose down -v
```

### Execute Command in Container:
```bash
# AI Engine
docker-compose exec ai-engine python --version

# Frontend
docker-compose exec frontend ls /usr/share/nginx/html
```

---

## File Structure

```
scrowpay/
├── docker-compose.yml          ← Main configuration
├── start-dev.bat              ← Windows quick start
├── start-dev.sh               ← Mac/Linux quick start
├── .env                       ← Environment variables
├── .env.example               ← Template
│
├── frontend/                  ← Frontend files
│   ├── website.html          ← Landing page
│   ├── account-creation.html ← Registration
│   ├── sign-in.html          ← Login
│   ├── dashboard.html        ← Main app
│   ├── env.js                ← Environment config
│   ├── config.js             ← Config loader
│   └── *.js                  ← Services
│
├── ai-engine/                 ← AI Risk Engine
│   ├── app.py                ← Flask API
│   ├── train_model.py        ← Model training
│   ├── Dockerfile            ← Container config
│   └── models/               ← Trained models
│
└── nginx.conf                 ← Nginx configuration
```

---

## URLs Reference

### Frontend (Recommended - Direct File Access):
- **Landing:** `C:\Users\chukw\Desktop\Scrowpay\frontend\website.html` (double-click to open)
- **Create Account:** `frontend/account-creation.html`
- **Sign In:** `frontend/sign-in.html`
- **Dashboard:** `frontend/dashboard.html`

### Frontend (Alternative - nginx Server):
- **Landing:** http://localhost:8080/website.html
- **Create Account:** http://localhost:8080/account-creation.html
- **Sign In:** http://localhost:8080/sign-in.html
- **Dashboard:** http://localhost:8080/dashboard.html

**Note:** Use direct file access to avoid image loading issues with nginx.

### AI Engine:
- **Health Check:** http://localhost:5000/health
- **Score API:** http://localhost:5000/api/v1/score (POST)

---

## Next Steps

After starting the app:

1. ✅ **Read:** `QUICK_START_TESTING.md` for 5-minute test
2. ✅ **Read:** `END_TO_END_TESTING_GUIDE.md` for complete testing
3. ✅ **Read:** `TESTING_FLOWCHART.md` for visual flow
4. ✅ **Test:** Create account, verify account number display
5. ✅ **Test:** Logout/login, verify persistence
6. ✅ **Test:** Create transaction, test AI risk scoring

---

## Support

If you encounter issues:

1. Check this guide
2. View logs: `docker-compose logs -f`
3. Check health endpoints
4. Review troubleshooting section
5. Check documentation:
   - `DEPLOYMENT.md`
   - `SETUP_CHECKLIST.md`
   - `README.md`

---

## Summary

**To run the app:**
```bash
# Windows
start-dev.bat

# Mac/Linux
docker-compose up -d
```

**To test:**
```
Open: C:\Users\chukw\Desktop\Scrowpay\frontend\website.html (double-click)
Create account → Note account number → Test login
```

**To stop:**
```bash
docker-compose down
```

---

**That's it!** Your app is now running and ready to test. 🚀

For detailed testing instructions, see `END_TO_END_TESTING_GUIDE.md`.
