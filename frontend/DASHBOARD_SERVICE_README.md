# DashboardService Documentation

## Overview

The `DashboardService` is the main orchestrator for the ScrowPay Escrow Dashboard. It coordinates all dashboard operations by managing five core services and providing a unified interface for the UI layer.

## Architecture

```
DashboardService (Orchestrator)
├── TransactionService (Transaction CRUD)
├── BalanceService (Balance calculations)
├── TrustScoreService (Reputation management)
├── StateMachineService (State transitions)
└── AIRiskService (Risk scoring) [Optional]
```

## Core Responsibilities

1. **Service Coordination**: Manages all five core services
2. **User Initialization**: Loads user data and initializes dashboard state
3. **Real-Time Updates**: Polls Squad API (30s) and Turso DB (10s) for updates
4. **Balance Management**: Refreshes available and locked balances
5. **Transaction Management**: Refreshes active transaction lists
6. **Trust Score Management**: Refreshes and recalculates trust scores
7. **Optimistic UI Updates**: Updates UI immediately before backend confirmation
8. **Event Emission**: Dispatches custom events for UI updates

## Configuration

```javascript
const config = {
  turso: {
    databaseUrl: 'https://your-database.turso.io',
    authToken: 'your-auth-token'
  },
  squad: {
    secretKey: 'your-squad-secret-key',
    environment: 'sandbox' // or 'production'
  },
  holdingAccount: '1234567890', // Central holding account number
  aiEngine: { // Optional
    url: 'http://localhost:5000/api/v1'
  }
};

const dashboardService = new DashboardService(config);
```

## API Reference

### Initialization

#### `initialize(userId)`

Initializes the dashboard with user data and starts polling.

**Parameters:**
- `userId` (number): User ID to initialize dashboard for

**Returns:** `Promise<Object>`
```javascript
{
  success: boolean,
  userData: {
    id: number,
    first_name: string,
    last_name: string,
    phone_number: string,
    virtual_account_number: string,
    // ... other user fields
  },
  message?: string // Error message if success is false
}
```

**Example:**
```javascript
const result = await dashboardService.initialize(1);
if (result.success) {
  console.log('Dashboard initialized for:', result.userData.first_name);
}
```

### Balance Operations

#### `refreshBalances()`

Refreshes both available and locked balances.

**Returns:** `Promise<Object>`
```javascript
{
  success: boolean,
  balances: {
    available: number,
    locked: number,
    total: number,
    invariantValid: boolean,
    cached: boolean,
    stale: boolean
  },
  message?: string
}
```

**Example:**
```javascript
const result = await dashboardService.refreshBalances();
console.log('Available:', result.balances.available);
console.log('Locked:', result.balances.locked);
```

### Transaction Operations

#### `refreshTransactions()`

Refreshes active transaction lists categorized by state.

**Returns:** `Promise<Object>`
```javascript
{
  success: boolean,
  transactions: {
    awaitingFunding: Array<Transaction>,
    funded: Array<Transaction>,
    inTransit: Array<Transaction>,
    disputed: Array<Transaction>
  },
  message?: string
}
```

#### `createTransaction(transactionData)`

Creates a new transaction (seller action).

**Parameters:**
- `transactionData` (Object):
  ```javascript
  {
    itemDescription: string,
    price: number,
    deliveryTimelineDays: number,
    inspectionWindowDays: number
  }
  ```

**Returns:** `Promise<Object>`
```javascript
{
  success: boolean,
  transaction: {
    transaction_id: string,
    seller_id: number,
    state: 'Created',
    // ... other transaction fields
  },
  message?: string
}
```

**Example:**
```javascript
const result = await dashboardService.createTransaction({
  itemDescription: 'iPhone 13 Pro Max',
  price: 450000,
  deliveryTimelineDays: 7,
  inspectionWindowDays: 3
});

if (result.success) {
  console.log('Transaction created:', result.transaction.transaction_id);
}
```

#### `fundTransaction(transactionId, metadata)`

Funds a transaction (buyer action).

**Parameters:**
- `transactionId` (string): Transaction ID to fund
- `metadata` (Object): Additional metadata (e.g., `{ buyerAccount: '1234567890' }`)

**Returns:** `Promise<Object>`
```javascript
{
  success: boolean,
  newState: string,
  message?: string
}
```

#### `markAsShipped(transactionId)`

Marks transaction as shipped (seller action).

**Parameters:**
- `transactionId` (string): Transaction ID

**Returns:** `Promise<Object>`

#### `acceptDelivery(transactionId)`

Accepts delivered item (buyer action).

**Parameters:**
- `transactionId` (string): Transaction ID

**Returns:** `Promise<Object>`

#### `disputeTransaction(transactionId, disputeData)`

Disputes a transaction (buyer action).

**Parameters:**
- `transactionId` (string): Transaction ID
- `disputeData` (Object): Dispute details
  ```javascript
  {
    description: string,
    photos: Array<string>, // Photo URLs
    // ... other dispute fields
  }
  ```

**Returns:** `Promise<Object>`

#### `getTransaction(transactionId)`

Gets transaction details.

**Parameters:**
- `transactionId` (string): Transaction ID

**Returns:** `Promise<Object>`
```javascript
{
  success: boolean,
  transaction: Object,
  message?: string
}
```

#### `getTransactionHistory(filters)`

Gets transaction history with filters and pagination.

**Parameters:**
- `filters` (Object):
  ```javascript
  {
    dateFrom?: string,      // ISO date string
    dateTo?: string,        // ISO date string
    state?: string,         // Transaction state
    role?: string,          // 'buyer' or 'seller'
    sortBy?: string,        // 'created_at', 'price', 'state'
    sortOrder?: string,     // 'ASC' or 'DESC'
    page?: number,          // Page number (default: 1)
    pageSize?: number       // Items per page (default: 20)
  }
  ```

**Returns:** `Promise<Object>`
```javascript
{
  success: boolean,
  history: {
    transactions: Array<Transaction>,
    totalCount: number,
    page: number,
    pageSize: number,
    totalPages: number
  },
  message?: string
}
```

### Trust Score Operations

#### `refreshTrustScore()`

Refreshes trust score display.

**Returns:** `Promise<Object>`
```javascript
{
  success: boolean,
  trustScore: {
    score: number,
    indicator: {
      color: string,
      label: string,
      class: string,
      textColor: string
    },
    totalTransactions: number,
    successfulTransactions: number,
    cached: boolean
  },
  message?: string
}
```

#### `recalculateTrustScore()`

Recalculates trust score for the current user.

**Returns:** `Promise<Object>`

### Polling Operations

#### `startPolling()`

Starts polling for real-time updates.

**Polling Intervals:**
- Squad API: 30 seconds (balance updates)
- Turso DB: 10 seconds (transaction updates)

**Returns:** `void`

**Example:**
```javascript
dashboardService.startPolling();
```

#### `stopPolling()`

Stops polling for cleanup.

**Returns:** `void`

**Example:**
```javascript
dashboardService.stopPolling();
```

### Cleanup

#### `cleanup()`

Cleans up resources and disconnects all services.

**Returns:** `Promise<void>`

**Example:**
```javascript
await dashboardService.cleanup();
```

## Event System

The DashboardService emits custom events for UI updates. Listen for these events to update the UI in real-time.

### Event: `dashboardUpdate`

**Event Detail:**
```javascript
{
  type: string,        // 'balancesUpdated' or 'transactionsUpdated'
  data: Object,        // Updated data
  timestamp: string    // ISO timestamp
}
```

**Example:**
```javascript
window.addEventListener('dashboardUpdate', (event) => {
  const { type, data, timestamp } = event.detail;
  
  if (type === 'balancesUpdated') {
    updateBalanceDisplay(data);
  } else if (type === 'transactionsUpdated') {
    updateTransactionList(data);
  }
});
```

## Polling Behavior

### Squad API Polling (30 seconds)

- Clears balance cache to force fresh fetch
- Updates available balance from Squad API
- Emits `balancesUpdated` event
- Continues on error (graceful degradation)

### Turso DB Polling (10 seconds)

- Refreshes active transaction lists
- Emits `transactionsUpdated` event
- Also refreshes locked balance (since transactions changed)
- Emits `balancesUpdated` event if balance changed
- Continues on error (graceful degradation)

## Optimistic UI Updates

The DashboardService implements optimistic UI updates for better user experience:

1. **Transaction Creation**: Refreshes transaction list immediately after creation
2. **Transaction Funding**: Refreshes balances and transactions immediately after funding
3. **Transaction Completion**: Refreshes balances, transactions, and trust score immediately

## Error Handling

All methods return a result object with `success` boolean and optional `message` string:

```javascript
const result = await dashboardService.someMethod();

if (result.success) {
  // Handle success
  console.log('Success:', result.data);
} else {
  // Handle error
  console.error('Error:', result.message);
}
```

## Requirements Mapping

| Requirement | Implementation |
|-------------|----------------|
| 1.1 | `refreshBalances()` - Available balance from Squad API |
| 1.3 | `refreshBalances()` - Locked balance from Turso DB |
| 1.4 | Balance invariant validation in `refreshBalances()` |
| 2.1 | `refreshTrustScore()` - Trust score calculation |
| 2.3 | `refreshTrustScore()` - Trust score recalculation on completion |
| 2.4 | `acceptDelivery()` - Refreshes trust score after completion |
| 8.1 | `refreshTransactions()` - Active transactions retrieval |
| 8.4 | Polling updates transaction list within 2 seconds |
| 11.3 | Squad API polling every 30 seconds |
| 11.4 | Turso DB polling every 10 seconds |
| 11.5 | Optimistic UI updates for user actions |

## Testing

Run the test suite by opening `test-dashboard-service.html` in a browser:

```bash
# Start local server
cd frontend
python -m http.server 8000

# Open in browser
http://localhost:8000/test-dashboard-service.html
```

### Test Coverage

- ✅ Dashboard initialization
- ✅ Balance refresh
- ✅ Transaction refresh
- ✅ Trust score refresh
- ✅ Polling mechanism
- ✅ Transaction actions (create, fund, ship, accept, dispute)
- ✅ Transaction history
- ✅ Event emission
- ✅ Cleanup

## Best Practices

1. **Always initialize before use:**
   ```javascript
   await dashboardService.initialize(userId);
   ```

2. **Listen for events:**
   ```javascript
   window.addEventListener('dashboardUpdate', handleUpdate);
   ```

3. **Clean up on page unload:**
   ```javascript
   window.addEventListener('beforeunload', async () => {
     await dashboardService.cleanup();
   });
   ```

4. **Handle errors gracefully:**
   ```javascript
   const result = await dashboardService.someMethod();
   if (!result.success) {
     showErrorMessage(result.message);
   }
   ```

5. **Use optimistic updates:**
   ```javascript
   // UI updates immediately, then syncs with backend
   await dashboardService.createTransaction(data);
   ```

## Common Patterns

### Initialize and Display Dashboard

```javascript
async function loadDashboard(userId) {
  const dashboardService = new DashboardService(config);
  
  // Initialize
  const initResult = await dashboardService.initialize(userId);
  if (!initResult.success) {
    showError(initResult.message);
    return;
  }
  
  // Display user info
  displayUserInfo(initResult.userData);
  
  // Listen for updates
  window.addEventListener('dashboardUpdate', (event) => {
    const { type, data } = event.detail;
    
    if (type === 'balancesUpdated') {
      updateBalanceDisplay(data);
    } else if (type === 'transactionsUpdated') {
      updateTransactionList(data);
    }
  });
  
  // Clean up on page unload
  window.addEventListener('beforeunload', async () => {
    await dashboardService.cleanup();
  });
}
```

### Create and Fund Transaction

```javascript
async function createAndFundTransaction() {
  // Seller creates transaction
  const createResult = await dashboardService.createTransaction({
    itemDescription: 'iPhone 13 Pro Max',
    price: 450000,
    deliveryTimelineDays: 7,
    inspectionWindowDays: 3
  });
  
  if (!createResult.success) {
    showError(createResult.message);
    return;
  }
  
  const transactionId = createResult.transaction.transaction_id;
  console.log('Transaction created:', transactionId);
  
  // Buyer funds transaction
  const fundResult = await dashboardService.fundTransaction(transactionId, {
    buyerAccount: '1234567890'
  });
  
  if (fundResult.success) {
    console.log('Transaction funded, new state:', fundResult.newState);
  }
}
```

### Complete Transaction Flow

```javascript
async function completeTransactionFlow(transactionId) {
  // Seller marks as shipped
  const shipResult = await dashboardService.markAsShipped(transactionId);
  if (!shipResult.success) {
    showError(shipResult.message);
    return;
  }
  
  console.log('Transaction shipped');
  
  // Wait for delivery...
  
  // Buyer accepts delivery
  const acceptResult = await dashboardService.acceptDelivery(transactionId);
  if (acceptResult.success) {
    console.log('Transaction completed!');
    // Trust score is automatically refreshed
  }
}
```

## Troubleshooting

### Polling not working

- Check that `initialize()` was called successfully
- Verify `isPolling` is `true`
- Check browser console for polling errors

### Balance invariant violation

- Check Squad API balance matches expected total
- Verify locked balance calculation is correct
- Review transaction states in database

### Events not firing

- Ensure event listener is registered before polling starts
- Check that polling is active
- Verify data is actually changing

### Services not connecting

- Check Turso DB credentials
- Verify Squad API credentials
- Check network connectivity

## License

Part of the ScrowPay Escrow Dashboard project.
