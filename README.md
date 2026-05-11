# ScrowPay - AI-Powered Escrow Platform

ScrowPay is an innovative escrow platform that uses AI-powered pre-transaction anomaly detection to prevent fraud before funds are locked. Built for the Squad Hackathon.

## 🌟 Key Features

- **Pre-Transaction AI Risk Scoring**: Detect anomalies before funds are committed
- **Real-Time Balance Management**: Separate tracking of available and locked funds
- **Trust Score System**: Reputation metric based on transaction history
- **Automated Resolution**: Three-tier dispute resolution (automated, AI-assisted, manual)
- **State Machine Architecture**: Deterministic transaction lifecycle management
- **Squad API Integration**: Virtual accounts and seamless payments
- **Turso Database**: Fast, distributed SQLite database

## 🏗️ Architecture

```
ScrowPay/
├── frontend/              # Vanilla JS, HTML, Tailwind CSS
│   ├── website.html      # Landing page
│   ├── account-creation.html
│   ├── sign-in.html
│   ├── dashboard.html    # Main escrow dashboard
│   └── services/         # Frontend services
│
├── ai-engine/            # Python microservice
│   ├── app.py           # Flask API
│   ├── train_model.py   # Isolation Forest training
│   ├── Dockerfile       # Container configuration
│   └── models/          # Trained ML models
│
├── .env.example         # Environment variables template
├── docker-compose.yml   # Complete deployment setup
└── DEPLOYMENT.md        # Comprehensive deployment guide
```

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Git

### 1. Clone Repository

```bash
git clone <repository-url>
cd scrowpay
```

### 2. Set Up Environment Variables

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your credentials
# Required: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, SQUAD_SECRET_KEY, SQUAD_PUBLIC_KEY
```

### 3. Start Services

```bash
# Start all services (AI engine + frontend)
docker-compose up -d

# View logs
docker-compose logs -f
```

### 4. Access Application

- **Frontend**: http://localhost:8080
- **AI Engine**: http://localhost:5000
- **Health Check**: http://localhost:5000/health

## 📚 Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Complete deployment guide
  - Local development setup
  - Docker deployment
  - Production deployment (Vercel, Netlify, VPS)
  - Squad API configuration
  - Troubleshooting

- **[frontend/README.md](frontend/README.md)** - Frontend documentation
  - File structure
  - Services overview
  - Authentication flow
  - Database schema

- **[ai-engine/README.md](ai-engine/README.md)** - AI engine documentation
  - Synthetic data generation
  - Model training
  - API endpoints

- **[ai-engine/DOCKER_DEPLOYMENT.md](ai-engine/DOCKER_DEPLOYMENT.md)** - AI engine Docker guide

## 🔧 Technology Stack

### Frontend
- **Framework**: Vanilla JavaScript (no frameworks)
- **Styling**: Tailwind CSS
- **Database**: Turso DB (libSQL over HTTP)
- **Payments**: Squad API

### AI Risk Engine
- **Language**: Python 3.11
- **Framework**: Flask
- **ML Algorithm**: Isolation Forest (scikit-learn)
- **Deployment**: Docker

## 🎯 Core Workflows

### Transaction Creation Flow
1. Seller creates escrow transaction with item details
2. System generates unique Transaction ID
3. Seller shares Transaction ID with buyer

### Transaction Funding Flow
1. Buyer enters Transaction ID
2. **AI Risk Engine scores transaction** (pre-funding)
3. If risk score passes, buyer funds escrow
4. Funds locked in holding account
5. Transaction state: Created → Funded_Locked

### Transaction Completion Flow
1. Seller marks item as shipped
2. Transaction state: Funded_Locked → In_Transit
3. Buyer receives item and accepts
4. Funds released to seller
5. Transaction state: In_Transit → Completed
6. Trust scores updated

### Auto-Release Mechanism
- If buyer doesn't respond within inspection window
- Funds automatically released to seller
- Both parties notified

## 🔐 Security Features

- ✅ Pre-transaction AI anomaly detection
- ✅ PIN hashing with SHA-256
- ✅ Session management with 24-hour expiry
- ✅ Input validation and sanitization
- ✅ Rate limiting (10 transactions/hour)
- ✅ Security event logging
- ✅ HTTPS/TLS support
- ✅ CORS protection

## 📊 AI Risk Scoring

The AI Risk Engine uses **Isolation Forest** algorithm to detect anomalies:

**Features Analyzed:**
- Transaction amount
- Transaction velocity (transactions/day)
- Account age
- Device fingerprint
- Time of day
- Counterparty trust score

**Risk Verdict:**
- **Pass**: Risk score ≤ 80 → Transaction allowed
- **Fail**: Risk score > 80 → Transaction blocked

**Performance:**
- Response time: <3 seconds
- Precision: ≥80%
- Recall: ≥70%

## 🌐 Environment Variables

Required environment variables (see `.env.example`):

```bash
# Turso Database
TURSO_DATABASE_URL=libsql://your-database-name.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token

# Squad API (Sandbox for testing)
SQUAD_SECRET_KEY=sandbox_sk_your-secret-key
SQUAD_PUBLIC_KEY=sandbox_pk_your-public-key
SQUAD_ENVIRONMENT=sandbox

# AI Risk Engine
AI_ENGINE_URL=http://localhost:5000

# Holding Account
HOLDING_ACCOUNT=your-holding-account-number
```

## 🧪 Testing

### Test Transaction Flow

1. **Create Account**
   - Go to http://localhost:8080/website.html
   - Click "Create Account"
   - Complete 9-stage registration

2. **Create Escrow Transaction**
   - Sign in to dashboard
   - Click "Create Escrow"
   - Fill in item details
   - Copy Transaction ID

3. **Fund Transaction** (as buyer)
   - Sign in with different account
   - Click "Join Transaction"
   - Enter Transaction ID
   - AI risk scoring runs automatically
   - Fund escrow if approved

4. **Complete Transaction**
   - Seller marks as shipped
   - Buyer accepts item
   - Funds released automatically

### Test AI Risk Engine

```bash
# Health check
curl http://localhost:5000/health

# Score a transaction
curl -X POST http://localhost:5000/api/v1/score \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_user",
    "transaction_amount": 50000,
    "transaction_velocity": 3,
    "account_age_days": 45,
    "device_fingerprint": 5432,
    "time_of_day": 14,
    "counterparty_trust_score": 75
  }'
```

## 📈 Performance Benchmarks

| Metric | Target | Actual |
|--------|--------|--------|
| Dashboard load time | <2s | ~1.5s |
| AI risk scoring | <3s | ~100ms |
| Balance updates | <2s | ~1s |
| Trust score calculation | <5s | ~2s |
| State transitions | <2s | ~1s |

## 🐛 Troubleshooting

### Common Issues

**Database connection failed**
- Verify `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`
- Check internet connection
- See [DEPLOYMENT.md](DEPLOYMENT.md#troubleshooting)

**Squad API error**
- Verify Squad API credentials
- Check if using correct environment (sandbox vs production)
- See [DEPLOYMENT.md](DEPLOYMENT.md#squad-api-configuration)

**AI Engine unavailable**
- Check if container is running: `docker-compose ps`
- View logs: `docker-compose logs -f ai-engine`
- Restart: `docker-compose restart ai-engine`

For more troubleshooting, see [DEPLOYMENT.md](DEPLOYMENT.md#troubleshooting)

## 📦 Deployment

### Local Development

```bash
docker-compose up -d
```

### Production Deployment

**Frontend:**
- Vercel (recommended)
- Netlify
- GitHub Pages

**AI Engine:**
- Docker on VPS (DigitalOcean, AWS EC2)
- Heroku
- Railway

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions.

## 🔄 Development Workflow

```bash
# Start development environment
docker-compose up -d

# View logs
docker-compose logs -f

# Rebuild after code changes
docker-compose up -d --build

# Stop services
docker-compose down
```

## 📝 Project Structure

```
ScrowPay/
├── frontend/
│   ├── dashboard.html                 # Main escrow dashboard
│   ├── DashboardService.js           # Main orchestrator
│   ├── TransactionService.js         # Transaction CRUD
│   ├── BalanceService.js             # Balance calculations
│   ├── TrustScoreService.js          # Reputation management
│   ├── AIRiskService.js              # AI integration
│   ├── StateMachineService.js        # State management
│   └── config.js                     # Environment config
│
├── ai-engine/
│   ├── app.py                        # Flask API
│   ├── train_model.py                # Model training
│   ├── generate_synthetic_data.py    # Data generation
│   ├── Dockerfile                    # Container config
│   └── models/                       # Trained models
│
├── .env.example                      # Environment template
├── docker-compose.yml                # Complete deployment
├── nginx.conf                        # Nginx configuration
├── DEPLOYMENT.md                     # Deployment guide
└── README.md                         # This file
```

## 🤝 Contributing

This is a hackathon project. For contributions:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

Proprietary - ScrowPay

## 🏆 Hackathon

Built for **Squad Hackathon** - Showcasing innovative use of:
- Squad API for payments
- AI/ML for fraud prevention
- Modern web technologies
- Containerized deployment

## 📞 Support

For issues or questions:
- Check [DEPLOYMENT.md](DEPLOYMENT.md)
- Review logs: `docker-compose logs -f`
- Check health endpoints
- Review Squad API docs: https://squadco.com/docs
- Review Turso docs: https://docs.turso.tech

---

**Built with ❤️ for Squad Hackathon** 🚀
