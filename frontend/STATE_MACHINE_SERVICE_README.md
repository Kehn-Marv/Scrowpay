# StateMachineService Documentation

## Overview

The `StateMachineService` manages the transaction lifecycle for the ScrowPay Escrow Dashboard. It enforces valid state transitions, validates user permissions, executes state-specific actions (fund transfers, timestamps), manages auto-release timers, and maintains a complete audit trail of all state changes.

## Features

- ✅ **Valid State Transition Enforcement** - Only allows predefined valid transitions
- ✅ **User Permission Validation** - Ensures only authorized users can perform state changes
- ✅ **State-Specific Actions** - Executes fund transfers and updates timestamps automatically
- ✅ **Auto-Release Timer Management** - Schedules automatic fund release after inspection window
- ✅ **State History Recording** - Maintains complete audit trail in database
- ✅ **Exponential Backoff Retry** - Retries failed Squad API calls with exponential backoff
- ✅ **Comprehensive Error Handling** - Detailed logging and error messages
- ✅ **JSDoc Documentation** - Complete inline documentation for all methods

## State Machine Diagram

```
Created
   ↓ (Buyer funds after AI pass)
Funded_Locked
   ↓ (Seller marks as shipped)
In_Transit
   ↓ (Buyer accepts OR auto-release timer expires)
   ↓ (Buyer disputes)
Completed / Disputed
   ↓ (Dispute resolved)
Completed
```

## Valid State Transitions

| From State     | To State      | Trigger                          | Permission Required |
|----------------|---------------|----------------------------------|---------------------|
| Created        | Funded_Locked | Buyer funds escrow               | Non-seller user     |
| Funded_Locked  | In_Transit    | Seller marks as shipped          | Seller only         |
| In_Transit     | Completed     | Buyer accepts OR timer expires   | Buyer or system     |
| In_Transit     | Disputed      | Buyer disputes delivery          | Buyer only          |
| Disputed       | Completed     | Dispute resolved                 | System              |

## Installation

Include the service in your HTML file:

```html
<!-- Dependencies -->
<script src="turso-db-service.js"></script>
<script src="squad-api-service.js"></script>

<!-- StateMachineService -->
<script src="StateMachineService.js"></script>
```

## Configuration

```javascript
const stateMachineService = new StateMachineService({
  turso: {
    databaseUrl: 'libsql://your-database.turso.io',
    authToken: 'your_auth_token'
  },
  squad: {
    secretKey: 'your_squad_secret_key',
    environment: 'sandbox' // or 'production'
  },
  holdingAccount: 'HOLDING_ACCOUNT_NUMBER'
});
```

## Usage Examples

### 1. Transition Transaction State

```javascript
// Buyer funds transaction (Created → Funded_Locked)
const result = await stateMachineService.transitionState(
  'TXN-abc123',           // transactionId
  'Funded_Locked',        // newState
  buyerId,                // userId
  {
    buyerAccount: '1234567890',  // buyer's virtual account
    aiVerdict: 'pass',
    riskScore: 25
  }
);

if (result.success) {
  console.log('Transaction funded successfully');
  console.log('Previous state:', result.previousState);
  console.log('New state:', result.newState);
} else {
  console.error('Transition failed:', result.message);
}
```

### 2. Check if Transition is Valid

```javascript
const isValid = stateMachineService.isValidTransition('Created', 'Funded_Locked');
console.log('Transition valid:', isValid); // true

const isInvalid = stateMachineService.isValidTransition('Created', 'Completed');
console.log('Transition valid:', isInvalid); // false
```

### 3. Get State History

```javascript
const history = await stateMachineService.getStateHistory('TXN-abc123');

history.forEach(entry => {
  console.log(`${entry.from_state} → ${entry.to_state}`);
  console.log(`Changed by: User ${entry.changed_by}`);
  console.log(`Changed at: ${entry.changed_at}`);
  console.log(`Notes: ${entry.notes}`);
});
```

### 4. Schedule Auto-Release

```javascript
// Auto-release is scheduled automatically when transitioning to In_Transit
// But you can also schedule manually:

const transaction = {
  transaction_id: 'TXN-abc123',
  shipped_at: '2024-01-15T10:00:00Z',
  inspection_window_days: 7
};

stateMachineService.scheduleAutoRelease(transaction);
// Timer will fire after 7 days from shipped_at
```

### 5. Cancel Auto-Release

```javascript
// Cancel auto-release (e.g., when buyer accepts early)
stateMachineService.cancelAutoRelease('TXN-abc123');
```

## API Reference

### Constructor

```javascript
new StateMachineService(config)
```

**Parameters:**
- `config.turso.databaseUrl` (string) - Turso database URL
- `config.turso.authToken` (string) - Turso authentication token
- `config.squad.secretKey` (string) - Squad API secret key
- `config.squad.environment` (string) - 'sandbox' or 'production'
- `config.holdingAccount` (string) - Central holding account number

### Methods

#### `transitionState(transactionId, newState, userId, metadata)`

Transitions a transaction to a new state with full validation and action execution.

**Parameters:**
- `transactionId` (string) - Transaction ID
- `newState` (string) - Desired new state
- `userId` (number) - User ID initiating the transition
- `metadata` (object) - Additional metadata (optional)

**Returns:** `Promise<Object>`
```javascript
{
  success: boolean,
  newState: string,
  previousState: string,
  message?: string  // Only present if success is false
}
```

**Example:**
```javascript
const result = await stateMachineService.transitionState(
  'TXN-abc123',
  'Completed',
  buyerId,
  { acceptedAt: new Date().toISOString() }
);
```

---

#### `isValidTransition(currentState, newState)`

Checks if a state transition is valid.

**Parameters:**
- `currentState` (string) - Current transaction state
- `newState` (string) - Desired new state

**Returns:** `boolean`

**Example:**
```javascript
const isValid = stateMachineService.isValidTransition('In_Transit', 'Completed');
// Returns: true
```

---

#### `validateUserPermission(transaction, newState, userId)`

Validates user permission for a state transition. Throws error if unauthorized.

**Parameters:**
- `transaction` (object) - Transaction object
- `newState` (string) - Desired new state
- `userId` (number) - User ID attempting the transition

**Throws:** `Error` if user does not have permission

**Example:**
```javascript
try {
  stateMachineService.validateUserPermission(transaction, 'In_Transit', userId);
  console.log('User has permission');
} catch (error) {
  console.error('Permission denied:', error.message);
}
```

---

#### `scheduleAutoRelease(transaction)`

Schedules auto-release timer for a transaction in In_Transit state.

**Parameters:**
- `transaction` (object) - Transaction object with `transaction_id`, `shipped_at`, and `inspection_window_days`

**Returns:** `void`

**Example:**
```javascript
stateMachineService.scheduleAutoRelease({
  transaction_id: 'TXN-abc123',
  shipped_at: '2024-01-15T10:00:00Z',
  inspection_window_days: 7
});
```

---

#### `cancelAutoRelease(transactionId)`

Cancels auto-release timer for a transaction.

**Parameters:**
- `transactionId` (string) - Transaction ID

**Returns:** `void`

**Example:**
```javascript
stateMachineService.cancelAutoRelease('TXN-abc123');
```

---

#### `getStateHistory(transactionId)`

Retrieves state history for a transaction.

**Parameters:**
- `transactionId` (string) - Transaction ID

**Returns:** `Promise<Array<Object>>`

**Example:**
```javascript
const history = await stateMachineService.getStateHistory('TXN-abc123');
// Returns array of state history entries
```

---

#### `connect()`

Connects to the database.

**Returns:** `Promise<void>`

**Example:**
```javascript
await stateMachineService.connect();
```

---

#### `disconnect()`

Disconnects from the database and cancels all pending auto-release timers.

**Returns:** `Promise<void>`

**Example:**
```javascript
await stateMachineService.disconnect();
```

## State-Specific Actions

### Created → Funded_Locked

**Actions:**
1. Transfer funds from buyer to holding account (with 3 retries)
2. Update `funded_at` timestamp
3. Record state history

**Required Metadata:**
- `buyerAccount` (string) - Buyer's virtual account number

---

### Funded_Locked → In_Transit

**Actions:**
1. Update `shipped_at` timestamp
2. Schedule auto-release timer
3. Record state history

---

### In_Transit → Completed

**Actions:**
1. Release funds from holding to seller (with 3 retries)
2. Update `completed_at` timestamp
3. Cancel auto-release timer
4. Record state history

---

### In_Transit → Disputed

**Actions:**
1. Cancel auto-release timer
2. Record state history

---

### Disputed → Completed

**Actions:**
1. Release funds based on dispute resolution
2. Update `completed_at` timestamp
3. Record state history

## Auto-Release Timer

The auto-release timer automatically transitions transactions from `In_Transit` to `Completed` when the inspection window expires.

**Calculation:**
```
Expiry Time = shipped_at + inspection_window_days
```

**Example:**
- Shipped at: 2024-01-15 10:00:00
- Inspection window: 7 days
- Auto-release at: 2024-01-22 10:00:00

**Features:**
- Automatic scheduling when transitioning to In_Transit
- Automatic cancellation when transitioning away from In_Transit
- Failure logging for manual intervention
- Cleanup on service disconnect

## Error Handling

The service implements comprehensive error handling:

### Permission Errors

```javascript
try {
  await stateMachineService.transitionState('TXN-abc123', 'In_Transit', buyerId);
} catch (error) {
  // Error: "Only seller can mark transaction as shipped"
}
```

### Invalid Transition Errors

```javascript
const result = await stateMachineService.transitionState('TXN-abc123', 'Completed', userId);
if (!result.success) {
  console.error(result.message);
  // "Invalid state transition: Created → Completed"
}
```

### Squad API Errors

The service automatically retries failed Squad API calls with exponential backoff:
- Attempt 1: Immediate
- Attempt 2: 1 second delay
- Attempt 3: 2 seconds delay
- Attempt 4: 4 seconds delay (if maxRetries = 3)

## Database Schema

### transaction_state_history Table

```sql
CREATE TABLE transaction_state_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  changed_by INTEGER NOT NULL,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  
  FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id),
  FOREIGN KEY (changed_by) REFERENCES users(id)
);
```

## Testing

A comprehensive test suite is available in `test-state-machine-service.html`:

```bash
# Open in browser
open frontend/test-state-machine-service.html
```

**Test Coverage:**
- ✅ Valid state transitions
- ✅ Invalid state transitions
- ✅ User permission validation
- ✅ State history recording
- ✅ Auto-release timer scheduling

## Requirements Mapping

This service implements the following requirements from the design document:

- **6.1** - Valid state transitions map
- **6.2** - Initial transaction state (Created)
- **6.3** - Created → Funded_Locked transition
- **6.4** - Funded_Locked → In_Transit transition
- **6.5** - In_Transit → Completed transition
- **6.6** - Auto-release on inspection window expiry
- **6.7** - In_Transit → Disputed transition
- **6.8** - State change persistence with timestamps
- **6.9** - Invalid transition rejection
- **9.5** - Auto-release timer implementation
- **9.7** - Inspection window expiry calculation

## Performance Considerations

- **Database Queries**: Optimized with indexed lookups on `transaction_id`
- **Retry Logic**: Exponential backoff prevents API overload
- **Timer Management**: Efficient Map-based timer storage
- **Error Logging**: Non-blocking state history recording

## Security Considerations

- **Permission Validation**: All state changes validate user permissions
- **Audit Trail**: Complete state history for compliance
- **Error Handling**: Sensitive data not exposed in error messages
- **Transaction Integrity**: Atomic state transitions with rollback on failure

## Troubleshooting

### Timer Not Firing

**Issue:** Auto-release timer doesn't fire at expected time

**Solution:**
- Check that `shipped_at` timestamp is set correctly
- Verify `inspection_window_days` is within valid range (1-14)
- Ensure service is not disconnected before timer expires

### Permission Denied Errors

**Issue:** User cannot perform state transition

**Solution:**
- Verify user ID matches required role (buyer/seller)
- Check current transaction state allows the transition
- Ensure transaction has correct buyer_id and seller_id

### Fund Transfer Failures

**Issue:** State transition fails during fund transfer

**Solution:**
- Check Squad API credentials are correct
- Verify holding account number is valid
- Check network connectivity
- Review Squad API logs for detailed error messages

## Best Practices

1. **Always check transition validity** before attempting state change
2. **Handle errors gracefully** - display user-friendly messages
3. **Log all state changes** for audit and debugging
4. **Test permission validation** for all user roles
5. **Monitor auto-release timers** for long-running transactions
6. **Disconnect service** when no longer needed to clean up timers

## Support

For issues or questions:
- Review the test suite: `test-state-machine-service.html`
- Check console logs for detailed error messages
- Refer to design document: `.kiro/specs/escrow-dashboard/design.md`
- Review requirements: `.kiro/specs/escrow-dashboard/requirements.md`

## Version

**Version:** 1.0.0  
**Last Updated:** 2024  
**Author:** ScrowPay Development Team
