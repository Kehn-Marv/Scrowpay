# Security Event Logging - Developer Guide

## Quick Start

Security event logging is automatically integrated into the Escrow Dashboard. This guide explains how to use the security logging system.

## Overview

The security logging system tracks security-relevant events with automatic data redaction to protect sensitive information.

**Requirement:** 19.7 - Log security-relevant events (failed risk checks, blocked transactions, rate limit violations)

## Automatic Logging

The following events are **automatically logged** without any additional code:

### 1. Failed Risk Checks
**When:** AI risk scoring returns verdict="fail"  
**Where:** `AIRiskService.scoreTransaction()`  
**No action required** - Logging happens automatically

### 2. Blocked Transactions
**When:** Transaction is blocked due to high risk  
**Where:** `dashboard.html` - Fund Escrow flow  
**No action required** - Logging happens automatically

### 3. Rate Limit Violations
**When:** User exceeds 10 transactions per hour  
**Where:** `TransactionService.createTransaction()`  
**No action required** - Logging happens automatically

## Manual Logging

If you need to log additional security events, use the `SecurityLogger` class:

### Setup

```javascript
// Initialize SecurityLogger
const securityLogger = new SecurityLogger(tursoDbService);
```

### Log a Failed Risk Check

```javascript
await securityLogger.logFailedRiskCheck(
  userId,           // User ID
  transactionId,    // Transaction ID (or null)
  riskScore,        // Risk score (1-100)
  anomalyIndicators // Array of strings
);
```

### Log a Blocked Transaction

```javascript
await securityLogger.logBlockedTransaction(
  userId,           // User ID
  transactionId,    // Transaction ID
  reason,           // Reason for blocking (string)
  {                 // Additional details (optional)
    risk_score: 95,
    amount: 5000000  // Will be automatically redacted
  }
);
```

### Log a Rate Limit Violation

```javascript
await securityLogger.logRateLimitViolation(
  userId,           // User ID
  currentCount,     // Current transaction count
  limitThreshold,   // Rate limit (e.g., 10)
  resetTime         // Date object
);
```

### Log an Invalid State Transition

```javascript
await securityLogger.logInvalidStateTransition(
  userId,           // User ID
  transactionId,    // Transaction ID
  fromState,        // Current state
  toState           // Attempted state
);
```

### Log Unauthorized Access

```javascript
await securityLogger.logUnauthorizedAccess(
  userId,           // User ID
  resource,         // Resource being accessed (e.g., "transaction")
  action            // Action attempted (e.g., "update")
);
```

## Data Redaction

The `SecurityLogger` automatically redacts sensitive data before logging:

### What Gets Redacted

| Data Type | Example Input | Redacted Output |
|-----------|---------------|-----------------|
| Phone Number | `+2348012345678` | `+234****5678` |
| Amount | `50000` | `₦***` |
| BVN | `12345678901` | `****` |
| PIN | `1234` | `****` |
| Account Number | `1234567890` | `****7890` |

### What Stays Visible

- User IDs
- Transaction IDs
- Timestamps
- Risk scores
- Anomaly indicators
- State names
- Event types

### Manual Redaction

If you need to redact data manually:

```javascript
const securityLogger = new SecurityLogger(tursoDbService);

// Redact a phone number
const masked = securityLogger.maskPhoneNumber('+2348012345678');
// Result: '+234****5678'

// Redact an amount
const maskedAmount = securityLogger.maskAmount(50000);
// Result: '₦***'

// Redact an entire object
const redacted = securityLogger.redactSensitiveData({
  phone_number: '+2348012345678',
  amount: 50000,
  safe_field: 'This is not redacted'
});
// Result: { phone_number: '+234****5678', amount: '₦***', safe_field: 'This is not redacted' }
```

## Querying Security Logs

### Get Recent Security Events

```javascript
const sql = `
  SELECT * FROM security_logs 
  ORDER BY created_at DESC 
  LIMIT 20
`;

const result = await tursoDbService._executeHttp(sql, []);
```

### Get Events by Type

```javascript
const sql = `
  SELECT * FROM security_logs 
  WHERE event_type = ? 
  ORDER BY created_at DESC
`;

const result = await tursoDbService._executeHttp(sql, ['failed_risk_check']);
```

### Get Events by User

```javascript
const sql = `
  SELECT * FROM security_logs 
  WHERE user_id = ? 
  ORDER BY created_at DESC
`;

const result = await tursoDbService._executeHttp(sql, [userId]);
```

### Count Events by Type (Last 24 Hours)

```javascript
const sql = `
  SELECT event_type, COUNT(*) as count
  FROM security_logs
  WHERE created_at >= datetime('now', '-24 hours')
  GROUP BY event_type
`;

const result = await tursoDbService._executeHttp(sql, []);
```

## Event Types

The following event types are supported:

| Event Type | Description | Auto-Logged |
|------------|-------------|-------------|
| `failed_risk_check` | AI risk scoring failed | ✅ Yes |
| `blocked_transaction` | Transaction blocked due to risk | ✅ Yes |
| `rate_limit_violation` | User exceeded rate limit | ✅ Yes |
| `invalid_state_transition` | Invalid state transition attempt | ❌ No |
| `unauthorized_access` | Unauthorized access attempt | ❌ No |

## Database Schema

```sql
CREATE TABLE security_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  transaction_id TEXT,
  details TEXT,              -- JSON string with redacted data
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Testing

Run the test suite to verify security logging:

1. Open `frontend/test-security-logging.html` in your browser
2. Run all tests to verify:
   - Failed risk check logging
   - Blocked transaction logging
   - Data redaction
   - Query functionality
   - Rate limit logging

## Best Practices

### DO ✅

- Let automatic logging handle common security events
- Use `SecurityLogger` for custom security events
- Trust the automatic redaction system
- Log security events even if the main operation fails
- Include relevant context in the `details` field

### DON'T ❌

- Don't log sensitive data directly (use SecurityLogger)
- Don't throw errors if logging fails (it's non-blocking)
- Don't log non-security events to security_logs
- Don't bypass the redaction system
- Don't store raw passwords, PINs, or BVNs

## Error Handling

Security logging is **non-blocking** - if logging fails, it won't break your main flow:

```javascript
try {
  await securityLogger.logBlockedTransaction(...);
} catch (error) {
  // Error is logged to console but not thrown
  // Your main code continues to execute
}
```

## Monitoring

### Security Dashboard Queries

**High-Risk Users (Multiple Failed Risk Checks)**
```sql
SELECT user_id, COUNT(*) as failed_checks
FROM security_logs
WHERE event_type = 'failed_risk_check'
AND created_at >= datetime('now', '-7 days')
GROUP BY user_id
HAVING failed_checks > 3
ORDER BY failed_checks DESC;
```

**Recent Blocked Transactions**
```sql
SELECT sl.*, u.first_name, u.last_name, u.phone_number
FROM security_logs sl
JOIN users u ON sl.user_id = u.id
WHERE sl.event_type = 'blocked_transaction'
ORDER BY sl.created_at DESC
LIMIT 20;
```

**Security Events Timeline**
```sql
SELECT 
  strftime('%Y-%m-%d %H:00', created_at) as hour,
  event_type,
  COUNT(*) as events
FROM security_logs
WHERE created_at >= datetime('now', '-24 hours')
GROUP BY hour, event_type
ORDER BY hour DESC;
```

## Files

- `frontend/security-logger.js` - SecurityLogger class
- `frontend/AIRiskService.js` - Auto-logs failed risk checks
- `frontend/dashboard.html` - Auto-logs blocked transactions
- `frontend/transaction-service.js` - Auto-logs rate limit violations
- `frontend/test-security-logging.html` - Test suite
- `frontend/TASK_13.4_SUMMARY.md` - Detailed implementation summary

## Support

For questions or issues:
1. Check `TASK_13.4_SUMMARY.md` for detailed implementation info
2. Run `test-security-logging.html` to verify functionality
3. Check browser console for logging messages

## Example: Complete Integration

```javascript
// Initialize services
const tursoDbService = new TursoDBService(CONFIG.turso.url, CONFIG.turso.token);
await tursoDbService.connect();

const securityLogger = new SecurityLogger(tursoDbService);

// Example: Log a custom security event
try {
  // Your security-sensitive operation
  const result = await performSensitiveOperation();
  
  if (!result.success) {
    // Log the security event
    await securityLogger.logUnauthorizedAccess(
      userId,
      'sensitive_resource',
      'update'
    );
    
    // Handle the failure
    showErrorNotification('Access denied');
  }
} catch (error) {
  console.error('Operation failed:', error);
}
```

## Compliance

This implementation satisfies:
- ✅ Requirement 19.7: Log security-relevant events
- ✅ Data protection: Sensitive data is redacted
- ✅ Audit trail: All events are timestamped and traceable
- ✅ Non-blocking: Logging failures don't break main flow
- ✅ Comprehensive: Covers all required event types

---

**Last Updated:** Task 13.4 Implementation  
**Version:** 1.0
