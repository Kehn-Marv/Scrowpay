# ScrowPay Deployment Guide

Complete deployment instructions for ScrowPay escrow platform with AI-powered risk detection.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Environment Setup](#environment-setup)
3. [Local Development](#local-development)
4. [Docker Deployment](#docker-deployment)
5. [Production Deployment](#production-deployment)
6. [Squad API Configuration](#squad-api-configuration)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Prerequisites

- **Node.js** (optional, for local development)
- **Python 3.11+** (for AI engine)
- **Docker & Docker Compose** (for containerized deployment)
- **Git** (for version control)

### 5-Minute Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd scrowpay

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your credentials (see Environment Setup section)

# 3. Start with Docker Compose
docker-compose up -d

# 4. Access the application
# Frontend: http://localhost:8080
# AI Engine: http://localhost:5000
```

---

## Environment Setup

### Required Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# Turso Database
TURSO_DATABASE_URL=libsql://your-database-name.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token-here

# Squad API (Sandbox for testing)
SQUAD_SECRET_KEY=sandbox_sk_your-secret-key-here
SQUAD_PUBLIC_KEY=sandbox_pk_your-public-key-here
SQUAD_ENVIRONMENT=sandbox

# AI Risk Engine
AI_ENGINE_URL=http://localhost:5000

# Holding Account
HOLDING_ACCOUNT=your-holding-account-number-here
```

### Getting Your Credentials

#### 1. Turso Database

1. Sign up at [https://turso.tech/](https://turso.tech/)
2. Create a new database
3. Copy the database URL (format: `libsql://your-db-name.turso.io`)
4. Generate an auth token in database settings
5. Run the schema setup:
   ```bash
   # Use Turso CLI or web interface to execute:
   # frontend/escrow-schema.sql
   ```

#### 2. Squad API

1. Sign up at [https://squadco.com/](https://squadco.com/)
2. Go to **API Keys** section in dashboard
3. Copy your **sandbox keys** for testing:
   - Secret Key (starts with `sandbox_sk_`)
   - Public Key (starts with `sandbox_pk_`)
4. For production, request production keys from Squad support

#### 3. Holding Account

1. Create a virtual account in Squad dashboard
2. Label it as **"Escrow Holding Account"**
3. Copy the account number (NUBAN format)
4. This account will temporarily hold funds during escrow transactions

---

## Local Development

### Option 1: Without Docker (Manual Setup)

#### Frontend

```bash
# Navigate to frontend directory
cd frontend

# Start a simple HTTP server
# Python 3:
python -m http.server 8000

# Python 2:
python -m SimpleHTTPServer 8000

# Node.js (if you have http-server installed):
npx http-server -p 8000

# Access at: http://localhost:8000/website.html
```

#### AI Risk Engine

```bash
# Navigate to AI engine directory
cd ai-engine

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Generate synthetic data (if not already done)
python generate_synthetic_data.py

# Train model (if not already done)
python train_model.py

# Start Flask API
python app.py

# Access at: http://localhost:5000
```

### Option 2: With Docker Compose (Recommended)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

**Services:**
- Frontend: http://localhost:8080
- AI Engine: http://localhost:5000
- Health Check: http://localhost:5000/health

---

## Docker Deployment

### Building Images

#### Build AI Engine Only

```bash
cd ai-engine
docker build -t scrowpay-ai-engine:latest .
```

#### Build All Services

```bash
docker-compose build
```

### Running Containers

#### Start All Services

```bash
docker-compose up -d
```

#### Start Specific Service

```bash
# AI Engine only
docker-compose up -d ai-engine

# Frontend only
docker-compose up -d frontend
```

### Managing Containers

```bash
# View running containers
docker-compose ps

# View logs
docker-compose logs -f
docker-compose logs -f ai-engine
docker-compose logs -f frontend

# Restart services
docker-compose restart

# Stop services
docker-compose stop

# Remove containers
docker-compose down

# Remove containers and volumes
docker-compose down -v
```

### Updating After Code Changes

```bash
# Rebuild and restart
docker-compose up -d --build

# Or rebuild specific service
docker-compose up -d --build ai-engine
```

---

## Production Deployment

### Frontend Deployment

#### Option 1: Vercel (Recommended for Static Sites)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
cd frontend
vercel

# Follow prompts to link project
# Set environment variables in Vercel dashboard
```

**Environment Variables in Vercel:**
1. Go to project settings
2. Navigate to **Environment Variables**
3. Add all variables from `.env.example`
4. Redeploy

#### Option 2: Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
cd frontend
netlify deploy

# For production
netlify deploy --prod
```

**Environment Variables in Netlify:**
1. Go to **Site settings** → **Build & deploy** → **Environment**
2. Add all variables from `.env.example`
3. Redeploy

#### Option 3: GitHub Pages

1. Push code to GitHub
2. Go to repository **Settings** → **Pages**
3. Select branch and `/frontend` folder
4. Save and wait for deployment

**Note:** GitHub Pages doesn't support environment variables. You'll need to hardcode values or use a build step.

### AI Engine Deployment

#### Option 1: Docker on VPS (DigitalOcean, AWS EC2, etc.)

```bash
# SSH into your server
ssh user@your-server-ip

# Clone repository
git clone <repository-url>
cd scrowpay

# Set up environment variables
cp .env.example .env
nano .env  # Edit with your credentials

# Start AI engine with Docker
cd ai-engine
docker-compose up -d

# Verify it's running
curl http://localhost:5000/health
```

**Set up reverse proxy (nginx):**

```nginx
server {
    listen 443 ssl;
    server_name ai-engine.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_connect_timeout 10s;
        proxy_send_timeout 10s;
        proxy_read_timeout 10s;
    }
}
```

#### Option 2: Heroku

```bash
# Install Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

# Login
heroku login

# Create app
cd ai-engine
heroku create scrowpay-ai-engine

# Set environment variables
heroku config:set FLASK_ENV=production

# Deploy
git push heroku main

# View logs
heroku logs --tail
```

#### Option 3: Railway

1. Go to [railway.app](https://railway.app)
2. Create new project
3. Connect GitHub repository
4. Select `ai-engine` directory
5. Add environment variables
6. Deploy

### Database Setup (Turso)

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Login
turso auth login

# Create database
turso db create scrowpay-db

# Get connection URL
turso db show scrowpay-db

# Create auth token
turso db tokens create scrowpay-db

# Execute schema
turso db shell scrowpay-db < frontend/escrow-schema.sql
```

---

## Squad API Configuration

### Sandbox vs Production

#### Sandbox (Testing)

- **Purpose:** Testing and development
- **Credentials:** Start with `sandbox_`
- **Limitations:** 
  - Limited transaction volume
  - Test data only
  - May have rate limits
- **Use for:** Local development, staging, demos

**Example:**
```bash
SQUAD_SECRET_KEY=sandbox_sk_abc123...
SQUAD_PUBLIC_KEY=sandbox_pk_xyz789...
SQUAD_ENVIRONMENT=sandbox
```

#### Production (Live)

- **Purpose:** Real transactions with real money
- **Credentials:** Start with `sk_` and `pk_`
- **Requirements:**
  - Business verification
  - KYC compliance
  - Request from Squad support
- **Use for:** Production deployment only

**Example:**
```bash
SQUAD_SECRET_KEY=sk_live_abc123...
SQUAD_PUBLIC_KEY=pk_live_xyz789...
SQUAD_ENVIRONMENT=production
```

### Switching Environments

1. Update `.env` file with appropriate credentials
2. Restart services:
   ```bash
   docker-compose restart
   ```
3. Verify environment in logs:
   ```bash
   docker-compose logs -f frontend
   ```

### Squad API Endpoints

| Environment | Base URL |
|-------------|----------|
| Sandbox | `https://sandbox-api-d.squadco.com` |
| Production | `https://api-d.squadco.com` |

### Testing Squad Integration

```bash
# Test virtual account creation
curl -X POST https://sandbox-api-d.squadco.com/virtual-account/create \
  -H "Authorization: Bearer YOUR_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_identifier": "test_user_123",
    "first_name": "John",
    "last_name": "Doe",
    "mobile_num": "08012345678",
    "email": "john@example.com",
    "bvn": "12345678901"
  }'
```

---

## Troubleshooting

### Common Issues

#### 1. "Database connection failed"

**Symptoms:** Frontend can't connect to Turso DB

**Solutions:**
- Verify `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in `.env`
- Check internet connection
- Verify database exists in Turso dashboard
- Check if auth token is expired (regenerate if needed)

```bash
# Test connection
curl -X POST "YOUR_TURSO_DATABASE_URL" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{"statements": ["SELECT 1"]}'
```

#### 2. "Squad API error"

**Symptoms:** Payment operations fail

**Solutions:**
- Verify Squad API credentials in `.env`
- Check if using correct environment (sandbox vs production)
- Verify Squad account is active
- Check Squad API status: https://status.squadco.com

```bash
# Test Squad API
curl -X GET https://sandbox-api-d.squadco.com/merchant/verify \
  -H "Authorization: Bearer YOUR_SECRET_KEY"
```

#### 3. "AI Engine unavailable"

**Symptoms:** Risk scoring fails, transactions blocked

**Solutions:**
- Check if AI engine container is running:
  ```bash
  docker-compose ps ai-engine
  ```
- View AI engine logs:
  ```bash
  docker-compose logs -f ai-engine
  ```
- Verify health endpoint:
  ```bash
  curl http://localhost:5000/health
  ```
- Restart AI engine:
  ```bash
  docker-compose restart ai-engine
  ```

#### 4. "Port already in use"

**Symptoms:** Docker fails to start, port conflict

**Solutions:**
- Check what's using the port:
  ```bash
  # Windows
  netstat -ano | findstr :5000
  
  # Mac/Linux
  lsof -i :5000
  ```
- Change port in `docker-compose.yml`:
  ```yaml
  ports:
    - "5001:5000"  # Use 5001 instead of 5000
  ```
- Stop conflicting service

#### 5. "Models not found" in AI Engine

**Symptoms:** AI engine fails to start, training errors

**Solutions:**
- Pre-train models before Docker build:
  ```bash
  cd ai-engine
  python generate_synthetic_data.py
  python train_model.py
  docker-compose up -d --build
  ```
- Check if models directory exists:
  ```bash
  ls -la ai-engine/models/
  ```
- Let container auto-train (takes 30-60 seconds on first start)

#### 6. "CORS errors" in browser

**Symptoms:** Frontend can't call AI engine API

**Solutions:**
- Verify `AI_ENGINE_URL` in frontend config
- Check nginx configuration for CORS headers
- Use Docker Compose (handles networking automatically)
- For local development without Docker:
  ```javascript
  // frontend/config.js
  aiEngine: {
    url: 'http://localhost:5000'
  }
  ```

### Performance Issues

#### Slow AI Engine Response

**Expected:** <3 seconds per request
**If slower:**

1. Check container resources:
   ```bash
   docker stats scrowpay-ai-engine
   ```

2. Increase CPU/memory limits:
   ```yaml
   # docker-compose.yml
   ai-engine:
     deploy:
       resources:
         limits:
           cpus: '2'
           memory: 1G
   ```

3. Verify model is loaded (not training on each request)

#### Slow Frontend Load Time

**Expected:** <2 seconds on 4G

**Solutions:**
- Enable gzip compression (already in nginx.conf)
- Optimize images
- Use CDN for static assets
- Enable browser caching

### Logs and Debugging

```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f ai-engine
docker-compose logs -f frontend

# View last 100 lines
docker-compose logs --tail 100 ai-engine

# View logs since 1 hour ago
docker-compose logs --since 1h ai-engine

# Export logs to file
docker-compose logs > logs.txt
```

### Health Checks

```bash
# AI Engine health
curl http://localhost:5000/health

# Expected response:
# {
#   "status": "healthy",
#   "model_loaded": true,
#   "model_version": "1.0.0",
#   "timestamp": "2024-01-15T14:30:00Z"
# }

# Frontend health (nginx)
curl http://localhost:8080

# Database health (Turso)
curl -X POST "YOUR_TURSO_DATABASE_URL" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{"statements": ["SELECT 1"]}'
```

---

## Security Checklist

Before deploying to production:

- [ ] All environment variables set correctly
- [ ] `.env` file NOT committed to git
- [ ] Using production Squad API credentials
- [ ] HTTPS enabled (SSL/TLS certificates)
- [ ] Database auth tokens rotated
- [ ] Firewall rules configured
- [ ] Rate limiting enabled
- [ ] CORS configured properly
- [ ] Security headers enabled (in nginx.conf)
- [ ] Logs monitored for suspicious activity
- [ ] Backup strategy in place

---

## Support

For issues or questions:

1. Check this deployment guide
2. Review logs: `docker-compose logs -f`
3. Check health endpoints
4. Review Squad API documentation: https://squadco.com/docs
5. Review Turso documentation: https://docs.turso.tech

---

## Next Steps

After successful deployment:

1. ✅ Test complete transaction flow
2. ✅ Verify AI risk scoring works
3. ✅ Test Squad API integration
4. ✅ Set up monitoring and alerts
5. ✅ Configure backup strategy
6. ✅ Document any custom configurations
7. ✅ Train team on deployment process

---

**Built for ScrowPay Hackathon** 🚀
