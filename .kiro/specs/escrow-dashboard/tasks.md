# Implementation Plan: Escrow Dashboard

## Overview

This implementation plan covers the complete Escrow Dashboard feature for ScrowPay, a hackathon project that implements pre-transaction anomaly detection using AI. The implementation is structured to deliver core functionality quickly while maintaining code quality and testability.

**Technology Stack:**
- Frontend: Vanilla JavaScript, HTML, Tailwind CSS
- Database: Turso DB (libSQL over HTTP)
- Payment API: Squad API
- AI Engine: Python microservice (Flask + scikit-learn Isolation Forest)

**Implementation Strategy:**
1. Database schema and core data layer first
2. Frontend services in parallel (6 core services)
3. AI Risk Engine as standalone Python microservice
4. Transaction flows and state machine
5. Integration and testing

## Tasks

- [x] 1. Set up database schema and core tables
  - Create `transactions` table with all required fields (transaction_id, seller_id, buyer_id, item_description, price, delivery_timeline_days, inspection_window_days, state, risk_score, ai_verdict, timestamps)
  - Create `transaction_state_history` table for audit trail
  - Create `disputes` table for dispute resolution tracking
  - Create `trust_scores` cache table
  - Create `ai_risk_logs` table for AI scoring audit
  - Add all indexes for performance (idx_transaction_id, idx_seller_id, idx_buyer_id, idx_state, idx_created_at)
  - Add CHECK constraints for data validation (price range, timeline ranges, valid states)
  - _Requirements: 1.2, 3.3, 3.6, 3.7, 3.8, 6.1, 6.8, 10.2, 14.7, 16.6_

- [ ]* 1.1 Write property test for database schema constraints
  - **Property 4: Input Validation Boundaries**
  - **Validates: Requirements 3.6, 3.7, 3.8**
  - Test that database rejects invalid prices, delivery timelines, and inspection windows

- [ ] 2. Implement core frontend services (6 services)
  - [x] 2.1 Create TransactionService.js for transaction CRUD operations
    - Implement `createTransaction(data)` with UUID generation (format: "TXN-{uuid}")
    - Implement `getTransaction(transactionId)` for retrieval
    - Implement `getActiveTransactions(userId)` with state filtering
    - Implement `getTransactionHistory(userId, filters)` with pagination
    - Add input validation for all fields
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 8.1, 8.2, 16.1, 16.2_
  
  - [ ]* 2.1.1 Write property test for Transaction ID uniqueness
    - **Property 5: Transaction ID Uniqueness**
    - **Validates: Requirements 3.3**
  
  - [x] 2.2 Create BalanceService.js for balance calculations
    - Implement `getAvailableBalance(virtualAccountNumber)` with Squad API integration
    - Implement `getLockedBalance(userId)` with Turso DB query (SUM amounts WHERE state IN 'Funded_Locked', 'In_Transit')
    - Implement `getBalances(userId, virtualAccountNumber)` to fetch both in parallel
    - Implement `validateBalanceInvariant(available, locked, total)` checker
    - Add 30-second cache with TTL for Squad API responses
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.7, 11.1, 11.2, 11.7_
  
  - [ ]* 2.2.1 Write property test for balance invariant
    - **Property 1: Balance Invariant**
    - **Validates: Requirements 1.7, 11.7**
  
  - [ ]* 2.2.2 Write property test for locked balance calculation
    - **Property 2: Locked Balance Calculation**
    - **Validates: Requirements 1.2**
  
  - [x] 2.3 Create TrustScoreService.js for reputation management
    - Implement `calculateTrustScore(userId)` with recency weighting formula: (successful/total) * 100, weight = e^(-days/30)
    - Implement `recalculateTrustScore(userId)` for updates
    - Implement `getVisualIndicator(score)` for color mapping (red <40, yellow 40-70, green >70)
    - Handle default score of 50 for new users (zero transactions)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_
  
  - [ ]* 2.3.1 Write property test for trust score calculation
    - **Property 22: Trust Score Calculation**
    - **Validates: Requirements 2.1, 2.7**
  
  - [ ]* 2.3.2 Write property test for trust score bounds
    - **Property 23: Trust Score Bounds**
    - **Validates: Requirements 2.2**
  
  - [x] 2.4 Create AIRiskService.js for AI integration
    - Implement `scoreTransaction(transactionData)` with HTTP POST to AI engine
    - Implement `extractFeatures(transactionData, userContext)` for feature preparation
    - Implement `handleTimeout()` with 5-second timeout and fallback to "fail" verdict
    - Add retry logic for transient failures
    - Log all requests/responses to ai_risk_logs table
    - _Requirements: 5.1, 5.2, 5.3, 5.6, 5.7, 5.8, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_
  
  - [ ]* 2.4.1 Write property test for AI risk scoring before funding
    - **Property 6: AI Risk Scoring Before Funding**
    - **Validates: Requirements 4.6, 5.1**
  
  - [ ]* 2.4.2 Write property test for risk verdict enforcement
    - **Property 8: Risk Verdict Enforcement**
    - **Validates: Requirements 5.4**
  
  - [x] 2.5 Create StateMachineService.js for state management
    - Define valid transitions map: Created→Funded_Locked, Funded_Locked→In_Transit, In_Transit→Completed/Disputed, Disputed→Completed
    - Implement `transitionState(transactionId, newState, userId, metadata)` with validation
    - Implement `isValidTransition(currentState, newState)` checker
    - Implement `validateUserPermission(transaction, newState, userId)` for authorization
    - Implement `executeStateActions(transaction, currentState, newState, metadata)` for side effects
    - Implement `scheduleAutoRelease(transaction)` for inspection window expiry
    - Implement `cancelAutoRelease(transactionId)` for cleanup
    - Record all state changes to transaction_state_history table
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 9.5, 9.7_
  
  - [ ]* 2.5.1 Write property test for state machine validity
    - **Property 10: State Machine Transition Validity**
    - **Validates: Requirements 6.3, 6.4, 6.5, 6.7, 6.9**
  
  - [ ]* 2.5.2 Write property test for auto-release timing
    - **Property 20: Auto-Release Timing**
    - **Validates: Requirements 6.6, 9.5**
  
  - [x] 2.6 Create DashboardService.js as main orchestrator
    - Implement `initialize(userId)` to load user data and start polling
    - Implement `refreshBalances()` to update balance displays
    - Implement `refreshTransactions()` to update transaction lists
    - Implement `startPolling()` with 30-second Squad API and 10-second Turso DB intervals
    - Implement `stopPolling()` for cleanup
    - Coordinate all other services (TransactionService, BalanceService, TrustScoreService, AIRiskService, StateMachineService)
    - _Requirements: 1.1, 1.3, 1.4, 2.1, 2.3, 2.4, 8.1, 8.4, 11.3, 11.4, 11.5_

- [x] 3. Checkpoint - Verify frontend services integration
  - Ensure all 6 services are created and can be instantiated
  - Verify service dependencies are correctly wired
  - Test basic service methods with mock data
  - Ensure all tests pass, ask the user if questions arise

- [x] 4. Build AI Risk Engine Python microservice
  - [x] 4.1 Create synthetic data generator
    - Generate 5,000-10,000 transaction records (95% normal, 5% anomalies)
    - Normal transactions: log-normal amounts, Poisson velocity (avg 2/day), gamma account age, business hours (8-22), trust score ~70
    - Anomalous transactions: very high amounts (₦500k-₦10M), high velocity (15-50/day), new accounts (<7 days), late night (2-5 AM), low trust (<30)
    - Save dataset to CSV for training
    - _Requirements: 15.1, 15.2, 15.3, 15.7_
  
  - [x] 4.2 Train Isolation Forest model
    - Configure IsolationForest with n_estimators=100, contamination=0.05, random_state=42
    - Train on synthetic dataset
    - Evaluate precision (≥80%) and recall (≥70%) on test set
    - Save trained model to pickle file
    - _Requirements: 15.4, 15.5, 15.6_
  
  - [x] 4.3 Create Flask REST API
    - Implement POST /api/v1/score endpoint
    - Accept features: transaction_amount, transaction_velocity, account_age_days, device_fingerprint, time_of_day, counterparty_trust_score
    - Return: risk_score (1-100), risk_flag (boolean), verdict ("pass"/"fail"), anomaly_indicators (array), model_version, timestamp
    - Implement GET /health endpoint for health checks
    - Add error handling and timeout protection
    - Ensure response time <3 seconds
    - _Requirements: 5.2, 5.3, 5.6, 14.1, 14.2, 14.3_
  
  - [ ]* 4.3.1 Write property test for AI response format
    - **Property 7: AI Risk Engine Response Format**
    - **Validates: Requirements 5.3**
  
  - [x] 4.4 Create Docker container for AI engine
    - Write Dockerfile with Python 3.11-slim base
    - Install dependencies (flask, scikit-learn, numpy, pandas, joblib)
    - Copy training script and model
    - Expose port 5000
    - Set CMD to run Flask app
    - _Requirements: 5.6_

- [x] 5. Implement transaction creation flow
  - Create dashboard.html form for "Create Escrow" with fields: item description, price, delivery timeline, inspection window
  - Add client-side validation for all fields (price ₦100-₦10M, delivery 1-90 days, inspection 1-14 days, description ≥10 chars)
  - Wire form submission to TransactionService.createTransaction()
  - Display generated Transaction_ID to seller for sharing
  - Show success notification on creation
  - Display specific error messages for validation failures
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 17.1, 17.6, 19.3_

- [ ]* 5.1 Write unit tests for transaction creation validation
  - Test each validation rule (price, timeline, inspection window, description length)
  - Test error message display for each validation failure
  - _Requirements: 3.6, 3.7, 3.8, 3.9_

- [x] 6. Implement transaction join and funding flow
  - Create "Join Transaction" UI with Transaction_ID input field
  - Implement transaction lookup and details display (item, price, timeline, inspection window, seller trust score)
  - Add "Fund Escrow" button with AI risk scoring integration
  - Call AIRiskService.scoreTransaction() BEFORE Squad API transfer
  - Display risk results (risk_score, verdict, anomaly_indicators) to buyer
  - Block transaction if verdict="fail" with clear message
  - If verdict="pass", proceed to Squad API fund transfer (buyer account → holding account)
  - On successful transfer, transition state to "Funded_Locked" via StateMachineService
  - Update balances immediately (optimistic UI update)
  - Handle errors: transaction not found, already in progress, AI engine unavailable, Squad API failure
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.4, 5.5, 7.1, 7.2, 7.3, 7.5, 17.3_

- [ ]* 6.1 Write integration test for complete funding flow
  - Test full sequence: lookup → AI scoring → Squad transfer → state transition → balance update
  - Verify AI is called before Squad API
  - Verify state changes to "Funded_Locked" only on success
  - _Requirements: 4.6, 5.1, 6.3, 7.3_

- [x] 7. Implement transaction state transitions (ship, accept, dispute)
  - [x] 7.1 Add "Mark as Shipped" button for sellers on Funded_Locked transactions
    - Validate user is seller
    - Transition state to "In_Transit" via StateMachineService
    - Set shipped_at timestamp
    - Start inspection window countdown timer
    - _Requirements: 6.4, 9.4_
  
  - [x] 7.2 Add "Accept Item" and "Dispute Item" buttons for buyers on In_Transit transactions
    - Display inspection window countdown timer
    - Validate user is buyer
    - On "Accept": transition to "Completed", release funds to seller via Squad API
    - On "Dispute": transition to "Disputed", prompt for photos and description
    - _Requirements: 6.5, 6.7, 9.1, 9.2, 9.3, 10.1, 10.2_
  
  - [x] 7.3 Implement auto-release mechanism
    - Calculate expiry: delivery_date + inspection_window_days
    - Schedule timer to auto-transition to "Completed" on expiry
    - Release funds to seller automatically
    - Notify both buyer and seller of auto-release
    - Cancel timer if buyer accepts or disputes before expiry
    - _Requirements: 6.6, 9.5, 9.6, 9.7_
  
  - [ ]* 7.3.1 Write property test for inspection window calculation
    - **Property 19: Inspection Window Calculation**
    - **Validates: Requirements 9.7**

- [x] 8. Implement balance display and real-time updates
  - Create balance display section in dashboard.html with Available_Balance and Locked_Balance
  - Format balances as ₦X,XXX.XX (Nigerian Naira with 2 decimal places)
  - Implement polling: Squad API every 30 seconds, Turso DB every 10 seconds
  - Update balance displays within 2 seconds of state changes
  - Display loading indicators during updates
  - Show staleness indicator when Squad API is unreachable (display cached balance with "Last updated X minutes ago")
  - Validate balance invariant: available + locked = total (log warning if mismatch)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

- [ ]* 8.1 Write property test for currency formatting
  - **Property 3: Currency Formatting**
  - **Validates: Requirements 1.5**

- [x] 9. Implement trust score display and calculation
  - Create trust score display section in dashboard.html
  - Display score as number (1-100) with visual indicator (red <40, yellow 40-70, green >70)
  - Calculate trust score on dashboard load using TrustScoreService
  - Recalculate within 5 seconds when transaction completes or is disputed
  - Handle new users (zero transactions) with default score of 50
  - Apply recency weighting: weight = e^(-days/30)
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [ ]* 9.1 Write property test for visual indicator mapping
  - **Property 24: Trust Score Visual Indicator Mapping**
  - **Validates: Requirements 2.6**

- [ ]* 9.2 Write property test for new user default score
  - **Property 25: New User Default Trust Score**
  - **Validates: Requirements 2.5**

- [x] 10. Implement active transactions list
  - Create transaction list UI with categories: "Awaiting Funding", "Funded", "In Transit", "Disputed"
  - Display for each transaction: Transaction_ID, item description, price, counterparty name, current state, time remaining
  - Filter transactions by user role (buyer or seller) and active states
  - Sort by creation date (newest first) within each category
  - Update list within 2 seconds of state changes
  - Add click handler to show full transaction details including state history
  - Display "No active transactions" message when list is empty
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [ ]* 10.1 Write property test for transaction ownership filtering
  - **Property 17: Transaction Ownership Filtering**
  - **Validates: Requirements 8.1**

- [x] 11. Implement quick actions and navigation
  - Add quick action buttons: "Create Escrow", "Join Transaction", "Add Funds", "Withdraw Funds"
  - Wire "Create Escrow" to transaction creation form
  - Wire "Join Transaction" to Transaction_ID input
  - Wire "Add Funds" to display Squad API payment instructions (user's virtual account number)
  - Wire "Withdraw Funds" to withdrawal form with Available_Balance limit validation
  - Disable "Withdraw Funds" button when Available_Balance is zero
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

- [x] 12. Implement error handling and user feedback
  - Create toast notification system (error, success, warning)
  - Map Squad API errors to user-friendly messages (401/403: "Authentication failed", 400: "Invalid request", 500+: "Service unavailable")
  - Map Turso DB errors to user-friendly messages ("Unable to load data. Please refresh.")
  - Map AI engine errors to user-friendly messages ("Risk scoring unavailable. Transaction blocked.")
  - Map network errors to user-friendly messages ("No internet connection. Please check your network.")
  - Implement retry logic with exponential backoff for Squad API (3 retries: 1s, 2s, 4s delays)
  - Display loading indicators for all async operations
  - Auto-dismiss success messages after 5 seconds
  - Require user dismissal for error messages
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 7.5, 7.6_

- [ ]* 12.1 Write unit tests for error handling
  - Test Squad API error mapping
  - Test retry logic with exponential backoff
  - Test network error handling
  - _Requirements: 7.5, 7.6, 17.1, 17.2, 17.3, 17.4_

- [x] 13. Implement security features
  - [x] 13.1 Add session management
    - Validate session token on dashboard load
    - Redirect to sign-in page if token invalid/expired
    - Store session token in localStorage (NOT sensitive data like PINs, BVN)
    - Implement 24-hour session expiry with inactivity timeout
    - Add "Logout" button to clear session and redirect
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 19.2_
  
  - [x] 13.2 Add input validation and sanitization
    - Validate all inputs on client-side before submission
    - Sanitize user-generated content to prevent XSS (escape HTML/JavaScript)
    - Use parameterized queries for all database operations (prevent SQL injection)
    - _Requirements: 19.3, 19.4_
  
  - [x] 13.3 Add rate limiting for transaction creation
    - Limit to 10 transactions per hour per user
    - Display clear error message when limit exceeded
    - Log rate limit violations to security_logs table
    - _Requirements: 19.6_
  
  - [x] 13.4 Add security event logging
    - Log failed risk checks, blocked transactions, rate limit violations
    - Store in database with event type, user_id, details, timestamp
    - Redact sensitive data in logs (mask phone numbers, hide amounts)
    - _Requirements: 19.7_
  
  - [ ]* 13.4.1 Write property test for XSS sanitization
    - **Property 26: XSS Sanitization**
    - **Validates: Requirements 19.4**
  
  - [ ]* 13.4.2 Write property test for sensitive data storage prevention
    - **Property 27: Sensitive Data Storage Prevention**
    - **Validates: Requirements 19.2**

- [x] 14. Implement transaction history and audit trail
  - Create transaction history page with all transactions (buyer or seller)
  - Display: Transaction_ID, date, item description, amount, counterparty, final state, trust score impact
  - Add filters: date range, transaction state, role (buyer/seller)
  - Add sorting: date, amount, state
  - Implement pagination (20 transactions per page)
  - Add click handler to show complete audit trail (all state transitions with timestamps)
  - Display Risk_Score and AI verdict for each transaction
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7_

- [x] 15. Implement dispute resolution flow
  - Create dispute form with photo upload and description fields
  - Send dispute data to AI_Risk_Engine for analysis
  - If AI confidence >90%, apply resolution automatically
  - If AI confidence ≤90%, flag for manual review
  - Notify both parties of dispute status and resolution timeline
  - On resolution, update transaction state to "Completed" and execute fund transfer per resolution
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

- [ ]* 15.1 Write property test for dispute resolution confidence threshold
  - **Property 21: Dispute Resolution Confidence Threshold**
  - **Validates: Requirements 10.4, 10.5**

- [x] 16. Implement responsive design and styling
  - Apply Tailwind CSS with brand colors (dark: #1c1c1c, green: #caff04)
  - Ensure responsive layout for 320px-2560px screen widths
  - Create mobile-optimized navigation menu for screens <768px
  - Optimize initial load time to <2 seconds on 4G connection
  - Implement lazy loading for transaction history
  - Use optimistic UI updates for user actions
  - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.7_

- [x] 17. Integrate with existing account creation flow
  - Accept session token from account creation page (URL parameter or localStorage)
  - Retrieve user data from Turso DB using phone number from session token
  - Display welcome message with user's first name
  - Display user's Virtual_Account number from Squad API
  - Initialize Trust_Score to 50 for new users
  - Display onboarding tooltips for first-time users
  - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7_

- [x] 18. Checkpoint - End-to-end testing
  - Test complete transaction flow: create → join → fund → ship → accept → complete
  - Test dispute flow: create → join → fund → ship → dispute → resolve
  - Test auto-release flow: create → join → fund → ship → wait for expiry → auto-complete
  - Test balance updates throughout all flows
  - Test trust score updates after completions and disputes
  - Verify all error handling paths work correctly
  - Ensure all tests pass, ask the user if questions arise

- [ ]* 18.1 Write integration tests for transaction flows
  - Test create-to-complete flow
  - Test dispute resolution flow
  - Test auto-release flow
  - Verify timing requirements (2-second UI updates, 3-second AI scoring)
  - _Requirements: 1.3, 1.4, 5.6, 8.4, 11.1, 11.2_

- [x] 19. Create deployment configuration
  - Create .env.example with all required environment variables (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, SQUAD_SECRET_KEY, SQUAD_PUBLIC_KEY, AI_ENGINE_URL, HOLDING_ACCOUNT)
  - Document environment setup in README.md
  - Create Docker Compose file for local development (AI engine + frontend)
  - Add deployment instructions for AI engine (Docker container)
  - Add deployment instructions for frontend (static hosting)
  - Document Squad API configuration (sandbox vs production)
  - _Requirements: All deployment-related requirements_

- [x] 20. Final checkpoint - Production readiness
  - Verify all core features work end-to-end
  - Verify all error handling is in place
  - Verify all security features are implemented
  - Verify performance meets requirements (load time, update speed, AI response time)
  - Verify responsive design works on mobile and desktop
  - Review code for any hardcoded credentials or sensitive data
  - Ensure all tests pass, ask the user if questions arise

## Notes

- Tasks marked with `*` are optional property-based tests and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints (tasks 3, 18, 20) ensure incremental validation and provide opportunities for user feedback
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end flows and timing requirements
- The AI Risk Engine (task 4) can be developed in parallel with frontend services (task 2)
- Focus on core transaction flows first (tasks 5-7) before adding polish (tasks 14-17)
