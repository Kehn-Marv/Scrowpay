# 🚀 Quick Start - Test ScrowPay in 5 Minutes

## Step 1: Start the App (30 seconds)

### Windows:
```bash
# Double-click or run:
start-dev.bat
```

### Mac/Linux:
```bash
docker-compose up -d
```

**Wait for:** Browser opens automatically to http://localhost:8080

---

## Step 2: Create Account (2 minutes)

1. Click **"Create Account"**
2. Enter phone: `08135866028`
3. Click **Next**
4. Check console (F12) for OTP, enter it
5. Choose **NIN**, enter: `12345678901`
6. Enter name: `John Doe`
7. Select DOB (18+ years), gender
8. **IMPORTANT:** Note the account number in the modal! (e.g., `1234567890`)
9. Allow camera, blink 2-3 times
10. Select address: Lagos → Ikeja → Allen Avenue
11. Enter street address
12. Create PIN: `123456`
13. Confirm PIN: `123456`
14. Click anywhere on success screen

**You're now on the dashboard!** ✅

---

## Step 3: Verify Account Number (30 seconds)

Look at the dashboard welcome card:

```
┌─────────────────────────────────────────────┐
│ Account Status: Verified ✓                  │
│ Phone Number: +2348135866028                │
│ Account Number: 1234567890  [📋 Copy]       │  ← HERE!
│ Bank: GTBank                                 │
│ Account Type: Personal                       │
└─────────────────────────────────────────────┘
```

**Test:**
- Click the copy icon
- You should see: "Account number copied to clipboard!"

---

## Step 4: Test Login/Logout (1 minute)

1. Click **"Logout"** (top right)
2. Confirm logout
3. Enter phone: `08135866028`
4. Enter PIN: `123456`
5. Click **"Sign In"**

**You're back on the dashboard with the same account number!** ✅

---

## Step 5: Create Transaction (1 minute)

1. Click **"Create Escrow"**
2. Fill in:
   - Item: `iPhone 13 Pro Max`
   - Price: `450000`
   - Delivery: `3` days
   - Inspection: `2` days
3. Click **"Create Transaction"**
4. **Copy the Transaction ID** (e.g., `TXN-1715385600-ABC123`)

---

## 🎉 Success!

You've tested:
- ✅ Account creation with virtual account number
- ✅ Account number display on dashboard
- ✅ Persistent login (logout/login)
- ✅ Transaction creation

---

## 🧪 Full Testing (Optional)

Want to test the complete flow? See: `END_TO_END_TESTING_GUIDE.md`

This includes:
- Creating a second account (buyer)
- Joining the transaction
- AI risk scoring
- Funding the transaction
- Completing the transaction
- Verifying fund transfers
- Trust score updates

---

## 🐛 Quick Troubleshooting

### App won't start?
```bash
# Check Docker is running
docker --version

# View logs
docker-compose logs -f
```

### AI Engine not working?
```bash
# Check health
curl http://localhost:5000/health

# Should return: {"status": "healthy", "model_loaded": true}
```

### Squad API errors?
- Check `frontend/env.js` has correct API keys
- Keys should start with `sandbox_sk_` and `sandbox_pk_`

### Database errors?
- Check internet connection
- Verify Turso credentials in `frontend/env.js`

---

## 🛑 Stop the App

```bash
docker-compose down
```

---

## 📚 Full Documentation

- **Complete Testing Guide:** `END_TO_END_TESTING_GUIDE.md`
- **Deployment Guide:** `DEPLOYMENT.md`
- **Setup Checklist:** `SETUP_CHECKLIST.md`
- **README:** `README.md`

---

## 🎯 What You Just Tested

1. **Persistent Authentication** ✅
   - Users register once
   - Can login/logout freely
   - Data persists in database

2. **Account Number Display** ✅
   - Created during registration
   - Saved to database
   - Always visible on dashboard
   - Copy-to-clipboard functionality

3. **Complete User Flow** ✅
   - Registration → Login → Dashboard → Transactions

---

**Your app is working!** 🚀

For full transaction testing (buyer/seller flow, AI risk scoring, fund transfers), see the complete guide.
