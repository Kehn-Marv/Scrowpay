# Rate Limiting Implementation

## Overview

This document describes the rate limiting implementation for transaction creation in the ScrowPay Escrow Dashboard.

**Requirement:** 19.6 - Security and Data Protection

## Specification

- **Limit:** 10 transactions per hour per user
- **Scope:** Per user (seller_id)
- **Window:** Rolling 1-hour window
- **Action on Violation:** Block transaction creation and log security event

## Implementation Details

### Database Schema

A new `security_logs` table has been added to track security-relevant events:

```sql
CREATE TABLE IF NOT EXISTS security_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL CHECK(event_type IN (
    'rate_limit_violation',
    'blocked_transaction',
    'failed_risk_check',
    'invalid_state_transition',
    'unauthorized_access'
  )),
  user_id INTEGER NOT NULL,
  transaction_id TEXT,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id)
);
```

### TransactionService Changes

Two new methods have been added to `TransactionService`:

#### 1. `checkRateLimit(userId)`

Checks if a user has exceeded the rate limit for transaction creation.

**Parameters:**
- `userId` (number): User ID to check

**Returns:**
```javascript
{
  allowed: boolean,      // Whether the user can create more transactions
  count: number,         // Number of transactions created in the last hour
  limit: number,         // Maximum allowed (10)
  resetTime: Date        // When the rate limit will reset
}
```

**Implementation:**
- Queries the `transactions` table for transactions created by the user in the last hour
- Compares count against the limit (10)
- Returns detailed information for error messaging

#### 2. `logSecurityEvent(event)`

Logs a security event to the `security_logs` table.

**Parameters:**
```javascript
{
  eventType: string,        // Type of security event
  userId: number,           // User ID
  transactionId: string,    // Transaction ID (optional)
  details: string,          // Additional details (optional)
  ipAddress: string,        // IP address (optional)
  userAgent: string         // User agent (optional)
}
```

**Event Types:**
- `rate_limit_violation`: User exceeded transaction creation rate limit
- `blocked_transaction`: Transaction blocked by AI risk engine
- `failed_risk_check`: AI risk check failed
- `invalid_state_transition`: Attempted invalid state transition
- `unauthorized_access`: Unauthorized access attempt

### Modified `createTransaction()` Flow

The transaction creation flow now includes rate limiting:

```javascript
async createTransaction(data) {
  // 1. Connect to database
  await this.connect();
  
  // 2. Check rate limit (NEW)
  const rateLimitCheck = await this.checkRateLimit(data.sellerId);
  
  if (!rateLimitCheck.allowed) {
    // Log violation
    await this.logSecurityEvent({
      eventType: 'rate_limit_violation',
      userId: data.sellerId,
      details: JSON.stringify({
        count: rateLimitCheck.count,
        limit: rateLimitCheck.limit,
        resetTime: rateLimitCheck.resetTime.toISOString()
      })
    });
    
    // Throw error with clear message
    throw new Error(
      `Rate limit exceeded. You have created ${rateLimitCheck.count} transactions in the last hour. ` +
      `The limit is ${rateLimitCheck.limit} transactions per hour. ` +
      `Please try again after ${resetTimeFormatted}.`
    );
  }
  
  // 3. Validate input data
  const validationErrors = this.validateTransactionData(data);
  if (validationErrors.length > 0) {
    throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
  }
  
  // 4. Generate transaction ID and save to database
  // ... (existing code)
}
```

## Error Messages

When a user exceeds the rate limit, they receive a clear, actionable error message:

```
Rate limit exceeded. You have created 10 transactions in the last hour. 
The limit is 10 transactions per hour. 
Please try again after 3:45 PM.
```

The error message includes:
- Current transaction count
- Rate limit value
- Time when the limit will reset

## Security Logging

All rate limit violations are logged to the `security_logs` table with:
- Event type: `rate_limit_violation`
- User ID
- Transaction count and limit
- Reset time
- User agent (browser information)
- Timestamp

This provides an audit trail for security monitoring and analysis.

## Testing

### Unit Tests

Unit tests are provided in `transaction-service-rate-limit.test.js`:

1. **Test 1:** Allow transactions within rate limit (9 transactions)
2. **Test 2:** Block 11th transaction (rate limit exceeded)
3. **Test 3:** Verify error message contains clear information
4. **Test 4:** Verify security event logging for rate limit violations
5. **Test 5:** Different users have separate rate limits
6. **Test 6:** Rate limit check returns correct information

### Browser Tests

An interactive test page is available at `test-rate-limiting.html` that can be opened in a browser to verify the implementation.

### Running Tests

**Node.js:**
```bash
node frontend/transaction-service-rate-limit.test.js
```

**Browser:**
Open `frontend/test-rate-limiting.html` in a web browser and click "Run All Tests".

## Usage Example

```javascript
// Initialize service
const transactionService = new TransactionService({
  turso: {
    databaseUrl: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  }
});

// Create transaction (with rate limiting)
try {
  const transaction = await transactionService.createTransaction({
    sellerId: 123,
    itemDescription: 'MacBook Pro 16-inch',
    price: 2500000,
    deliveryTimelineDays: 7,
    inspectionWindowDays: 3
  });
  
  console.log('Transaction created:', transaction.transaction_id);
  
} catch (error) {
  if (error.message.includes('Rate limit exceeded')) {
    // Handle rate limit error
    showErrorNotification(error.message);
  } else {
    // Handle other errors
    console.error('Transaction creation failed:', error);
  }
}
```

## Performance Considerations

### Query Optimization

The rate limit check uses an indexed query:

```sql
SELECT COUNT(*) as count 
FROM transactions 
WHERE seller_id = ? AND created_at >= ?
```

The `idx_seller_id` and `idx_created_at` indexes ensure this query is fast even with large transaction volumes.

### Caching

For high-traffic scenarios, consider caching rate limit counts in memory (e.g., Redis) to reduce database queries. The current implementation queries the database on every transaction creation for accuracy.

### Fail-Open Strategy

If the rate limit check fails due to database errors, the system allows the transaction (fail-open) to maintain availability. This is logged for monitoring:

```javascript
catch (error) {
  console.error('[TransactionService] Rate limit check failed:', error);
  // On error, allow the transaction (fail open for better UX)
  return {
    allowed: true,
    count: 0,
    limit: 10,
    resetTime: new Date(Date.now() + 60 * 60 * 1000)
  };
}
```

## Future Enhancements

1. **Configurable Limits:** Make rate limits configurable per user tier (e.g., premium users get higher limits)
2. **IP-Based Rate Limiting:** Add IP-based rate limiting for additional security
3. **Distributed Rate Limiting:** Use Redis for distributed rate limiting across multiple servers
4. **Rate Limit Headers:** Return rate limit information in API response headers
5. **Gradual Backoff:** Implement exponential backoff for repeated violations
6. **Admin Override:** Allow administrators to bypass or adjust rate limits for specific users

## Monitoring

Monitor the `security_logs` table for rate limit violations:

```sql
-- Count rate limit violations by user
SELECT user_id, COUNT(*) as violation_count
FROM security_logs
WHERE event_type = 'rate_limit_violation'
AND created_at >= datetime('now', '-24 hours')
GROUP BY user_id
ORDER BY violation_count DESC;

-- Recent rate limit violations
SELECT sl.*, u.first_name, u.last_name, u.phone_number
FROM security_logs sl
JOIN users u ON sl.user_id = u.id
WHERE sl.event_type = 'rate_limit_violation'
ORDER BY sl.created_at DESC
LIMIT 50;
```

## Compliance

This implementation helps meet security requirements:
- **Requirement 19.6:** Rate-limit transaction creation to 10 per hour per user
- **Requirement 19.7:** Log all security-relevant events to database

The rate limiting prevents abuse and protects the platform from:
- Spam transactions
- Automated attacks
- Resource exhaustion
- Database overload
