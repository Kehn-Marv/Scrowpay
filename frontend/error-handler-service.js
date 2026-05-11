/**
 * ErrorHandlerService - Centralized error handling for ScrowPay
 * 
 * This service provides:
 * - Consistent error message constants
 * - Error classification and handling
 * - Retry mechanisms for transient failures with exponential backoff
 * - User-friendly error messages
 * - Integration with ToastNotificationService
 * 
 * Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 7.5, 7.6
 */

class ErrorHandlerService {
  /**
   * Error message constants for consistent messaging across the application
   * Requirement 17.1, 17.2, 17.3, 17.4, 17.5
   */
  static ERROR_MESSAGES = {
    // Network errors (Requirement 17.4)
    NETWORK_ERROR: 'No internet connection. Please check your network.',
    
    // Squad API errors (Requirement 17.1)
    SQUAD_API_AUTH_ERROR: 'Authentication failed. Please contact support.',
    SQUAD_API_BAD_REQUEST: 'Invalid request. Please check your details.',
    SQUAD_API_SERVER_ERROR: 'Service unavailable. Please try again later.',
    SQUAD_API_NETWORK_ERROR: 'Unable to connect to payment service. Please check your internet connection.',
    SQUAD_API_TIMEOUT: 'Payment request timed out. Please try again.',
    
    // Database errors (Requirement 17.2)
    DATABASE_ERROR: 'Unable to load data. Please refresh.',
    DATABASE_CONNECTION_ERROR: 'Unable to connect to database. Please check your internet connection.',
    DATABASE_SAVE_ERROR: 'Failed to save data. Please try again.',
    DATABASE_QUERY_ERROR: 'Failed to load data. Please refresh.',
    
    // AI Engine errors (Requirement 17.3)
    AI_ENGINE_UNAVAILABLE: 'Risk scoring unavailable. Transaction blocked.',
    AI_ENGINE_TIMEOUT: 'Risk scoring unavailable. Transaction blocked.',
    AI_ENGINE_ERROR: 'Risk scoring unavailable. Transaction blocked.',
    
    // Camera and MediaPipe errors (Requirement 17.3, 17.4)
    CAMERA_ACCESS_DENIED: 'Camera access is required for face verification. Please enable camera access in your browser settings and try again.',
    CAMERA_NOT_FOUND: 'No camera detected. Please connect a camera and try again.',
    CAMERA_IN_USE: 'Camera is already in use by another application. Please close other applications and try again.',
    CAMERA_ERROR: 'Unable to access camera. Please check your camera connection and try again.',
    MEDIAPIPE_LOAD_ERROR: 'Unable to load face detection library. Please check your internet connection and try again.',
    MEDIAPIPE_INIT_ERROR: 'Failed to initialize face detection. Please refresh the page and try again.',
    FACE_NOT_DETECTED: 'Unable to detect your face. Please ensure your face is clearly visible in the camera frame and try again.',
    FACE_DETECTION_ERROR: 'An error occurred during face detection. Please try again.',
    BLINK_TIMEOUT: 'Blink detection timed out. Please try again and blink clearly when prompted.',
    
    // Validation errors
    PHONE_INVALID: 'Please enter a valid Nigerian phone number',
    PHONE_DUPLICATE: 'This phone number is already registered. Please log in to your existing account.',
    OTP_INVALID: 'Verification code is incorrect. Please check and try again.',
    OTP_EXPIRED: 'Verification code has expired. Please request a new code.',
    ID_INVALID_FORMAT: 'Please enter a valid 11-digit BVN/NIN',
    ID_DUPLICATE: 'This BVN/NIN is already registered. Please log in to your existing account.',
    BVN_INVALID: 'BVN must be 11 digits and start with 1 or 2',
    NIN_INVALID: 'NIN must be exactly 11 digits',
    NAME_REQUIRED: 'Please enter your first name and last name',
    ADDRESS_INCOMPLETE: 'Please complete all required address fields',
    PIN_INVALID_LENGTH: 'PIN must be exactly 6 digits',
    PIN_INVALID_REPEATED: 'PIN cannot contain repeated digits',
    PIN_INVALID_CONSECUTIVE: 'PIN cannot contain 3 or more consecutive digits (e.g., 123, 456, 987)',
    PIN_MISMATCH: 'PINs do not match. Please re-enter your PIN.',
    
    // Generic errors
    UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.',
    TIMEOUT_ERROR: 'Request timed out. Please try again.',
    SERVER_ERROR: 'Server error occurred. Please try again later.'
  };
  
  /**
   * Error types for classification
   */
  static ERROR_TYPES = {
    NETWORK: 'network',
    DATABASE: 'database',
    CAMERA: 'camera',
    MEDIAPIPE: 'mediapipe',
    VALIDATION: 'validation',
    UNKNOWN: 'unknown'
  };
  
  /**
   * Classifies an error and returns appropriate error information
   * @param {Error} error - The error object to classify
   * @param {string} context - Context where the error occurred (e.g., 'squad_api', 'database', 'camera')
   * @returns {Object} Error information with type, message, and retry flag
   */
  static classifyError(error, context = '') {
    console.error(`[ErrorHandler] Classifying error in context: ${context}`, error);
    
    // Network errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return {
        type: this.ERROR_TYPES.NETWORK,
        message: context === 'squad_api' 
          ? this.ERROR_MESSAGES.SQUAD_API_NETWORK_ERROR 
          : this.ERROR_MESSAGES.NETWORK_ERROR,
        canRetry: true,
        originalError: error
      };
    }
    
    if (error.name === 'NetworkError' || error.message.includes('network')) {
      return {
        type: this.ERROR_TYPES.NETWORK,
        message: this.ERROR_MESSAGES.NETWORK_ERROR,
        canRetry: true,
        originalError: error
      };
    }
    
    // Timeout errors
    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      return {
        type: this.ERROR_TYPES.NETWORK,
        message: context === 'squad_api' 
          ? this.ERROR_MESSAGES.SQUAD_API_TIMEOUT 
          : this.ERROR_MESSAGES.TIMEOUT_ERROR,
        canRetry: true,
        originalError: error
      };
    }
    
    // Database errors
    if (error.message.includes('database') || error.message.includes('Database')) {
      if (error.message.includes('connect') || error.message.includes('Connection')) {
        return {
          type: this.ERROR_TYPES.DATABASE,
          message: this.ERROR_MESSAGES.DATABASE_CONNECTION_ERROR,
          canRetry: true,
          originalError: error
        };
      }
      return {
        type: this.ERROR_TYPES.DATABASE,
        message: this.ERROR_MESSAGES.DATABASE_ERROR,
        canRetry: true,
        originalError: error
      };
    }
    
    // Camera errors (Requirement 17.3)
    if (error.name === 'NotAllowedError') {
      return {
        type: this.ERROR_TYPES.CAMERA,
        message: this.ERROR_MESSAGES.CAMERA_ACCESS_DENIED,
        canRetry: true,
        originalError: error
      };
    }
    
    if (error.name === 'NotFoundError') {
      return {
        type: this.ERROR_TYPES.CAMERA,
        message: this.ERROR_MESSAGES.CAMERA_NOT_FOUND,
        canRetry: false,
        originalError: error
      };
    }
    
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return {
        type: this.ERROR_TYPES.CAMERA,
        message: this.ERROR_MESSAGES.CAMERA_IN_USE,
        canRetry: true,
        originalError: error
      };
    }
    
    if (error.message.includes('camera') || error.message.includes('Camera')) {
      return {
        type: this.ERROR_TYPES.CAMERA,
        message: this.ERROR_MESSAGES.CAMERA_ERROR,
        canRetry: true,
        originalError: error
      };
    }
    
    // MediaPipe errors (Requirement 17.4)
    if (error.message.includes('MediaPipe') || error.message.includes('Face Mesh')) {
      if (error.message.includes('not loaded') || error.message.includes('CDN')) {
        return {
          type: this.ERROR_TYPES.MEDIAPIPE,
          message: this.ERROR_MESSAGES.MEDIAPIPE_LOAD_ERROR,
          canRetry: true,
          originalError: error
        };
      }
      return {
        type: this.ERROR_TYPES.MEDIAPIPE,
        message: this.ERROR_MESSAGES.MEDIAPIPE_INIT_ERROR,
        canRetry: true,
        originalError: error
      };
    }
    
    if (error.message.includes('face') || error.message.includes('Face')) {
      return {
        type: this.ERROR_TYPES.MEDIAPIPE,
        message: this.ERROR_MESSAGES.FACE_NOT_DETECTED,
        canRetry: true,
        originalError: error
      };
    }
    
    // Default unknown error
    return {
      type: this.ERROR_TYPES.UNKNOWN,
      message: this.ERROR_MESSAGES.UNKNOWN_ERROR,
      canRetry: true,
      originalError: error
    };
  }
  
  /**
   * Handles an error with retry mechanism
   * @param {Error} error - The error to handle
   * @param {string} context - Context where the error occurred
   * @param {Function} retryCallback - Function to call when user clicks retry
   * @param {Function} showModalFn - Function to show modal (injected dependency)
   * @param {Object} options - Additional options
   * @returns {Object} Error information
   */
  static handleError(error, context, retryCallback, showModalFn, options = {}) {
    const errorInfo = this.classifyError(error, context);
    
    console.error(`[ErrorHandler] Handling ${errorInfo.type} error:`, errorInfo.message);
    
    // Build modal buttons
    const buttons = [];
    
    if (errorInfo.canRetry && retryCallback) {
      buttons.push({
        text: 'Retry',
        primary: true,
        onClick: retryCallback
      });
    }
    
    if (options.allowGoBack && options.goBackCallback) {
      buttons.push({
        text: 'Go Back',
        primary: false,
        onClick: options.goBackCallback
      });
    }
    
    if (buttons.length === 0) {
      buttons.push({
        text: 'OK',
        primary: true,
        onClick: () => {}
      });
    }
    
    // Show error modal
    if (showModalFn) {
      showModalFn('Error', errorInfo.message, buttons);
    }
    
    return errorInfo;
  }
  
  /**
   * Creates a retry wrapper for async functions with exponential backoff
   * Requirement 17.5: Retry logic with exponential backoff (3 retries: 1s, 2s, 4s)
   * @param {Function} asyncFn - Async function to retry
   * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
   * @param {number} initialDelay - Initial delay in milliseconds (default: 1000)
   * @returns {Function} Wrapped function with retry logic
   */
  static createRetryWrapper(asyncFn, maxRetries = 3, initialDelay = 1000) {
    return async function(...args) {
      let lastError;
      let delay = initialDelay;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await asyncFn(...args);
        } catch (error) {
          lastError = error;
          
          // Don't retry on last attempt
          if (attempt === maxRetries) {
            break;
          }
          
          // Classify error to determine if it's retryable
          const errorInfo = ErrorHandlerService.classifyError(error);
          
          // Don't retry if error is not retryable
          if (!errorInfo.canRetry) {
            break;
          }
          
          console.log(`[ErrorHandler] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
          
          // Wait before retrying with exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff: 1s, 2s, 4s
        }
      }
      
      // All retries failed, throw the last error
      throw lastError;
    };
  }
  
  /**
   * Retries a Squad API operation with exponential backoff
   * Requirement 17.5, 7.5, 7.6: Retry Squad API with exponential backoff (3 retries: 1s, 2s, 4s)
   * @param {Function} squadApiCall - Squad API function to retry
   * @param {Object} options - Retry options
   * @returns {Promise<Object>} Result from Squad API
   */
  static async retrySquadAPI(squadApiCall, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const initialDelay = options.initialDelay || 1000;
    const showToast = options.showToast !== false; // Default to true
    
    let lastError;
    let delay = initialDelay;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[ErrorHandler] Squad API attempt ${attempt + 1}/${maxRetries + 1}`);
        
        // Show loading indicator if toast service is available
        let loadingId;
        if (showToast && window.toastService && attempt > 0) {
          loadingId = window.toastService.showLoading(
            `Retrying... (${attempt}/${maxRetries})`
          );
        }
        
        const result = await squadApiCall();
        
        // Hide loading indicator
        if (loadingId && window.toastService) {
          window.toastService.hideLoading(loadingId);
        }
        
        // Check if result indicates an error
        if (result.success === false) {
          // Determine if error is retryable
          const isRetryable = result.errorType === 'server_error' || 
                             result.errorType === 'timeout' ||
                             result.errorType === 'network_error';
          
          if (!isRetryable || attempt === maxRetries) {
            // Not retryable or max retries reached
            if (showToast && window.toastService) {
              const message = window.toastService.mapSquadAPIError(result, result.statusCode || 500);
              window.toastService.showError(message);
            }
            return result;
          }
          
          // Retryable error, continue to next attempt
          lastError = new Error(result.message);
          lastError.result = result;
          
        } else {
          // Success
          return result;
        }
        
      } catch (error) {
        lastError = error;
        
        // Hide loading indicator if shown
        if (window.toastService) {
          // Hide any active loading indicators
          const loadingIndicators = Array.from(window.toastService.loadingIndicators.keys());
          loadingIndicators.forEach(id => window.toastService.hideLoading(id));
        }
        
        // Don't retry on last attempt
        if (attempt === maxRetries) {
          break;
        }
        
        // Classify error to determine if it's retryable
        const errorInfo = ErrorHandlerService.classifyError(error, 'squad_api');
        
        // Don't retry if error is not retryable
        if (!errorInfo.canRetry) {
          if (showToast && window.toastService) {
            window.toastService.showError(errorInfo.message);
          }
          throw error;
        }
      }
      
      // Wait before retrying with exponential backoff (1s, 2s, 4s)
      if (attempt < maxRetries) {
        console.log(`[ErrorHandler] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
    
    // All retries failed
    console.error('[ErrorHandler] All Squad API retries failed:', lastError);
    
    if (showToast && window.toastService) {
      const message = lastError.result 
        ? window.toastService.mapSquadAPIError(lastError.result, lastError.result.statusCode || 500)
        : 'Payment service unavailable. Please try again later.';
      window.toastService.showError(message);
    }
    
    // Return error result or throw
    if (lastError.result) {
      return lastError.result;
    }
    throw lastError;
  }
  
  /**
   * Validates network connectivity
   * @returns {Promise<boolean>} True if online, false otherwise
   */
  static async checkNetworkConnectivity() {
    if (!navigator.onLine) {
      return false;
    }
    
    try {
      // Try to fetch a small resource to verify connectivity
      const response = await fetch('https://www.google.com/favicon.ico', {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-cache'
      });
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Shows a network connectivity error
   * @param {Function} showModalFn - Function to show modal
   * @param {Function} retryCallback - Function to call on retry
   */
  static showNetworkError(showModalFn, retryCallback) {
    showModalFn('No Internet Connection', this.ERROR_MESSAGES.NETWORK_ERROR, [
      {
        text: 'Retry',
        primary: true,
        onClick: retryCallback
      }
    ]);
  }
  
  /**
   * Handles and displays an error using the toast notification service
   * @param {Error} error - Error to handle
   * @param {string} context - Context where error occurred ('squad_api', 'database', 'ai_engine', 'network')
   * @param {Object} options - Additional options
   * @returns {Object} Error information
   */
  static handleErrorWithToast(error, context = '', options = {}) {
    const errorInfo = this.classifyError(error, context);
    
    console.error(`[ErrorHandler] Handling ${errorInfo.type} error in context ${context}:`, errorInfo.message);
    
    // Show error toast if toast service is available
    if (window.toastService) {
      let message = errorInfo.message;
      
      // Map error based on context
      if (context === 'squad_api') {
        message = window.toastService.mapSquadAPIError(error, error.statusCode || 500);
      } else if (context === 'database') {
        message = window.toastService.mapTursoDBError(error);
      } else if (context === 'ai_engine') {
        message = window.toastService.mapAIEngineError(error);
      } else if (context === 'network') {
        message = window.toastService.mapNetworkError(error);
      }
      
      // Show error toast
      if (options.retryCallback && errorInfo.canRetry) {
        // Show error with retry option
        window.toastService.showErrorWithRetry(
          message,
          options.retryCallback,
          options.retryCount || 0,
          options.maxRetries || 3
        );
      } else {
        // Show simple error
        window.toastService.showError(message);
      }
    }
    
    return errorInfo;
  }
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.ErrorHandlerService = ErrorHandlerService;
}

// Export for use in Node.js (for testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ErrorHandlerService;
}
