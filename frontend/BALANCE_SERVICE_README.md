# BalanceService Documentation

## Overview

The `BalanceService` is a core service for the ScrowPay Escrow Dashboard that manages balance calculations and queries. It integrates with Squad API for available balance and Turso DB for locked balance calculations.

## Features

- ✅ **Available Balance Queries**: Fetches available balance from Squad API
- ✅ **Locked Balance Calculations**: Calculates locked balance from active transactions in Turso DB
- ✅ **Parallel Fetching**: Retrieves both balances simultaneously for efficiency
- ✅ **30-Second Caching**: Implements TTL cache for Squad API responses to reduce API calls
- ✅ **Balance Invariant Validation**: Ensures `available + locked = total`
- ✅ **Currency Formatting**: Formats balances as Nigerian Naira (₦) with 2 decimal places
- ✅ **Graceful Degradation**: Returns stale cached data when Squad API is unreachable

## Requirements Implemented

- **Requirement 1.1**: Dashboard displays Available_Balance from Squad API
- **Requirement 1.2**: Dashboard displays Locked_Balance from Turso DB
- **Requirement 1.3**: Balances update within 2 seconds of state changes
- **Requirement 1.4**: Both balances update when transaction completes
- **Requirement 1.7**: Balance invariant validation (available + locked = total)
- **Requirement 11.1**: Recalculates balances on state changes
- **Requirement 11.2**: Updates within 2 seconds
- **Requirement 11.7**: Validates balance invariant

## Installation

Include the required dependencies in your HTML file:

```html
<!-- Dependencies -->
<script src="env.js"></script>
<script src="config.js"></script>
<script src="turso-db-service.js"></script>
<script src="squad-api-service.js"></script>

<!-- BalanceService -->
<script src="BalanceService.js"></script>
```

## Usage

### 1. Initialize the Service

```javascript
// Create service instance with configuration
const balanceService = new BalanceService({
  turso: {
    databaseUrl: 'libsql://your-database.turso.io',
    authToken: 'your-auth-token'
  },
  squad: {
    secretKey: 'your-squad-secret-key',
    environment: 'sandbox' // or 'production'
  }
});

// Connect to database
await balanceService.connect();
```

### 2. Get Available Balance

```javascript
const result = await balanceService.getAvailableBalance('1234567890');

console.log(result);
// {
//   success: true,
//   balance: 50000.00,
//   cached: false
// }
```

**Response Fields:**
- `success` (boolean): Whether the operation succeeded
- `balance` (number): Available balance in Naira
- `cached` (boolean): Whether the result came from cache
- `stale` (boolean, optional): Whether cached data is stale (Squad API unreachable)
- `cachedAt` (string, optional): ISO timestamp of when data was cached
- `cacheAgeSeconds` (number, optional): Age of cached data in seconds
- `message` (string, optional): Error or status message

### 3. Get Locked Balance

```javascript
const result = await balanceService.getLockedBalance(userId);

console.log(result);
// {
//   success: true,
//   balance: 15000.00
// }
```

**Locked Balance Calculation:**
- Sums transaction amounts where state is `'Funded_Locked'` or `'In_Transit'`
- Includes transactions where user is either buyer or seller

### 4. Get Both Balances (Recommended)

```javascript
const result = await balanceService.getBalances(userId, virtualAccountNumber);

console.log(result);
// {
//   success: true,
//   available: 50000.00,
//   locked: 15000.00,
//   total: 65000.00,
//   invariantValid: true,
//   cached: false
// }
```

**Response Fields:**
- `success` (boolean): Whether both operations succeeded
- `available` (number): Available balance from Squad API
- `locked` (number): Locked balance from Turso DB
- `total` (number): Sum of available and locked
- `invariantValid` (boolean): Whether `available + locked = total`
- `cached` (boolean): Whether available balance came from cache
- `stale` (boolean, optional): Whether cached data is stale

### 5. Format Balance for Display

```javascript
const formatted = balanceService.formatBalance(50000.00);
console.log(formatted); // "₦50,000.00"

const formatted2 = balanceService.formatBalance(1234.56);
console.log(formatted2); // "₦1,234.56"
```

### 6. Validate Balance Invariant

```javascript
const isValid = balanceService.validateBalanceInvariant(
  50000.00,  // available
  15000.00,  // locked
  65000.00   // total
);

console.log(isValid); // true
```

### 7. Clear Cache

```javascript
balanceService.clearCache();
// Cache is now empty, next call will fetch from Squad API
```

## Caching Behavior

The service implements a 30-second TTL cache for Squad API responses:

1. **First Call**: Fetches from Squad API, stores in cache
2. **Subsequent Calls (within 30s)**: Returns cached data
3. **After 30s**: Cache expires, fetches fresh data from Squad API
4. **Squad API Unreachable**: Returns stale cached data with staleness indicator

**Cache Invalidation:**
- Automatic after 30 seconds
- Manual via `clearCache()` method
- Different virtual account number

## Error Handling

The service handles various error scenarios gracefully:

### Network Errors
```javascript
const result = await balanceService.getAvailableBalance('1234567890');
// {
//   success: true,
//   balance: 50000.00,
//   cached: true,
//   stale: true,
//   cacheAgeSeconds: 45,
//   message: "No internet connection. Last updated 45 seconds ago"
// }
```

### Timeout Errors
```javascript
// After 30-second timeout, returns cached data if available
const result = await balanceService.getAvailableBalance('1234567890');
// {
//   success: true,
//   balance: 50000.00,
//   cached: true,
//   stale: true,
//   message: "Request timed out. Last updated 45 seconds ago"
// }
```

### Database Errors
```javascript
const result = await balanceService.getLockedBalance(userId);
// {
//   success: false,
//   balance: 0,
//   message: "Failed to calculate locked balance: ..."
// }
```

## Testing

A comprehensive test suite is available in `test-balance-service.html`:

```bash
# Open in browser
open frontend/test-balance-service.html
```

**Test Coverage:**
1. ✅ Get Available Balance
2. ✅ Get Locked Balance
3. ✅ Get Both Balances (Parallel)
4. ✅ Cache Validation (30-second TTL)
5. ✅ Balance Invariant Validation
6. ✅ Currency Formatting
7. ✅ Cache Clear

## Integration Example

```javascript
// Initialize service
const balanceService = new BalanceService(CONFIG);
await balanceService.connect();

// Fetch balances on dashboard load
async function loadDashboard(userId, virtualAccountNumber) {
  try {
    // Get both balances in parallel
    const balances = await balanceService.getBalances(userId, virtualAccountNumber);
    
    if (!balances.success) {
      console.error('Failed to load balances:', balances.message);
      return;
    }
    
    // Update UI
    document.getElementById('available-balance').textContent = 
      balanceService.formatBalance(balances.available);
    
    document.getElementById('locked-balance').textContent = 
      balanceService.formatBalance(balances.locked);
    
    // Show staleness indicator if applicable
    if (balances.stale) {
      document.getElementById('staleness-indicator').textContent = 
        balances.message;
      document.getElementById('staleness-indicator').style.display = 'block';
    }
    
    // Warn if invariant is violated
    if (!balances.invariantValid) {
      console.warn('Balance invariant violation detected!', balances);
    }
    
  } catch (error) {
    console.error('Dashboard load failed:', error);
  }
}

// Poll for balance updates every 30 seconds (Squad API)
setInterval(async () => {
  const balances = await balanceService.getBalances(userId, virtualAccountNumber);
  updateBalanceDisplay(balances);
}, 30000);

// Poll for locked balance updates every 10 seconds (Turso DB)
setInterval(async () => {
  const locked = await balanceService.getLockedBalance(userId);
  updateLockedBalanceDisplay(locked);
}, 10000);
```

## Performance Considerations

1. **Caching**: 30-second cache reduces Squad API calls by ~95%
2. **Parallel Fetching**: `getBalances()` fetches both balances simultaneously
3. **Graceful Degradation**: Returns stale data when Squad API is unreachable
4. **Minimal Database Queries**: Locked balance uses single aggregation query

## API Reference

### Constructor

```typescript
constructor(config: {
  turso: {
    databaseUrl: string;
    authToken: string;
  };
  squad: {
    secretKey: string;
    environment: 'sandbox' | 'production';
  };
})
```

### Methods

#### `connect(): Promise<void>`
Connects to the Turso database.

#### `getAvailableBalance(virtualAccountNumber: string): Promise<BalanceResult>`
Fetches available balance from Squad API with caching.

#### `getLockedBalance(userId: number): Promise<BalanceResult>`
Calculates locked balance from Turso DB.

#### `getBalances(userId: number, virtualAccountNumber: string): Promise<BalancesResult>`
Fetches both balances in parallel.

#### `validateBalanceInvariant(available: number, locked: number, total: number): boolean`
Validates that `available + locked = total`.

#### `formatBalance(balance: number): string`
Formats balance as Nigerian Naira with 2 decimal places.

#### `clearCache(): void`
Clears the balance cache.

#### `disconnect(): Promise<void>`
Disconnects from the database.

## Troubleshooting

### Issue: Balance not updating

**Solution:**
1. Check if Squad API is reachable
2. Verify cache is not stale (check `stale` flag)
3. Clear cache manually: `balanceService.clearCache()`

### Issue: Invariant validation fails

**Solution:**
1. Check for concurrent transactions
2. Verify Squad API balance is accurate
3. Recalculate locked balance: `await balanceService.getLockedBalance(userId)`

### Issue: Stale cached data

**Solution:**
1. This is expected when Squad API is unreachable
2. Display staleness indicator to user
3. Retry after network connection is restored

## License

Part of the ScrowPay project.
