# Requirements Document: Escrow Dashboard

## Introduction

The Escrow Dashboard is the core interface for ScrowPay, an escrow platform that differentiates itself through pre-transaction anomaly detection rather than reactive dispute resolution. This dashboard serves as the primary user interface after account creation, enabling users to manage their escrow transactions, view balances, monitor trust scores, and interact with the AI-powered risk scoring system.

ScrowPay is a hackathon project (Squad Hackathon) that integrates Turso DB for data persistence and Squad API for virtual accounts and payments. The platform uses an Isolation Forest machine learning algorithm to detect anomalies before funds are locked, preventing fraudulent transactions proactively.

## Glossary

- **Dashboard**: The main user interface displaying balances, trust scores, and transaction management controls
- **Available_Balance**: Funds that the user can withdraw immediately from their virtual account
- **Locked_Balance**: Funds held in active escrow transactions where the user is either buyer or seller
- **Trust_Score**: A numerical metric (1-100) representing user reliability based on past successful transactions
- **Risk_Score**: An AI-generated score (1-100) indicating the likelihood that a transaction is anomalous
- **Transaction**: An escrow contract between a buyer and seller with defined terms, price, and delivery timeline
- **Transaction_State_Machine**: The system managing transaction lifecycle through states: Created, Funded_Locked, Awaiting_Fulfillment, In_Transit, Disputed, Completed
- **AI_Risk_Engine**: The Python microservice using Isolation Forest algorithm for pre-transaction anomaly detection
- **Isolation_Forest**: An unsupervised machine learning algorithm that identifies anomalies by isolating observations
- **Squad_API**: The payment service provider API for virtual account management and fund transfers
- **Turso_DB**: The database service for persisting user and transaction data
- **Inspection_Window**: The time period during which a buyer can accept or dispute a delivered item
- **Auto_Release**: Automatic fund release to seller when inspection window expires without buyer action
- **Virtual_Account**: A unique NUBAN account number assigned to each user for receiving payments
- **Transaction_ID**: A unique identifier generated for each escrow transaction
- **Seller**: The user creating an escrow transaction and providing goods/services
- **Buyer**: The user joining an escrow transaction and funding it
- **Anomaly_Detection**: The process of identifying unusual patterns in transaction data before funds are locked
- **Device_Metadata**: Information about the user's device used for risk scoring
- **Transaction_Velocity**: The rate at which a user creates or participates in transactions
- **Resolution_Layer**: The three-tier system for handling transaction completion: automated, AI-assisted, and manual review

## Requirements

### Requirement 1: Dashboard Balance Display

**User Story:** As a user, I want to see my available balance and locked balance separately on the dashboard, so that I understand how much money I can withdraw versus how much is held in active transactions.

#### Acceptance Criteria

1. WHEN the Dashboard loads, THE Dashboard SHALL display the Available_Balance retrieved from Squad_API
2. WHEN the Dashboard loads, THE Dashboard SHALL display the Locked_Balance calculated from active Transaction records in Turso_DB
3. WHEN a Transaction state changes to Funded_Locked, THE Dashboard SHALL update the Locked_Balance within 2 seconds
4. WHEN a Transaction state changes to Completed, THE Dashboard SHALL update both Available_Balance and Locked_Balance within 2 seconds
5. THE Dashboard SHALL display both balances in Nigerian Naira (₦) with two decimal places
6. WHEN Squad_API is unreachable, THE Dashboard SHALL display the last known Available_Balance with a staleness indicator
7. FOR ALL balance updates, the sum of Available_Balance and Locked_Balance SHALL equal the total funds in the user's Virtual_Account

### Requirement 2: Trust Score Display

**User Story:** As a user, I want to see my trust score prominently displayed on the dashboard, so that I understand my reputation on the platform.

#### Acceptance Criteria

1. WHEN the Dashboard loads, THE Dashboard SHALL calculate and display the Trust_Score based on completed Transaction history
2. THE Dashboard SHALL display Trust_Score as a number between 1 and 100
3. WHEN a Transaction completes successfully without dispute, THE Dashboard SHALL recalculate Trust_Score within 5 seconds
4. WHEN a Transaction is disputed, THE Dashboard SHALL recalculate Trust_Score within 5 seconds
5. WHERE the user has zero completed transactions, THE Dashboard SHALL display a default Trust_Score of 50
6. THE Dashboard SHALL display a visual indicator (color-coded: red <40, yellow 40-70, green >70) alongside the Trust_Score
7. FOR ALL Trust_Score calculations, the score SHALL be based on: (successful_transactions / total_transactions) * 100, weighted by transaction recency

### Requirement 3: Create Transaction Flow

**User Story:** As a seller, I want to create an escrow transaction with item details and terms, so that I can securely sell goods or services to a buyer.

#### Acceptance Criteria

1. WHEN the user clicks "Create Escrow", THE Dashboard SHALL display a transaction creation form
2. THE Dashboard SHALL require the following fields: item description, price (₦), delivery timeline (days), inspection window (days)
3. WHEN the user submits the form with valid data, THE Dashboard SHALL generate a unique Transaction_ID
4. WHEN a Transaction_ID is generated, THE Dashboard SHALL save the Transaction to Turso_DB with state "Created"
5. WHEN the Transaction is saved, THE Dashboard SHALL display the Transaction_ID to the seller for sharing with the buyer
6. THE Dashboard SHALL validate that price is greater than ₦100 and less than ₦10,000,000
7. THE Dashboard SHALL validate that delivery timeline is between 1 and 90 days
8. THE Dashboard SHALL validate that inspection window is between 1 and 14 days
9. IF any validation fails, THEN THE Dashboard SHALL display specific error messages without saving the Transaction

### Requirement 4: Join Transaction Flow

**User Story:** As a buyer, I want to join an existing escrow transaction using a transaction ID, so that I can review terms and fund the escrow.

#### Acceptance Criteria

1. WHEN the user clicks "Join Transaction", THE Dashboard SHALL display a Transaction_ID input field
2. WHEN the user enters a Transaction_ID, THE Dashboard SHALL retrieve the Transaction details from Turso_DB
3. IF the Transaction_ID does not exist, THEN THE Dashboard SHALL display "Transaction not found" error
4. IF the Transaction state is not "Created", THEN THE Dashboard SHALL display "Transaction already in progress" error
5. WHEN a valid Transaction is found, THE Dashboard SHALL display: item description, price, delivery timeline, inspection window, and seller Trust_Score
6. WHEN the buyer clicks "Fund Escrow", THE Dashboard SHALL invoke AI_Risk_Engine for anomaly detection before proceeding
7. THE Dashboard SHALL display the AI_Risk_Engine results (Risk_Score, risk flag, verdict) to the buyer before final confirmation

### Requirement 5: Pre-Transaction AI Risk Scoring

**User Story:** As the system, I want to score transactions for anomalies before funds are locked, so that I can prevent fraudulent transactions proactively.

#### Acceptance Criteria

1. WHEN a buyer attempts to fund a Transaction, THE Dashboard SHALL send transaction data to AI_Risk_Engine before calling Squad_API
2. THE AI_Risk_Engine SHALL analyze: Transaction_Velocity, Device_Metadata, network patterns, and account age
3. THE AI_Risk_Engine SHALL return: Risk_Score (1-100), risk flag (boolean), and verdict (pass/fail)
4. IF the verdict is "fail", THEN THE Dashboard SHALL block the transaction and display "Transaction blocked due to high risk" message
5. IF the verdict is "pass", THEN THE Dashboard SHALL proceed to Squad_API fund transfer
6. THE AI_Risk_Engine SHALL complete analysis within 3 seconds
7. IF AI_Risk_Engine is unreachable, THEN THE Dashboard SHALL default to "fail" verdict and require manual review
8. THE Dashboard SHALL log all Risk_Score results to Turso_DB for audit purposes
9. FOR ALL transactions with Risk_Score above 80, the system SHALL flag for manual review even if verdict is "pass"

### Requirement 6: Transaction State Machine

**User Story:** As the system, I want to manage transaction lifecycle through defined states, so that transactions progress correctly from creation to completion.

#### Acceptance Criteria

1. THE Transaction_State_Machine SHALL support states: Created, Funded_Locked, Awaiting_Fulfillment, In_Transit, Disputed, Completed
2. WHEN a Transaction is created, THE Transaction_State_Machine SHALL set state to "Created"
3. WHEN Squad_API confirms fund transfer, THE Transaction_State_Machine SHALL transition state from "Created" to "Funded_Locked"
4. WHEN the seller marks item as shipped, THE Transaction_State_Machine SHALL transition state from "Funded_Locked" to "In_Transit"
5. WHEN the buyer accepts the item, THE Transaction_State_Machine SHALL transition state from "In_Transit" to "Completed"
6. WHEN the inspection window expires without buyer action, THE Transaction_State_Machine SHALL transition state from "In_Transit" to "Completed" (Auto_Release)
7. WHEN the buyer disputes the item, THE Transaction_State_Machine SHALL transition state from "In_Transit" to "Disputed"
8. THE Transaction_State_Machine SHALL persist all state changes to Turso_DB with timestamps
9. THE Transaction_State_Machine SHALL reject invalid state transitions (e.g., "Created" to "Completed")

### Requirement 7: Squad API Payment Integration

**User Story:** As the system, I want to integrate with Squad API for fund transfers, so that escrow payments are processed securely.

#### Acceptance Criteria

1. WHEN a buyer funds a Transaction, THE Dashboard SHALL call Squad_API to transfer funds from buyer's Virtual_Account to central holding account
2. THE Dashboard SHALL include Transaction_ID in Squad_API payment metadata
3. WHEN Squad_API confirms successful transfer, THE Dashboard SHALL update Transaction state to "Funded_Locked"
4. WHEN a Transaction completes, THE Dashboard SHALL call Squad_API to transfer funds from holding account to seller's Virtual_Account
5. IF Squad_API returns an error, THEN THE Dashboard SHALL display the error message and not update Transaction state
6. THE Dashboard SHALL retry failed Squad_API calls up to 3 times with exponential backoff
7. THE Dashboard SHALL log all Squad_API requests and responses to Turso_DB for audit purposes
8. WHEN Squad_API is unreachable for more than 30 seconds, THE Dashboard SHALL display "Payment service unavailable" message

### Requirement 8: Active Transactions List

**User Story:** As a user, I want to see a list of my active transactions categorized by status, so that I can track ongoing escrow deals.

#### Acceptance Criteria

1. WHEN the Dashboard loads, THE Dashboard SHALL retrieve all active Transactions where the user is buyer or seller
2. THE Dashboard SHALL categorize Transactions by state: "Awaiting Funding", "Funded", "In Transit", "Disputed"
3. THE Dashboard SHALL display for each Transaction: Transaction_ID, item description, price, counterparty name, current state, and time remaining
4. WHEN a Transaction state changes, THE Dashboard SHALL update the list within 2 seconds
5. THE Dashboard SHALL sort Transactions by creation date (newest first) within each category
6. WHEN the user clicks a Transaction, THE Dashboard SHALL display full Transaction details including state history
7. WHERE the user has no active Transactions, THE Dashboard SHALL display "No active transactions" message

### Requirement 9: Transaction Completion and Fund Release

**User Story:** As a buyer, I want to accept delivered items within the inspection window, so that funds are released to the seller.

#### Acceptance Criteria

1. WHEN a Transaction is in "In_Transit" state, THE Dashboard SHALL display "Accept Item" and "Dispute Item" buttons to the buyer
2. WHEN the buyer clicks "Accept Item", THE Dashboard SHALL transition Transaction state to "Completed"
3. WHEN Transaction state becomes "Completed", THE Dashboard SHALL call Squad_API to release funds to seller's Virtual_Account
4. THE Dashboard SHALL display inspection window countdown timer for "In_Transit" transactions
5. WHEN the inspection window expires without buyer action, THE Dashboard SHALL automatically transition state to "Completed" (Auto_Release)
6. WHEN Auto_Release occurs, THE Dashboard SHALL notify both buyer and seller
7. THE Dashboard SHALL calculate inspection window expiry as: delivery_date + inspection_window_days

### Requirement 10: Dispute Resolution Layer

**User Story:** As a user, I want disputes to be resolved through automated, AI-assisted, or manual review, so that conflicts are handled fairly.

#### Acceptance Criteria

1. WHEN a buyer clicks "Dispute Item", THE Dashboard SHALL transition Transaction state to "Disputed"
2. WHEN a Transaction enters "Disputed" state, THE Dashboard SHALL prompt the buyer to upload photos and provide description
3. THE Dashboard SHALL send dispute data to AI_Risk_Engine for analysis
4. WHERE the AI_Risk_Engine can resolve the dispute with >90% confidence, THE Dashboard SHALL apply the resolution automatically
5. WHERE the AI_Risk_Engine confidence is <90%, THE Dashboard SHALL flag for manual review
6. THE Dashboard SHALL notify both parties of dispute status and resolution timeline
7. WHEN a dispute is resolved, THE Dashboard SHALL update Transaction state to "Completed" and execute fund transfer per resolution

### Requirement 11: Real-Time Balance Updates

**User Story:** As a user, I want my balances to update in real-time when transactions change state, so that I always see accurate financial information.

#### Acceptance Criteria

1. WHEN a Transaction state changes, THE Dashboard SHALL recalculate Available_Balance and Locked_Balance
2. THE Dashboard SHALL update balance displays within 2 seconds of state change
3. THE Dashboard SHALL poll Squad_API for Available_Balance every 30 seconds
4. THE Dashboard SHALL poll Turso_DB for Transaction state changes every 10 seconds
5. WHEN the user performs an action that changes balances, THE Dashboard SHALL update immediately without waiting for polling interval
6. THE Dashboard SHALL display a loading indicator during balance updates
7. FOR ALL balance calculations, the Dashboard SHALL ensure Available_Balance + Locked_Balance equals total Virtual_Account balance

### Requirement 12: Dashboard Quick Actions

**User Story:** As a user, I want quick access to common actions from the dashboard, so that I can efficiently manage my escrow activities.

#### Acceptance Criteria

1. THE Dashboard SHALL display quick action buttons: "Create Escrow", "Join Transaction", "Add Funds", "Withdraw Funds"
2. WHEN the user clicks "Create Escrow", THE Dashboard SHALL display the transaction creation form
3. WHEN the user clicks "Join Transaction", THE Dashboard SHALL display the Transaction_ID input field
4. WHEN the user clicks "Add Funds", THE Dashboard SHALL display Squad_API payment instructions for the user's Virtual_Account
5. WHEN the user clicks "Withdraw Funds", THE Dashboard SHALL display withdrawal form with Available_Balance limit
6. THE Dashboard SHALL disable "Withdraw Funds" button when Available_Balance is zero
7. THE Dashboard SHALL validate withdrawal amount does not exceed Available_Balance

### Requirement 13: User Session Management

**User Story:** As a user, I want my session to persist securely across page reloads, so that I don't have to sign in repeatedly.

#### Acceptance Criteria

1. WHEN the user signs in successfully, THE Dashboard SHALL store session token in browser localStorage
2. WHEN the Dashboard loads, THE Dashboard SHALL validate session token with Turso_DB
3. IF session token is invalid or expired, THEN THE Dashboard SHALL redirect to sign-in page
4. THE Dashboard SHALL expire sessions after 24 hours of inactivity
5. WHEN the user clicks "Logout", THE Dashboard SHALL clear session token and redirect to sign-in page
6. THE Dashboard SHALL display user's first name in the header
7. THE Dashboard SHALL retrieve user data from Turso_DB using phone number from session token

### Requirement 14: AI Risk Engine Integration

**User Story:** As the system, I want to integrate with the Python AI microservice, so that anomaly detection is performed before transactions are funded.

#### Acceptance Criteria

1. THE Dashboard SHALL send HTTP POST requests to AI_Risk_Engine endpoint with transaction data
2. THE Dashboard SHALL include in request: user_id, Transaction_Velocity, Device_Metadata, account_age, transaction_amount, counterparty_trust_score
3. THE AI_Risk_Engine SHALL respond with JSON containing: risk_score (1-100), risk_flag (boolean), verdict ("pass"/"fail"), anomaly_indicators (array)
4. THE Dashboard SHALL timeout AI_Risk_Engine requests after 5 seconds
5. IF AI_Risk_Engine request times out, THEN THE Dashboard SHALL default to "fail" verdict
6. THE Dashboard SHALL display anomaly_indicators to the user when verdict is "fail"
7. THE Dashboard SHALL log all AI_Risk_Engine requests and responses to Turso_DB

### Requirement 15: Synthetic Data for AI Training

**User Story:** As the system, I want to use synthetic transaction data for AI model training, so that the Isolation Forest algorithm can detect anomalies effectively during the hackathon demo.

#### Acceptance Criteria

1. THE AI_Risk_Engine SHALL be trained on synthetic dataset containing 5,000 to 10,000 transaction records
2. THE synthetic dataset SHALL contain 5% anomalous transactions (250-500 anomalies)
3. THE synthetic dataset SHALL include features: transaction_amount, transaction_velocity, account_age_days, device_fingerprint, time_of_day, counterparty_trust_score
4. THE Isolation_Forest model SHALL be configured with contamination parameter of 0.05 (5% anomalies)
5. THE AI_Risk_Engine SHALL achieve at least 80% precision on anomaly detection in test set
6. THE AI_Risk_Engine SHALL achieve at least 70% recall on anomaly detection in test set
7. THE synthetic data generator SHALL create realistic distributions for normal transactions and clear outliers for anomalies

### Requirement 16: Transaction History and Audit Trail

**User Story:** As a user, I want to view my complete transaction history, so that I can track all past escrow activities.

#### Acceptance Criteria

1. WHEN the user clicks "View Transactions", THE Dashboard SHALL display all Transactions where the user is buyer or seller
2. THE Dashboard SHALL display for each Transaction: Transaction_ID, date, item description, amount, counterparty, final state, and Trust_Score impact
3. THE Dashboard SHALL allow filtering by: date range, transaction state, role (buyer/seller)
4. THE Dashboard SHALL allow sorting by: date, amount, state
5. THE Dashboard SHALL paginate results showing 20 transactions per page
6. WHEN the user clicks a Transaction, THE Dashboard SHALL display complete audit trail including all state transitions with timestamps
7. THE Dashboard SHALL display Risk_Score and AI verdict for each Transaction

### Requirement 17: Error Handling and User Feedback

**User Story:** As a user, I want clear error messages when something goes wrong, so that I understand what happened and how to fix it.

#### Acceptance Criteria

1. WHEN Squad_API returns an error, THE Dashboard SHALL display a user-friendly error message (not raw API error)
2. WHEN Turso_DB query fails, THE Dashboard SHALL display "Unable to load data. Please refresh the page."
3. WHEN AI_Risk_Engine is unreachable, THE Dashboard SHALL display "Risk scoring unavailable. Transaction blocked for security."
4. WHEN network connection is lost, THE Dashboard SHALL display "No internet connection. Please check your network."
5. THE Dashboard SHALL display loading indicators for all asynchronous operations
6. THE Dashboard SHALL display success messages for completed actions (e.g., "Transaction created successfully")
7. THE Dashboard SHALL auto-dismiss success messages after 5 seconds
8. THE Dashboard SHALL require user dismissal for error messages

### Requirement 18: Responsive Design and Performance

**User Story:** As a user, I want the dashboard to load quickly and work on mobile devices, so that I can manage escrow transactions on any device.

#### Acceptance Criteria

1. THE Dashboard SHALL load initial view within 2 seconds on 4G connection
2. THE Dashboard SHALL be fully responsive for screen widths from 320px to 2560px
3. THE Dashboard SHALL use Tailwind CSS with existing brand colors (dark: #1c1c1c, green: #caff04)
4. THE Dashboard SHALL display mobile-optimized navigation menu on screens below 768px width
5. THE Dashboard SHALL lazy-load transaction history to improve initial load time
6. THE Dashboard SHALL cache Squad_API balance responses for 30 seconds to reduce API calls
7. THE Dashboard SHALL use optimistic UI updates for user actions (update UI immediately, then sync with backend)

### Requirement 19: Security and Data Protection

**User Story:** As a user, I want my financial data and transactions to be secure, so that my money and information are protected.

#### Acceptance Criteria

1. THE Dashboard SHALL transmit all data over HTTPS
2. THE Dashboard SHALL not store sensitive data (PINs, full BVN) in browser localStorage
3. THE Dashboard SHALL validate all user inputs on client-side before sending to backend
4. THE Dashboard SHALL sanitize all user-generated content to prevent XSS attacks
5. THE Dashboard SHALL implement CSRF protection for state-changing operations
6. THE Dashboard SHALL rate-limit transaction creation to 10 per hour per user
7. THE Dashboard SHALL log all security-relevant events (failed risk checks, blocked transactions) to Turso_DB

### Requirement 20: Integration with Existing Account Creation Flow

**User Story:** As a user, I want to be redirected to the dashboard after completing signup, so that I can immediately start using the platform.

#### Acceptance Criteria

1. WHEN account creation completes successfully, THE account creation page SHALL redirect to Dashboard with user session token
2. THE Dashboard SHALL accept session token as URL parameter or localStorage value
3. THE Dashboard SHALL retrieve user data from Turso_DB using phone number from session token
4. THE Dashboard SHALL display welcome message with user's first name
5. THE Dashboard SHALL display user's Virtual_Account number from Squad_API
6. THE Dashboard SHALL initialize Trust_Score to 50 for new users
7. THE Dashboard SHALL display onboarding tooltips for first-time users explaining key features

## Correctness Properties for Property-Based Testing

### Property 1: Balance Invariant

**Property:** FOR ALL balance updates, Available_Balance + Locked_Balance SHALL equal the total funds in Virtual_Account

**Test Strategy:** Generate random sequences of transaction state changes and verify the balance invariant holds after each change.

**Input Space:** 
- Random transaction amounts (₦100 - ₦1,000,000)
- Random state transitions (Created → Funded_Locked → In_Transit → Completed)
- Random number of concurrent transactions (1-50)

**Oracle:** Query Squad_API for total Virtual_Account balance and compare with sum of Available_Balance and Locked_Balance

### Property 2: State Machine Validity

**Property:** FOR ALL state transitions, the Transaction_State_Machine SHALL only allow valid transitions and reject invalid ones

**Test Strategy:** Generate random state transition sequences and verify only valid transitions succeed.

**Input Space:**
- All possible state pairs (6 states × 6 states = 36 combinations)
- Valid transitions: Created→Funded_Locked, Funded_Locked→In_Transit, In_Transit→Completed, In_Transit→Disputed
- Invalid transitions: All other combinations

**Oracle:** Valid transitions succeed and update state; invalid transitions fail and preserve current state

### Property 3: Trust Score Monotonicity

**Property:** FOR ALL successful transactions without dispute, Trust_Score SHALL increase or remain constant (never decrease)

**Test Strategy:** Generate sequences of successful transactions and verify Trust_Score never decreases.

**Input Space:**
- Random number of successful transactions (1-100)
- Random transaction amounts
- No disputes

**Oracle:** Trust_Score after N successful transactions >= Trust_Score after N-1 successful transactions

### Property 4: Risk Score Consistency

**Property:** FOR ALL identical transaction inputs, AI_Risk_Engine SHALL return the same Risk_Score (deterministic)

**Test Strategy:** Send identical transaction data multiple times and verify Risk_Score consistency.

**Input Space:**
- Fixed transaction parameters (amount, velocity, device metadata, account age)
- Multiple requests (10-100 repetitions)

**Oracle:** Standard deviation of Risk_Score across repetitions < 0.01

### Property 5: Auto-Release Timing

**Property:** FOR ALL transactions in "In_Transit" state, Auto_Release SHALL occur exactly when inspection_window expires

**Test Strategy:** Create transactions with various inspection windows and verify Auto_Release timing.

**Input Space:**
- Random inspection windows (1-14 days)
- Random delivery dates
- Simulated time progression

**Oracle:** Transaction state changes to "Completed" at timestamp = delivery_date + inspection_window_days (within 1 second tolerance)

### Property 6: Fund Transfer Atomicity

**Property:** FOR ALL transaction completions, funds SHALL be transferred from holding account to seller OR remain in holding account (no partial transfers)

**Test Strategy:** Simulate Squad_API failures during fund transfer and verify atomicity.

**Input Space:**
- Random transaction amounts
- Random failure points (before transfer, during transfer, after transfer)
- Random retry attempts

**Oracle:** Either seller's Virtual_Account increases by transaction amount OR holding account retains full amount (no partial amounts)

### Property 7: Locked Balance Calculation

**Property:** FOR ALL users, Locked_Balance SHALL equal the sum of amounts in transactions where state is "Funded_Locked", "Awaiting_Fulfillment", or "In_Transit"

**Test Strategy:** Generate random transaction portfolios and verify Locked_Balance calculation.

**Input Space:**
- Random number of transactions (0-100)
- Random transaction states
- Random transaction amounts
- User as buyer or seller

**Oracle:** Locked_Balance = SUM(transaction.amount WHERE transaction.state IN ["Funded_Locked", "Awaiting_Fulfillment", "In_Transit"] AND (transaction.buyer_id = user.id OR transaction.seller_id = user.id))

### Property 8: Risk Verdict Threshold

**Property:** FOR ALL Risk_Score values, verdict SHALL be "fail" when Risk_Score > 80 and "pass" when Risk_Score <= 80

**Test Strategy:** Generate transactions with controlled Risk_Score values and verify verdict consistency.

**Input Space:**
- Risk_Score values from 1 to 100
- Various transaction parameters

**Oracle:** verdict = "fail" IFF Risk_Score > 80

### Property 9: Transaction ID Uniqueness

**Property:** FOR ALL generated Transaction_IDs, each SHALL be unique across all transactions

**Test Strategy:** Generate large number of transactions and verify no duplicate Transaction_IDs.

**Input Space:**
- Random transaction creation requests (1000-10000)
- Concurrent creation requests

**Oracle:** COUNT(DISTINCT transaction_id) = COUNT(transaction_id) in Turso_DB

### Property 10: Session Expiry

**Property:** FOR ALL sessions, access SHALL be denied after 24 hours of inactivity

**Test Strategy:** Create sessions with various inactivity periods and verify expiry behavior.

**Input Space:**
- Random inactivity periods (0-48 hours)
- Random activity patterns (active, inactive, intermittent)

**Oracle:** Session valid IFF (current_time - last_activity_time) < 24 hours

---

**Document Version:** 1.0  
**Created:** 2024  
**Workflow:** Requirements-First  
**Spec Type:** Feature
