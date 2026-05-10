# ScrowPay Frontend

Clean, production-ready codebase for ScrowPay account creation and authentication.

## 📁 File Structure

```
frontend/
├── 🌐 Pages
│   ├── website.html              # Home/Landing page
│   ├── account-creation.html     # 9-stage registration flow
│   ├── sign-in.html             # Authentication page
│   └── dashboard.html           # User dashboard
│
├── 🔧 Services
│   ├── address-data-service.js  # State/LGA/Area data management
│   ├── error-handler-service.js # Error handling utilities
│   ├── id-validation-service.js # BVN/NIN validation
│   ├── mediapipe-service.js     # Face detection & blink detection
│   ├── otp-service.js           # OTP verification
│   ├── pin-service.js           # PIN validation & hashing
│   ├── squad-api-service.js     # Squad API integration
│   ├── turso-db-service.js      # Database operations
│   └── turso-config.js          # Database configuration
│
├── 📊 Data
│   └── state-lga-area.json      # Nigerian states, LGAs, and wards
│
└── 🚀 Server
    ├── START_SERVER.bat         # Windows server launcher
    └── start-server.ps1         # PowerShell server launcher
```

## 🚀 Quick Start

### 1. Start the Server
**Windows:**
```bash
Double-click START_SERVER.bat
```

**Mac/Linux:**
```bash
python3 -m http.server 8000
```

### 2. Open in Browser
```
http://localhost:8000/website.html
```

## 📄 Pages Overview

### 🏠 website.html
- Landing page with hero section
- Features showcase
- "Create Account" and "Sign In" buttons

### 📝 account-creation.html
Complete 9-stage registration flow:
1. Phone Number Entry
2. OTP Verification
3. ID Information (BVN/NIN)
4. Name Entry (First, Middle, Last)
5. Squad API Verification
6. Face Verification Intro
7. Blink Detection (MediaPipe)
8. Residential Address (Cascading Dropdowns)
9. PIN Setup

### 🔐 sign-in.html
- Phone number + 6-digit PIN authentication
- Database verification
- Session management
- Redirect to dashboard on success

### 📊 dashboard.html
- User dashboard (to be customized)
- Protected route (requires authentication)

## 🔧 Services Overview

### address-data-service.js
- Loads Nigerian states, LGAs, and wards
- Provides cascading dropdown functionality
- 36 states, 774 LGAs, thousands of wards

### pin-service.js
- Validates PIN format
- Blocks weak patterns (111111, 123456, 112233)
- Hashes PINs with SHA-256
- Uses phone number as salt

### turso-db-service.js
- Database connection management
- User CRUD operations
- Duplicate checking (phone, ID)
- Secure parameterized queries

### squad-api-service.js
- BVN/NIN verification
- Virtual account creation
- Payment processing integration

### mediapipe-service.js
- Face detection using MediaPipe
- Blink detection (liveness check)
- Eye Aspect Ratio (EAR) calculation

## 🔐 Authentication Flow

### Sign Up
```
Phone → OTP → ID → Name → Verification → Face → Address → PIN → Success
```

### Sign In
```
Phone + PIN → Database Lookup → PIN Verification → Session → Dashboard
```

### Session Management
- Uses `sessionStorage` for session data
- Stores user object and login status
- Cleared on browser close

## 🗄️ Database Schema

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone_number TEXT UNIQUE NOT NULL,
  id_type TEXT NOT NULL,
  id_number TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  dob TEXT,
  gender TEXT,
  current_address TEXT,
  permanent_address TEXT,
  hashed_pin TEXT NOT NULL,
  virtual_account_number TEXT,
  bank_code TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 🔒 Security Features

- ✅ PIN hashing with SHA-256
- ✅ Phone number as salt
- ✅ Parameterized database queries
- ✅ Input validation on all fields
- ✅ Session management
- ✅ CORS protection

## 🎨 Tech Stack

- **Frontend:** Vanilla JavaScript, HTML5, Tailwind CSS
- **Database:** Turso (libSQL)
- **APIs:** Squad API (payments), MediaPipe (face detection)
- **Fonts:** Inter (Google Fonts)
- **Icons:** Material Symbols

## 📝 Environment Variables

Update these in the respective service files:

### Turso Database
```javascript
// turso-db-service.js
const dbUrl = 'your-database-url';
const authToken = 'your-auth-token';
```

### Squad API
```javascript
// squad-api-service.js
const secretKey = 'your-secret-key';
const publicKey = 'your-public-key';
```

## 🧪 Testing

### Test Account Creation
1. Go to `http://localhost:8000/website.html`
2. Click "Create Account"
3. Complete all 9 stages
4. Use OTP: `123456` (hardcoded for testing)

### Test Sign In
1. Go to `http://localhost:8000/sign-in.html`
2. Enter registered phone number
3. Enter 6-digit PIN
4. Should redirect to dashboard

## 🚀 Deployment

### Option 1: Vercel (Recommended)
```bash
npm install -g vercel
vercel
```

### Option 2: Netlify
```bash
npm install -g netlify-cli
netlify deploy
```

### Option 3: GitHub Pages
1. Push to GitHub
2. Enable GitHub Pages in settings
3. Select branch and folder

## 📦 Dependencies

### CDN (No Installation Required)
- Tailwind CSS: `https://cdn.tailwindcss.com`
- Turso Client: `https://cdn.jsdelivr.net/npm/@libsql/client@0.3.5/dist/index.js`
- MediaPipe Face Mesh: `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh`
- Google Fonts (Inter): `https://fonts.googleapis.com/css2?family=Inter`

## 🐛 Troubleshooting

### "Failed to load address data"
- Make sure you're running a local server (not opening file directly)
- Check that `state-lga-area.json` exists

### "Database connection failed"
- Check internet connection
- Verify Turso credentials in `turso-db-service.js`

### "Squad API error"
- Verify Squad API credentials
- Check if you've reached sandbox account limit

## 📚 Next Steps

1. **Add Sign Out to Dashboard**
   - Add sign-out button
   - Clear session storage
   - Redirect to home page

2. **Customize Dashboard**
   - Add user profile display
   - Add transaction history
   - Add account balance

3. **Add More Features**
   - Password reset
   - Profile editing
   - Transaction management

## 📄 License

Proprietary - ScrowPay

## 👥 Support

For issues or questions, contact the development team.

---

**Built with ❤️ for ScrowPay**
