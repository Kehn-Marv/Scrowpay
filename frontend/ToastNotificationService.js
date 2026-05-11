/**
 * ToastNotificationService - Toast notification system for ScrowPay Dashboard
 * 
 * This service provides:
 * - Toast notifications (error, success, warning, info)
 * - Auto-dismiss for success messages (5 seconds)
 * - Manual dismissal for error messages
 * - Loading indicators for async operations
 * - User-friendly error message mapping
 * 
 * Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8
 */

class ToastNotificationService {
  constructor() {
    this.toasts = new Map(); // Track active toasts by ID
    this.toastCounter = 0;
    this.loadingIndicators = new Map(); // Track active loading indicators
  }
  
  /**
   * Shows an error notification (requires manual dismissal)
   * @param {string} message - Error message to display
   * @param {Object} options - Additional options
   * @returns {string} Toast ID
   */
  showError(message, options = {}) {
    console.log('[ToastNotificationService] Showing error:', message);
    
    return this._showToast({
      type: 'error',
      message,
      icon: '⚠️',
      autoDismiss: false, // Requirement 17.8: Require user dismissal for errors
      ...options
    });
  }
  
  /**
   * Shows a success notification (auto-dismisses after 5 seconds)
   * @param {string} message - Success message to display
   * @param {Object} options - Additional options
   * @returns {string} Toast ID
   */
  showSuccess(message, options = {}) {
    console.log('[ToastNotificationService] Showing success:', message);
    
    return this._showToast({
      type: 'success',
      message,
      icon: '✓',
      autoDismiss: true,
      duration: 5000, // Requirement 17.7: Auto-dismiss after 5 seconds
      ...options
    });
  }
  
  /**
   * Shows a warning notification (requires manual dismissal)
   * @param {string} message - Warning message to display
   * @param {Object} options - Additional options
   * @returns {string} Toast ID
   */
  showWarning(message, options = {}) {
    console.log('[ToastNotificationService] Showing warning:', message);
    
    return this._showToast({
      type: 'warning',
      message,
      icon: '⚠️',
      autoDismiss: false, // Warnings require user dismissal
      ...options
    });
  }
  
  /**
   * Shows an info notification (auto-dismisses after 5 seconds)
   * @param {string} message - Info message to display
   * @param {Object} options - Additional options
   * @returns {string} Toast ID
   */
  showInfo(message, options = {}) {
    console.log('[ToastNotificationService] Showing info:', message);
    
    return this._showToast({
      type: 'info',
      message,
      icon: 'ℹ️',
      autoDismiss: true,
      duration: 5000,
      ...options
    });
  }
  
  /**
   * Internal method to create and show a toast
   * @private
   * @param {Object} config - Toast configuration
   * @returns {string} Toast ID
   */
  _showToast(config) {
    const toastId = `toast-${++this.toastCounter}`;
    
    // Create toast element
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `toast toast-${config.type}`;
    
    // Build toast content
    const closeButton = config.autoDismiss 
      ? '' 
      : `<button class="toast-close" onclick="window.toastService.dismiss('${toastId}')">×</button>`;
    
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-icon">${config.icon}</span>
        <span class="toast-message">${this._escapeHtml(config.message)}</span>
        ${closeButton}
      </div>
    `;
    
    // Add to DOM
    document.body.appendChild(toast);
    
    // Track toast
    this.toasts.set(toastId, {
      element: toast,
      config
    });
    
    // Auto-dismiss if configured
    if (config.autoDismiss) {
      setTimeout(() => {
        this.dismiss(toastId);
      }, config.duration);
    }
    
    return toastId;
  }
  
  /**
   * Dismisses a toast notification
   * @param {string} toastId - Toast ID to dismiss
   */
  dismiss(toastId) {
    const toast = this.toasts.get(toastId);
    
    if (toast) {
      // Add fade-out animation
      toast.element.style.opacity = '0';
      toast.element.style.transform = 'translateX(400px)';
      
      // Remove from DOM after animation
      setTimeout(() => {
        if (toast.element.parentNode) {
          toast.element.parentNode.removeChild(toast.element);
        }
        this.toasts.delete(toastId);
      }, 300);
    }
  }
  
  /**
   * Dismisses all active toasts
   */
  dismissAll() {
    const toastIds = Array.from(this.toasts.keys());
    toastIds.forEach(id => this.dismiss(id));
  }
  
  /**
   * Shows a loading indicator
   * @param {string} message - Loading message
   * @param {string} operationId - Unique operation ID
   * @returns {string} Loading indicator ID
   */
  showLoading(message, operationId = null) {
    const loadingId = operationId || `loading-${++this.toastCounter}`;
    
    console.log('[ToastNotificationService] Showing loading:', message, loadingId);
    
    // Create loading toast
    const toast = document.createElement('div');
    toast.id = loadingId;
    toast.className = 'toast toast-info';
    
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-icon">
          <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </span>
        <span class="toast-message">${this._escapeHtml(message)}</span>
      </div>
    `;
    
    // Add to DOM
    document.body.appendChild(toast);
    
    // Track loading indicator
    this.loadingIndicators.set(loadingId, {
      element: toast,
      message
    });
    
    return loadingId;
  }
  
  /**
   * Hides a loading indicator
   * @param {string} loadingId - Loading indicator ID
   */
  hideLoading(loadingId) {
    const loading = this.loadingIndicators.get(loadingId);
    
    if (loading) {
      console.log('[ToastNotificationService] Hiding loading:', loadingId);
      
      // Add fade-out animation
      loading.element.style.opacity = '0';
      loading.element.style.transform = 'translateX(400px)';
      
      // Remove from DOM after animation
      setTimeout(() => {
        if (loading.element.parentNode) {
          loading.element.parentNode.removeChild(loading.element);
        }
        this.loadingIndicators.delete(loadingId);
      }, 300);
    }
  }
  
  /**
   * Maps Squad API errors to user-friendly messages
   * Requirement 17.1: Map Squad API errors
   * @param {Object} error - Error object from Squad API
   * @param {number} statusCode - HTTP status code
   * @returns {string} User-friendly error message
   */
  mapSquadAPIError(error, statusCode) {
    console.log('[ToastNotificationService] Mapping Squad API error:', { error, statusCode });
    
    // Authentication errors (Requirement 17.1)
    if (statusCode === 401 || statusCode === 403) {
      return 'Authentication failed. Please contact support.';
    }
    
    // Bad request errors (Requirement 17.1)
    if (statusCode === 400) {
      return error.message || 'Invalid request. Please check your details and try again.';
    }
    
    // Server errors (Requirement 17.1)
    if (statusCode >= 500) {
      return 'Service unavailable. Please try again later.';
    }
    
    // Timeout errors
    if (error.errorType === 'timeout') {
      return 'Request timed out. Please try again.';
    }
    
    // Network errors
    if (error.errorType === 'network_error') {
      return 'No internet connection. Please check your network.';
    }
    
    // Default error message
    return error.message || 'An error occurred. Please try again.';
  }
  
  /**
   * Maps Turso DB errors to user-friendly messages
   * Requirement 17.2: Map Turso DB errors
   * @param {Error} error - Error object from Turso DB
   * @returns {string} User-friendly error message
   */
  mapTursoDBError(error) {
    console.log('[ToastNotificationService] Mapping Turso DB error:', error);
    
    // Connection errors
    if (error.message.includes('connect') || error.message.includes('Connection')) {
      return 'Unable to load data. Please check your internet connection.';
    }
    
    // Query errors
    if (error.message.includes('no such table') || error.message.includes('syntax error')) {
      return 'Unable to load data. Please refresh the page.';
    }
    
    // Generic database error (Requirement 17.2)
    return 'Unable to load data. Please refresh.';
  }
  
  /**
   * Maps AI engine errors to user-friendly messages
   * Requirement 17.3: Map AI engine errors
   * @param {Object} error - Error object from AI engine
   * @returns {string} User-friendly error message
   */
  mapAIEngineError(error) {
    console.log('[ToastNotificationService] Mapping AI engine error:', error);
    
    // Timeout errors
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return 'Risk scoring unavailable. Transaction blocked.';
    }
    
    // Network errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return 'Risk scoring unavailable. Transaction blocked.';
    }
    
    // Generic AI engine error (Requirement 17.3)
    return 'Risk scoring unavailable. Transaction blocked.';
  }
  
  /**
   * Maps network errors to user-friendly messages
   * Requirement 17.4: Map network errors
   * @param {Error} error - Network error object
   * @returns {string} User-friendly error message
   */
  mapNetworkError(error) {
    console.log('[ToastNotificationService] Mapping network error:', error);
    
    // Requirement 17.4: Network error message
    return 'No internet connection. Please check your network.';
  }
  
  /**
   * Shows an error with retry logic
   * Requirement 17.5: Implement retry logic with exponential backoff
   * @param {string} message - Error message
   * @param {Function} retryCallback - Function to call on retry
   * @param {number} retryCount - Current retry count
   * @param {number} maxRetries - Maximum retry attempts (default: 3)
   */
  showErrorWithRetry(message, retryCallback, retryCount = 0, maxRetries = 3) {
    if (retryCount >= maxRetries) {
      // Max retries reached, show error without retry option
      this.showError(message);
      return;
    }
    
    // Calculate delay for exponential backoff (1s, 2s, 4s)
    const delay = Math.pow(2, retryCount) * 1000;
    
    console.log(`[ToastNotificationService] Retry ${retryCount + 1}/${maxRetries} after ${delay}ms`);
    
    // Show loading indicator
    const loadingId = this.showLoading(`Retrying... (${retryCount + 1}/${maxRetries})`);
    
    // Wait for delay, then retry
    setTimeout(async () => {
      this.hideLoading(loadingId);
      
      try {
        await retryCallback();
      } catch (error) {
        // Retry failed, try again
        this.showErrorWithRetry(message, retryCallback, retryCount + 1, maxRetries);
      }
    }, delay);
  }
  
  /**
   * Escapes HTML to prevent XSS attacks
   * @private
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Create global instance
if (typeof window !== 'undefined') {
  window.toastService = new ToastNotificationService();
  window.ToastNotificationService = ToastNotificationService;
}

// Export for use in Node.js (for testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ToastNotificationService;
}
