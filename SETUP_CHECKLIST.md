# ScrowPay Setup Checklist

Complete this checklist to ensure your ScrowPay deployment is properly configured.

## ✅ Pre-Deployment Checklist

### 1. Prerequisites Installed

- [ ] **Docker** (version 20.10+)
  - Download: https://www.docker.com/products/docker-desktop
  - Verify: `docker --version`

- [ ] **Docker Compose** (version 1.29+)
  - Usually included with Docker Desktop
  - Verify: `docker-compose --version`

- [ ] **Git** (for cloning repository)
  - Download: https://git-scm.com/downloads
  - Verify: `git --version`

### 2. Accounts Created

- [ ] **Turso Account**
  - Sign up: https://turso.tech/
  - Create database
  - Note database URL and auth token

- [ ] **Squad Account**
  - Sign up: https://squadco.com/
  - Get sandbox API keys
  - Create holding virtual account

### 3. Environment Variables Configured

- [ ] Copy `.env.example` to `.env`
  ```bash
  # Windows
  copy .env.example .env
  
  # Mac/Linux
  cp .env.example .env
  ```

- [ ] Set **TURSO_DATABASE_URL**
  - Format: `libsql://your-db-name.turso.io`
  - Get from: Turso dashboard

- [ ] Set **TURSO_AUTH_TOKEN**
  - Get from: Turso database settings → Generate token

- [ ] Set **SQUAD_SECRET_KEY**
  - Format: `sandbox_sk_...` (for testing)
  - Get from: Squad dashboard → API Keys

- [ ] Set **SQUAD_PUBLIC_KEY**
  - Format: `sandbox_pk_...` (for testing)
  - Get from: Squad dashboard → API Keys

- [ ] Set **SQUAD_ENVIRONMENT**
  - Value: `sandbox` (for testing)
  - Change to `production` when ready for live

- [ ] Set **AI_ENGINE_URL**
  - Local: `http://localhost:5000`
  - Docker: `http://ai-engine:5000`
  - Production: Your deployed AI engine URL

- [ ] Set **HOLDING_ACCOUNT**
  - Get from: Squad dashboard → Virtual Accounts
  - Create a dedicated holding account for escrow

### 4. Database Schema Setup

- [ ] Install Turso CLI (optional but recommended)
  ```bash
  # Mac/Linux
  curl -sSfL https://get.tur.so/install.sh | bash
  
  # Windows
  # Download from: https://docs.turso.tech/cli/installation
  ```

- [ ] Execute database schema
  ```bash
  # Option 1: Using Turso CLI
  turso db shell your-db-name < frontend/escrow-schema.sql
  
  # Option 2: Using Turso web interface
  # Copy contents of frontend/escrow-schema.sql
  # Paste into Turso web SQL editor
  # Execute
  ```

- [ ] Verify tables created
  ```sql
  -- Run in Turso shell or web interface
  .tables
  
  -- Should show:
  -- users
  -- transactions
  -- transaction_state_history
  -- disputes
  -- trust_scores
  -- ai_risk_logs
  ```

## ✅ Deployment Checklist

### Local Development

- [ ] Environment variables configured (`.env` file)
- [ ] Docker Desktop running
- [ ] Start services: `docker-compose up -d`
- [ ] Verify AI engine: http://localhost:5000/health
- [ ] Verify frontend: http://localhost:8080
- [ ] Check logs: `docker-compose logs -f`

### Production Deployment

#### Frontend (Vercel/Netlify)

- [ ] Repository connected to deployment platform
- [ ] Environment variables added in platform dashboard
- [ ] Build settings configured (if needed)
- [ ] Custom domain configured (optional)
- [ ] HTTPS enabled
- [ ] Deployment successful

#### AI Engine (VPS/Cloud)

- [ ] Server provisioned (DigitalOcean, AWS EC2, etc.)
- [ ] Docker installed on server
- [ ] Repository cloned to server
- [ ] `.env` file configured on server
- [ ] Services started: `docker-compose up -d`
- [ ] Reverse proxy configured (nginx)
- [ ] SSL certificate installed (Let's Encrypt)
- [ ] Firewall rules configured
- [ ] Health check passing

## ✅ Testing Checklist

### Basic Functionality

- [ ] **Landing Page**
  - Loads without errors
  - "Create Account" button works
  - "Sign In" button works

- [ ] **Account Creation**
  - Complete 9-stage registration
  - Phone number validation works
  - OTP verification works
  - BVN/NIN validation works (Squad API)
  - Face detection works (MediaPipe)
  - Address selection works (cascading dropdowns)
  - PIN setup works
  - Virtual account created (Squad API)
  - User saved to database (Turso)

- [ ] **Sign In**
  - Phone number + PIN authentication works
  - Session created
  - Redirects to dashboard

- [ ] **Dashboard**
  - Loads with user data
  - Displays available balance (Squad API)
  - Displays locked balance (calculated)
  - Displays trust score
  - Quick actions visible

### Transaction Flow

- [ ] **Create Transaction**
  - Form validation works
  - Transaction ID generated
  - Saved to database
  - Transaction ID displayed to seller

- [ ] **Join Transaction**
  - Transaction lookup works
  - Details displayed correctly
  - Seller trust score shown

- [ ] **Fund Transaction**
  - AI risk scoring runs (check logs)
  - Risk score displayed
  - High-risk transactions blocked
  - Low-risk transactions proceed
  - Squad API transfer works
  - State changes to "Funded_Locked"
  - Balances update correctly

- [ ] **Ship Item**
  - Seller can mark as shipped
  - State changes to "In_Transit"
  - Inspection window countdown starts

- [ ] **Accept Item**
  - Buyer can accept item
  - State changes to "Completed"
  - Funds released to seller (Squad API)
  - Balances update correctly
  - Trust scores recalculated

- [ ] **Dispute Item**
  - Buyer can dispute
  - State changes to "Disputed"
  - Photo upload works
  - Description saved
  - AI analysis runs (if implemented)

- [ ] **Auto-Release**
  - Inspection window expires
  - State auto-changes to "Completed"
  - Funds auto-released to seller
  - Both parties notified

### AI Risk Engine

- [ ] **Health Check**
  ```bash
  curl http://localhost:5000/health
  # Should return: {"status": "healthy", "model_loaded": true}
  ```

- [ ] **Score Transaction**
  ```bash
  curl -X POST http://localhost:5000/api/v1/score \
    -H "Content-Type: application/json" \
    -d '{
      "user_id": "test",
      "transaction_amount": 50000,
      "transaction_velocity": 3,
      "account_age_days": 45,
      "device_fingerprint": 5432,
      "time_of_day": 14,
      "counterparty_trust_score": 75
    }'
  # Should return risk score, verdict, etc.
  ```

- [ ] **Response Time**
  - Average response time < 3 seconds
  - Check logs for timing

- [ ] **Model Loaded**
  - Check AI engine logs
  - Should show "Model loaded successfully"

### Integration Tests

- [ ] **Squad API Integration**
  - Virtual account creation works
  - Balance queries work
  - Fund transfers work
  - Error handling works

- [ ] **Turso Database Integration**
  - User CRUD operations work
  - Transaction CRUD operations work
  - State history logging works
  - Trust score caching works

- [ ] **AI Engine Integration**
  - Frontend can call AI engine
  - Risk scores returned correctly
  - Timeout handling works
  - Fallback to "fail" on errors

## ✅ Performance Checklist

- [ ] **Dashboard Load Time**
  - Target: < 2 seconds on 4G
  - Measure: Browser DevTools Network tab

- [ ] **AI Risk Scoring**
  - Target: < 3 seconds
  - Measure: Check response time in logs

- [ ] **Balance Updates**
  - Target: < 2 seconds after state change
  - Measure: Time from action to UI update

- [ ] **Trust Score Calculation**
  - Target: < 5 seconds
  - Measure: Time from transaction completion to score update

## ✅ Security Checklist

- [ ] **Environment Variables**
  - `.env` file NOT committed to git
  - `.env` in `.gitignore`
  - Production credentials different from sandbox

- [ ] **HTTPS/TLS**
  - SSL certificate installed
  - All traffic over HTTPS
  - HTTP redirects to HTTPS

- [ ] **Authentication**
  - Session management works
  - 24-hour session expiry
  - Logout clears session

- [ ] **Input Validation**
  - All forms validate input
  - SQL injection prevented (parameterized queries)
  - XSS prevented (input sanitization)

- [ ] **Rate Limiting**
  - Transaction creation limited (10/hour)
  - Rate limit violations logged

- [ ] **Security Logging**
  - Failed risk checks logged
  - Blocked transactions logged
  - Suspicious activity logged

## ✅ Monitoring Checklist

- [ ] **Health Checks**
  - AI engine health endpoint monitored
  - Frontend availability monitored
  - Database connectivity monitored

- [ ] **Logs**
  - Application logs accessible
  - Error logs monitored
  - Security logs reviewed regularly

- [ ] **Alerts**
  - High error rate alerts
  - Service downtime alerts
  - Security incident alerts

- [ ] **Backups**
  - Database backup strategy in place
  - Backup restoration tested
  - Backup frequency defined

## ✅ Documentation Checklist

- [ ] **README.md**
  - Up to date
  - Quick start instructions clear
  - Links to other docs work

- [ ] **DEPLOYMENT.md**
  - Deployment steps documented
  - Environment variables documented
  - Troubleshooting section complete

- [ ] **API Documentation**
  - AI engine endpoints documented
  - Request/response formats documented
  - Error codes documented

- [ ] **Team Handoff**
  - Credentials shared securely
  - Deployment process documented
  - Contact information for support

## ✅ Pre-Production Checklist

Before switching to production:

- [ ] All tests passing
- [ ] Performance benchmarks met
- [ ] Security audit completed
- [ ] Squad production keys obtained
- [ ] Production database created
- [ ] Production environment variables set
- [ ] SSL certificates installed
- [ ] Monitoring and alerts configured
- [ ] Backup strategy implemented
- [ ] Team trained on deployment process
- [ ] Rollback plan documented
- [ ] Support contacts established

## ✅ Post-Deployment Checklist

After deployment:

- [ ] Smoke tests passed
- [ ] Health checks passing
- [ ] Logs reviewed for errors
- [ ] Performance metrics collected
- [ ] User feedback collected
- [ ] Issues documented
- [ ] Hotfix process established
- [ ] Monitoring dashboard reviewed

---

## 🎯 Quick Reference

### Start Development Environment

**Windows:**
```bash
start-dev.bat
```

**Mac/Linux:**
```bash
chmod +x start-dev.sh
./start-dev.sh
```

**Manual:**
```bash
docker-compose up -d
```

### View Logs

```bash
docker-compose logs -f
```

### Stop Services

```bash
docker-compose down
```

### Rebuild After Changes

```bash
docker-compose up -d --build
```

### Check Health

```bash
# AI Engine
curl http://localhost:5000/health

# Frontend
curl http://localhost:8080
```

---

## 📞 Support

If you encounter issues:

1. ✅ Check this checklist
2. ✅ Review [DEPLOYMENT.md](DEPLOYMENT.md)
3. ✅ Check logs: `docker-compose logs -f`
4. ✅ Verify environment variables
5. ✅ Check health endpoints
6. ✅ Review troubleshooting section

---

**Good luck with your deployment!** 🚀
