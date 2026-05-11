/**
 * Rate Limiting Integration Example
 * 
 * This file demonstrates how to integrate rate limiting into the dashboard UI.
 * It shows how to handle rate limit errors and display appropriate messages to users.
 */

// Example: Transaction creation with rate limiting
async function createTransactionWithRateLimiting() {
  const transactionService = new TransactionService({
    turso: {
      databaseUrl: CONFIG.turso.databaseUrl,
      authToken: CONFIG.turso.authToken
    }
  });
  
  // Get form data
  const formData = {
    sellerId: getCurrentUserId(),
    itemDescription: document.getElementById('itemDescription').value,
    price: parseFloat(document.getElementById('price').value),
    deliveryTimelineDays: parseInt(document.getElementById('deliveryTimeline').value),
    inspectionWindowDays: parseInt(document.getElementById('inspectionWindow').value)
  };
  
  try {
    // Show loading indicator
    showLoadingIndicator('Creating transaction...');
    
    // Create transaction (rate limiting is applied automatically)
    const transaction = await transactionService.createTransaction(formData);
    
    // Hide loading indicator
    hideLoadingIndicator();
    
    // Show success message
    showSuccessNotification(
      `Transaction created successfully! Transaction ID: ${transaction.transaction_id}`
    );
    
    // Display transaction ID for sharing
    displayTransactionId(transaction.transaction_id);
    
    // Reset form
    document.getElementById('createTransactionForm').reset();
    
    // Refresh transaction list
    await refreshTransactionList();
    
  } catch (error) {
    // Hide loading indicator
    hideLoadingIndicator();
    
    // Check if it's a rate limit error
    if (error.message.includes('Rate limit exceeded')) {
      // Display rate limit error with special styling
      showRateLimitError(error.message);
      
      // Optionally, disable the create button temporarily
      disableCreateButtonTemporarily();
      
    } else if (error.message.includes('Validation failed')) {
      // Display validation errors
      showValidationErrors(error.message);
      
    } else {
      // Display generic error
      showErrorNotification(
        'Failed to create transaction. Please try again or contact support.'
      );
    }
    
    console.error('[Dashboard] Transaction creation failed:', error);
  }
}

// Display rate limit error with countdown timer
function showRateLimitError(errorMessage) {
  // Extract reset time from error message
  const resetTimeMatch = errorMessage.match(/try again after (.+)\./);
  const resetTimeStr = resetTimeMatch ? resetTimeMatch[1] : 'later';
  
  // Create error notification with countdown
  const notification = document.createElement('div');
  notification.className = 'notification notification-error rate-limit-error';
  notification.innerHTML = `
    <div class="notification-icon">⚠️</div>
    <div class="notification-content">
      <h3>Rate Limit Exceeded</h3>
      <p>${errorMessage}</p>
      <p class="rate-limit-info">
        You can create more transactions after <strong>${resetTimeStr}</strong>.
      </p>
    </div>
    <button class="notification-close" onclick="this.parentElement.remove()">×</button>
  `;
  
  document.body.appendChild(notification);
  
  // Auto-remove after 10 seconds (longer than normal errors)
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 10000);
}

// Temporarily disable create button with countdown
function disableCreateButtonTemporarily() {
  const createButton = document.getElementById('createTransactionButton');
  if (!createButton) return;
  
  const originalText = createButton.textContent;
  let secondsRemaining = 60; // 1 minute cooldown
  
  createButton.disabled = true;
  createButton.textContent = `Please wait (${secondsRemaining}s)`;
  
  const countdown = setInterval(() => {
    secondsRemaining--;
    
    if (secondsRemaining <= 0) {
      clearInterval(countdown);
      createButton.disabled = false;
      createButton.textContent = originalText;
    } else {
      createButton.textContent = `Please wait (${secondsRemaining}s)`;
    }
  }, 1000);
}

// Check rate limit before showing create form
async function checkRateLimitBeforeCreate() {
  const transactionService = new TransactionService({
    turso: {
      databaseUrl: CONFIG.turso.databaseUrl,
      authToken: CONFIG.turso.authToken
    }
  });
  
  try {
    const userId = getCurrentUserId();
    const rateLimitCheck = await transactionService.checkRateLimit(userId);
    
    // Display rate limit status
    displayRateLimitStatus(rateLimitCheck);
    
    // If at limit, show warning
    if (!rateLimitCheck.allowed) {
      showRateLimitWarning(rateLimitCheck);
      return false;
    }
    
    // If close to limit, show info
    if (rateLimitCheck.count >= 8) {
      showRateLimitInfo(rateLimitCheck);
    }
    
    return true;
    
  } catch (error) {
    console.error('[Dashboard] Rate limit check failed:', error);
    // Allow creation on error (fail-open)
    return true;
  }
}

// Display rate limit status in UI
function displayRateLimitStatus(rateLimitCheck) {
  const statusElement = document.getElementById('rateLimitStatus');
  if (!statusElement) return;
  
  const percentage = (rateLimitCheck.count / rateLimitCheck.limit) * 100;
  const remaining = rateLimitCheck.limit - rateLimitCheck.count;
  
  let statusClass = 'rate-limit-ok';
  if (percentage >= 80) {
    statusClass = 'rate-limit-warning';
  }
  if (percentage >= 100) {
    statusClass = 'rate-limit-exceeded';
  }
  
  statusElement.className = `rate-limit-status ${statusClass}`;
  statusElement.innerHTML = `
    <div class="rate-limit-bar">
      <div class="rate-limit-fill" style="width: ${Math.min(percentage, 100)}%"></div>
    </div>
    <div class="rate-limit-text">
      ${rateLimitCheck.count}/${rateLimitCheck.limit} transactions this hour
      ${remaining > 0 ? `(${remaining} remaining)` : '(limit reached)'}
    </div>
  `;
}

// Show warning when rate limit is reached
function showRateLimitWarning(rateLimitCheck) {
  const resetTime = new Date(rateLimitCheck.resetTime).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
  
  showWarningNotification(
    `You have reached your transaction creation limit (${rateLimitCheck.limit} per hour). ` +
    `You can create more transactions after ${resetTime}.`
  );
}

// Show info when close to rate limit
function showRateLimitInfo(rateLimitCheck) {
  const remaining = rateLimitCheck.limit - rateLimitCheck.count;
  
  showInfoNotification(
    `You have ${remaining} transaction${remaining === 1 ? '' : 's'} remaining this hour.`
  );
}

// Example: Add rate limit status to dashboard initialization
async function initializeDashboard() {
  // ... other initialization code ...
  
  // Check and display rate limit status
  await checkRateLimitBeforeCreate();
  
  // Refresh rate limit status every 5 minutes
  setInterval(async () => {
    await checkRateLimitBeforeCreate();
  }, 5 * 60 * 1000);
}

// Example: Add event listener to create transaction button
document.addEventListener('DOMContentLoaded', () => {
  const createButton = document.getElementById('createTransactionButton');
  if (createButton) {
    createButton.addEventListener('click', async (e) => {
      e.preventDefault();
      
      // Check rate limit before attempting creation
      const canCreate = await checkRateLimitBeforeCreate();
      
      if (canCreate) {
        await createTransactionWithRateLimiting();
      }
    });
  }
});

// CSS styles for rate limit UI (add to your stylesheet)
const rateLimitStyles = `
  .rate-limit-status {
    padding: 12px;
    border-radius: 8px;
    margin: 16px 0;
    background: #f8f9fa;
    border: 1px solid #dee2e6;
  }
  
  .rate-limit-status.rate-limit-warning {
    background: #fff3cd;
    border-color: #ffc107;
  }
  
  .rate-limit-status.rate-limit-exceeded {
    background: #f8d7da;
    border-color: #dc3545;
  }
  
  .rate-limit-bar {
    height: 8px;
    background: #e9ecef;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 8px;
  }
  
  .rate-limit-fill {
    height: 100%;
    background: #28a745;
    transition: width 0.3s ease;
  }
  
  .rate-limit-warning .rate-limit-fill {
    background: #ffc107;
  }
  
  .rate-limit-exceeded .rate-limit-fill {
    background: #dc3545;
  }
  
  .rate-limit-text {
    font-size: 14px;
    color: #495057;
    text-align: center;
  }
  
  .rate-limit-error {
    border-left: 4px solid #dc3545;
  }
  
  .rate-limit-info {
    margin-top: 8px;
    font-size: 14px;
    color: #6c757d;
  }
`;

// Helper functions (implement these based on your UI framework)
function showLoadingIndicator(message) {
  // Show loading spinner with message
  console.log('[Loading]', message);
}

function hideLoadingIndicator() {
  // Hide loading spinner
  console.log('[Loading] Hidden');
}

function showSuccessNotification(message) {
  // Show success toast notification
  console.log('[Success]', message);
}

function showErrorNotification(message) {
  // Show error toast notification
  console.error('[Error]', message);
}

function showWarningNotification(message) {
  // Show warning toast notification
  console.warn('[Warning]', message);
}

function showInfoNotification(message) {
  // Show info toast notification
  console.info('[Info]', message);
}

function showValidationErrors(message) {
  // Display validation errors in form
  console.error('[Validation]', message);
}

function displayTransactionId(transactionId) {
  // Display transaction ID for user to share
  console.log('[Transaction ID]', transactionId);
}

function getCurrentUserId() {
  // Get current user ID from session
  return 1; // Placeholder
}

function refreshTransactionList() {
  // Refresh the transaction list in the dashboard
  console.log('[Dashboard] Refreshing transaction list');
}
