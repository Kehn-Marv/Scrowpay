# 🌐 Frontend Access Guide

## Recommended: Direct File Access

### Why Use File Access?
- ✅ No image loading issues
- ✅ Instant loading
- ✅ No nginx bugs
- ✅ Works perfectly with AI engine at localhost:5000

### How to Access

**Method 1: Double-Click (Easiest)**
1. Open File Explorer
2. Navigate to: `C:\Users\chukw\Desktop\Scrowpay\frontend\`
3. Double-click `website.html`
4. Your default browser will open the page

**Method 2: Browser Address Bar**
Paste this into your browser:
```
file:///C:/Users/chukw/Desktop/Scrowpay/frontend/website.html
```

**Method 3: Drag and Drop**
1. Open your browser
2. Drag `website.html` from File Explorer into the browser window

---

## Available Pages

All pages are in the `frontend/` folder:

| Page | File | Purpose |
|------|------|---------|
| **Landing Page** | `website.html` | Marketing/home page |
| **Create Account** | `account-creation.html` | User registration |
| **Sign In** | `sign-in.html` | User login |
| **Dashboard** | `dashboard.html` | Main application |

---

## How It Works

### Frontend (Your Browser)
- Opens HTML files directly from your computer
- JavaScript files load from the same folder
- All styling and images load locally

### AI Engine (Docker Container)
- Runs at `http://localhost:5000`
- Frontend JavaScript connects to this API
- Handles risk scoring and fraud detection

### Configuration
The frontend is already configured to connect to the AI engine:

**File: `frontend/config.js`**
```javascript
aiEngine: {
  url: 'http://localhost:5000'  // ← Connects to Docker container
}
```

---

## Alternative: nginx Server (Not Recommended)

If you prefer using the nginx server:

```
http://localhost:8080/website.html
```

**Known Issues:**
- ❌ Images may not load on first page load
- ❌ Requires page refresh to fix
- ❌ Buggy behavior initially

**Why it happens:**
The nginx server has timing issues with image loading. Direct file access avoids this completely.

---

## Testing Your Setup

### 1. Start the AI Engine
```bash
docker-compose up -d
```

### 2. Verify AI Engine is Running
Open in browser:
```
http://localhost:5000/health
```

Should show:
```json
{
  "status": "healthy",
  "model_loaded": true
}
```

### 3. Open Frontend
Double-click: `C:\Users\chukw\Desktop\Scrowpay\frontend\website.html`

### 4. Test the Flow
1. Click "Create Account"
2. Fill in registration form
3. Submit and note your account number
4. Verify the AI engine is scoring transactions (check browser console)

---

## Browser Console (For Debugging)

Press `F12` in your browser to open Developer Tools.

**Check if AI Engine is connected:**
```javascript
// In Console tab, type:
fetch('http://localhost:5000/health')
  .then(r => r.json())
  .then(console.log)
```

Should show:
```javascript
{status: "healthy", model_loaded: true, ...}
```

---

## File Paths Reference

### Your Project Location
```
C:\Users\chukw\Desktop\Scrowpay\
```

### Frontend Files
```
C:\Users\chukw\Desktop\Scrowpay\frontend\
├── website.html              ← Start here
├── account-creation.html
├── sign-in.html
├── dashboard.html
├── config.js                 ← AI engine URL configured here
├── env.js                    ← Environment variables
└── *.js                      ← Service files
```

### AI Engine (Docker)
```
Container: scrowpay-ai-engine
URL: http://localhost:5000
Status: docker ps
Logs: docker logs scrowpay-ai-engine
```

---

## Common Issues

### Issue: "Cannot connect to AI engine"

**Check if Docker is running:**
```bash
docker ps
```

Should show `scrowpay-ai-engine` container.

**Check AI engine health:**
```
http://localhost:5000/health
```

**Restart AI engine:**
```bash
docker-compose restart ai-engine
```

### Issue: "CORS errors in browser console"

This is normal when using `file://` protocol. The AI engine is configured to allow CORS from file:// origins.

**Verify in `ai-engine/app.py`:**
```python
CORS(app, resources={
    r"/api/*": {
        "origins": ["*"],  # Allows file:// protocol
        ...
    }
})
```

### Issue: "Images not loading"

**If using file:// access:** Check that image URLs in HTML are relative paths, not absolute.

**If using nginx (localhost:8080):** This is the known bug. Switch to file:// access instead.

---

## Quick Reference

### Start Everything
```bash
cd C:\Users\chukw\Desktop\Scrowpay
docker-compose up -d
```

### Open Frontend
```
Double-click: frontend\website.html
```

### Check AI Engine
```
Browser: http://localhost:5000/health
```

### View Logs
```bash
docker logs scrowpay-ai-engine -f
```

### Stop Everything
```bash
docker-compose down
```

---

## Summary

✅ **Use:** `file:///C:/Users/chukw/Desktop/Scrowpay/frontend/website.html`

❌ **Avoid:** `http://localhost:8080` (has image loading bugs)

🚀 **AI Engine:** `http://localhost:5000` (runs in Docker)

📝 **Config:** Already set up in `frontend/config.js`

---

**You're all set!** Just double-click `website.html` and start testing. 🎉
