# Error Handling and User Feedback System

## Overview

The ScrowPay Dashboard implements a comprehensive error handling and user feedback system that provides clear, user-friendly messages for all error scenarios and implements robust retry logic for transient failures.

**Requirements Implemented:** 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 7.5, 7.6

## Components

### 1. ToastNotificationService

**File:** `ToastNotificationService.js`

A centralized toast notification system that provides:
- Error notifications (require manual dismissal)
- Success notifications (auto-dismiss after 5 seconds)
- Warning notifications (require manual dismissal)
- Info notifications (auto-dismiss after 5 seconds)
- Loading indicators for async operations
- Error message mapping for different services

#### Usage

```javascript
// Show error (requires manual dismissal)
window.toastService.showError('Payment failed. Please try again.');

// Show success (auto-dismisses after 5 seconds)
window.toastService.showSuccess('Transaction created successfully!');

// Show warning
window.toastService.showWarning('Risk score is high. Please review.');

// Show loading indicator
const loadingId = window.toastService.showLoading('Processing payment...');
// ... perform async operation ...
window.toastService.hideLoading(loadingId);

// Dismiss specific toast
window.toastService.dismiss(toastId);

// Dismiss all toasts
window.toastService.dismissAll();
```

#### Error Message Mapping

The service provides specialized error mapping methods:

```javascript
// Map Squad API errors (Requirement 17.1)
const message = window.toastService.mapSquadAPIError(error, statusCode);
// 401/403 → "Authentication failed"
// 400 → "Invalid request"
// 500+ → "Service unavailable"

// Map Turso DB errors (Requirement 17.2)
const message = window.toastService.mapTursoDBError(error);
// → "Unable to load data. Please refresh."

// Map AI Engine errors (Requirement 17.3)
const message = window.toastService.mapAIEngineError(error);
// → "Risk scoring unavailable. Transaction blocked."

// Map network errors (Requirement 17.4)
const message = window.toastService.mapNetworkError(error);
// → "No internet connection. Please check your network."
```

### 2. ErrorHandlerService

**File:** `error-handler-service.js`

Enhanced error handler service with:
- Error classification
- Retry logic with exponential backoff
- Integration with ToastNotificationService
- Squad API retry wrapper

#### Usage

```javascript
// Classify an error
const errorInfo = ErrorHandlerService.classifyError(error, 'squad_api');
console.log(errorInfo.type); // 'network', 'database', 'camera', etc.
console.log(errorInfo.canRetry); // true/false

// Handle error with toast notification
ErrorHandlerService.handleErrorWithToast(error, 'squad_api', {
  retryCallback: () => retryOperation(),
  maxRetries: 3
});

// Retry Squad API with exponential backoff (Requirement 17.5, 7.5, 7.6)
const result = await ErrorHandlerService.retrySquadAPI(
  async () => await squadService.transfer(data),
  {
    maxRetries: 3,        // 3 retries
    initialDelay: 1000,   // 1s, 2s, 4s delays
    showToast: true       // Show loading/error toasts
  }
);

// Create retry wrapper for any async function
const retryableFunction = ErrorHandlerService.createRetryWrapper(
  async () => await someAsyncOperation(),
  3,    // maxRetries
  1000  // initialDelay
);
```

## Retry Logic

### Exponential Backoff

**Requirements:** 17.5, 7.5, 7.6

The system implements exponential backoff for Squad API retries:
- **Retry 1:** Wait 1 second
- **Retry 2:** Wait 2 seconds
- **Retry 3:** Wait 4 seconds

```javascript
// Example: Retry Squad API transfer
const result = await ErrorHandlerService.retrySquadAPI(
  async () => {
    return await squadService.transfer({
      from_account: buyerAccount,
      to_account: holdingAccount,
      amount: transactionAmount
    });
  }
);

if (result.success) {
  window.toastService.showSuccess('Payment successful!');
} else {
  // Error already shown by retry logic
  console.error('Payment failed after retries:', result.message);
}
```

### Retryable vs Non-Retryable Errors

**Retryable Errors:**
- Network errors (connection lost)
- Timeout errors
- Server errors (500+)
- Database connection errors

**Non-Retryable Errors:**
- Authentication errors (401/403)
- Validation errors (400)
- Camera not found
- Invalid input

## Toast Notification Behavior

### Auto-Dismiss (Requirement 17.7)

Success and info notifications auto-dismiss after **5 seconds**:

```javascript
window.toastService.showSuccess('Transaction created!');
// Automatically disappears after 5 seconds
```

### Manual Dismissal (Requirement 17.8)

Error and warning notifications require **user dismissal**:

```javascript
window.toastService.showError('Payment failed. Please try again.');
// User must click the × button to dismiss
```

## Loading Indicators (Requirement 17.6)

Display loading indicators for all async operations:

```javascript
async function fundTransaction() {
  // Show loading indicator
  const loadingId = window.toastService.showLoading('Processing payment...');
  
  try {
    // Perform async operation
    const result = await squadService.transfer(data);
    
    // Hide loading indicator
    window.toastService.hideLoading(loadingId);
    
    // Show success
    window.toastService.showSuccess('Payment successful!');
    
  } catch (error) {
    // Hide loading indicator
    window.toastService.hideLoading(loadingId);
    
    // Show error
    ErrorHandlerService.handleErrorWithToast(error, 'squad_api');
  }
}
```

## Error Message Examples

### Squad API Errors (Requirement 17.1)

| Status Code | User Message |
|-------------|--------------|
| 401/403 | "Authentication failed. Please contact support." |
| 400 | "Invalid request. Please check your details." |
| 500+ | "Service unavailable. Please try again later." |
| Timeout | "Request timed out. Please try again." |
| Network | "No internet connection. Please check your network." |

### Turso DB Errors (Requirement 17.2)

| Error Type | User Message |
|------------|--------------|
| Connection | "Unable to load data. Please check your internet connection." |
| Query | "Unable to load data. Please refresh." |
| Generic | "Unable to load data. Please refresh." |

### AI Engine Errors (Requirement 17.3)

| Error Type | User Message |
|------------|--------------|
| Timeout | "Risk scoring unavailable. Transaction blocked." |
| Network | "Risk scoring unavailable. Transaction blocked." |
| Generic | "Risk scoring unavailable. Transaction blocked." |

### Network Errors (Requirement 17.4)

All network errors show:
```
"No internet connection. Please check your network."
```

## Integration Examples

### Example 1: Transaction Creation with Error Handling

```javascript
async function createTransaction(formData) {
  // Show loading
  const loadingId = window.toastService.showLoading('Creating transaction...');
  
  try {
    // Validate inputs
    const errors = validateTransactionForm(formData);
    if (errors.length > 0) {
      window.toastService.hideLoading(loadingId);
      window.toastService.showError(errors[0]);
      return;
    }
    
    // Create transaction
    const result = await transactionService.createTransaction(formData);
    
    window.toastService.hideLoading(loadingId);
    
    if (result.success) {
      window.toastService.showSuccess('Transaction created successfully!');
      return result.transaction;
    } else {
      window.toastService.showError(result.message);
    }
    
  } catch (error) {
    window.toastService.hideLoading(loadingId);
    ErrorHandlerService.handleErrorWithToast(error, 'database');
  }
}
```

### Example 2: Squad API with Retry Logic

```javascript
async function fundEscrow(transactionData) {
  // Show loading
  const loadingId = window.toastService.showLoading('Funding escrow...');
  
  try {
    // Retry Squad API with exponential backoff
    const result = await ErrorHandlerService.retrySquadAPI(
      async () => {
        return await squadService.transfer({
          from_account: transactionData.buyerAccount,
          to_account: CONFIG.holdingAccount,
          amount: transactionData.price
        });
      },
      {
        maxRetries: 3,
        initialDelay: 1000,
        showToast: true  // Shows retry progress
      }
    );
    
    window.toastService.hideLoading(loadingId);
    
    if (result.success) {
      window.toastService.showSuccess('Escrow funded successfully!');
      return result;
    } else {
      // Error already shown by retry logic
      return result;
    }
    
  } catch (error) {
    window.toastService.hideLoading(loadingId);
    // Error already shown by retry logic
    throw error;
  }
}
```

### Example 3: AI Risk Scoring with Fallback

```javascript
async function scoreTransaction(transactionData, userContext) {
  // Show loading
  const loadingId = window.toastService.showLoading('Analyzing risk...');
  
  try {
    const result = await aiRiskService.scoreTransaction(transactionData, userContext);
    
    window.toastService.hideLoading(loadingId);
    
    if (result.fallback) {
      // AI engine unavailable, using fallback
      window.toastService.showWarning(result.message);
    }
    
    return result;
    
  } catch (error) {
    window.toastService.hideLoading(loadingId);
    
    // Map AI engine error
    const message = window.toastService.mapAIEngineError(error);
    window.toastService.showError(message);
    
    // Return safe default (fail verdict)
    return {
      risk_score: 100,
      verdict: 'fail',
      fallback: true
    };
  }
}
```

## CSS Styles

The toast notification styles are already included in `dashboard.html`:

```css
.toast {
  position: fixed;
  top: 20px;
  right: 20px;
  min-width: 300px;
  max-width: 500px;
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 9999;
  animation: slideIn 0.3s ease-out;
}

.toast-error {
  background: #ff6b6b;
  color: white;
}

.toast-success {
  background: #caff04;
  color: #1c1c1c;
}

.toast-warning {
  background: #ffd93d;
  color: #1c1c1c;
}

.toast-info {
  background: #4ecdc4;
  color: white;
}
```

## Testing

### Manual Testing Checklist

- [ ] Error notifications require manual dismissal
- [ ] Success notifications auto-dismiss after 5 seconds
- [ ] Loading indicators appear for async operations
- [ ] Squad API retries 3 times with 1s, 2s, 4s delays
- [ ] Network errors show appropriate message
- [ ] Database errors show appropriate message
- [ ] AI engine errors show appropriate message
- [ ] Multiple toasts stack vertically
- [ ] Toast animations work smoothly

### Error Simulation

```javascript
// Simulate Squad API error
window.toastService.showError(
  window.toastService.mapSquadAPIError({ message: 'Test error' }, 500)
);

// Simulate network error
window.toastService.showError(
  window.toastService.mapNetworkError(new Error('Network error'))
);

// Simulate AI engine error
window.toastService.showError(
  window.toastService.mapAIEngineError(new Error('Timeout'))
);

// Simulate database error
window.toastService.showError(
  window.toastService.mapTursoDBError(new Error('Connection failed'))
);
```

## Best Practices

1. **Always show loading indicators** for async operations
2. **Use appropriate toast types** (error, success, warning, info)
3. **Map errors to user-friendly messages** using the service methods
4. **Implement retry logic** for transient failures (Squad API, network)
5. **Hide loading indicators** in both success and error paths
6. **Don't show raw error messages** to users
7. **Log detailed errors** to console for debugging
8. **Test error scenarios** thoroughly

## Migration Guide

### Old Code (Inline Functions)

```javascript
showErrorNotification('Payment failed');
showSuccessNotification('Transaction created');
```

### New Code (ToastNotificationService)

```javascript
window.toastService.showError('Payment failed');
window.toastService.showSuccess('Transaction created');
```

The old inline functions are kept for backward compatibility but delegate to the new service.

## Requirements Traceability

| Requirement | Implementation |
|-------------|----------------|
| 17.1 | Squad API error mapping in `mapSquadAPIError()` |
| 17.2 | Turso DB error mapping in `mapTursoDBError()` |
| 17.3 | AI engine error mapping in `mapAIEngineError()` |
| 17.4 | Network error mapping in `mapNetworkError()` |
| 17.5 | Retry logic with exponential backoff in `retrySquadAPI()` |
| 17.6 | Loading indicators in `showLoading()` / `hideLoading()` |
| 17.7 | Auto-dismiss success after 5s in `showSuccess()` |
| 17.8 | Manual dismissal for errors in `showError()` |
| 7.5 | Squad API retry logic in `retrySquadAPI()` |
| 7.6 | Exponential backoff (1s, 2s, 4s) in `retrySquadAPI()` |

## Support

For issues or questions about the error handling system, refer to:
- `ToastNotificationService.js` - Toast notification implementation
- `error-handler-service.js` - Error classification and retry logic
- `dashboard.html` - Toast CSS styles and integration
- Design document section on "Error Handling"
