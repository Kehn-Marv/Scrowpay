/**
 * InputValidationService - Input validation and sanitization for ScrowPay
 * 
 * This service provides:
 * - Client-side input validation before submission
 * - HTML/JavaScript sanitization to prevent XSS attacks
 * - SQL injection prevention through parameterized queries
 * - Input normalization and cleaning
 * 
 * Requirements: 19.3, 19.4
 */

class InputValidationService {
  constructor() {
    // XSS-dangerous HTML tags and attributes
    this.dangerousTags = ['script', 'iframe', 'object', 'embed', 'link', 'style', 'meta', 'base'];
    this.dangerousAttributes = ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur'];
    
    // SQL injection patterns (for detection/logging, not for filtering - use parameterized queries)
    this.sqlInjectionPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
      /(--|\;|\/\*|\*\/)/g,
      /(\bOR\b.*=.*)/gi,
      /(\bAND\b.*=.*)/gi,
      /('|"|\`)/g
    ];
  }
  
  /**
   * Sanitizes HTML content to prevent XSS attacks
   * Requirement 19.4: Sanitize user-generated content to prevent XSS
   * @param {string} input - Raw HTML input
   * @returns {string} Sanitized HTML
   */
  sanitizeHtml(input) {
    if (!input || typeof input !== 'string') {
      return '';
    }
    
    // Create a temporary div to parse HTML
    const div = document.createElement('div');
    div.textContent = input; // This escapes all HTML entities
    
    return div.innerHTML;
  }
  
  /**
   * Escapes HTML special characters
   * Requirement 19.4: Escape HTML/JavaScript
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }
    
    const htmlEscapeMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;'
    };
    
    return text.replace(/[&<>"'\/]/g, char => htmlEscapeMap[char]);
  }
  
  /**
   * Strips all HTML tags from input
   * @param {string} input - Input with potential HTML
   * @returns {string} Plain text without HTML tags
   */
  stripHtmlTags(input) {
    if (!input || typeof input !== 'string') {
      return '';
    }
    
    // Create a temporary div and use textContent to strip tags
    const div = document.createElement('div');
    div.innerHTML = input;
    return div.textContent || div.innerText || '';
  }
  
  /**
   * Validates and sanitizes transaction description
   * Requirement 19.3: Validate all inputs on client-side
   * @param {string} description - Transaction description
   * @returns {Object} { valid: boolean, sanitized: string, errors: string[] }
   */
  validateTransactionDescription(description) {
    const errors = [];
    
    if (!description || typeof description !== 'string') {
      errors.push('Description is required');
      return { valid: false, sanitized: '', errors };
    }
    
    // Strip HTML tags and trim
    const sanitized = this.stripHtmlTags(description).trim();
    
    // Validate length
    if (sanitized.length < 10) {
      errors.push('Description must be at least 10 characters');
    }
    
    if (sanitized.length > 500) {
      errors.push('Description must not exceed 500 characters');
    }
    
    // Check for suspicious SQL patterns (log for security monitoring)
    if (this.containsSqlInjectionPattern(sanitized)) {
      console.warn('[InputValidationService] Potential SQL injection attempt detected in description:', sanitized);
      errors.push('Description contains invalid characters');
    }
    
    return {
      valid: errors.length === 0,
      sanitized,
      errors
    };
  }
  
  /**
   * Validates transaction price
   * Requirement 19.3: Validate all inputs on client-side
   * @param {any} price - Price input
   * @returns {Object} { valid: boolean, value: number, errors: string[] }
   */
  validatePrice(price) {
    const errors = [];
    
    // Convert to number
    const numPrice = Number(price);
    
    if (isNaN(numPrice)) {
      errors.push('Price must be a valid number');
      return { valid: false, value: 0, errors };
    }
    
    if (numPrice < 100) {
      errors.push('Price must be at least ₦100');
    }
    
    if (numPrice > 10000000) {
      errors.push('Price must not exceed ₦10,000,000');
    }
    
    // Check for negative or zero
    if (numPrice <= 0) {
      errors.push('Price must be greater than zero');
    }
    
    return {
      valid: errors.length === 0,
      value: numPrice,
      errors
    };
  }
  
  /**
   * Validates delivery timeline
   * Requirement 19.3: Validate all inputs on client-side
   * @param {any} days - Delivery timeline in days
   * @returns {Object} { valid: boolean, value: number, errors: string[] }
   */
  validateDeliveryTimeline(days) {
    const errors = [];
    
    // Convert to integer
    const numDays = parseInt(days, 10);
    
    if (isNaN(numDays) || !Number.isInteger(numDays)) {
      errors.push('Delivery timeline must be a whole number');
      return { valid: false, value: 0, errors };
    }
    
    if (numDays < 1) {
      errors.push('Delivery timeline must be at least 1 day');
    }
    
    if (numDays > 90) {
      errors.push('Delivery timeline must not exceed 90 days');
    }
    
    return {
      valid: errors.length === 0,
      value: numDays,
      errors
    };
  }
  
  /**
   * Validates inspection window
   * Requirement 19.3: Validate all inputs on client-side
   * @param {any} days - Inspection window in days
   * @returns {Object} { valid: boolean, value: number, errors: string[] }
   */
  validateInspectionWindow(days) {
    const errors = [];
    
    // Convert to integer
    const numDays = parseInt(days, 10);
    
    if (isNaN(numDays) || !Number.isInteger(numDays)) {
      errors.push('Inspection window must be a whole number');
      return { valid: false, value: 0, errors };
    }
    
    if (numDays < 1) {
      errors.push('Inspection window must be at least 1 day');
    }
    
    if (numDays > 14) {
      errors.push('Inspection window must not exceed 14 days');
    }
    
    return {
      valid: errors.length === 0,
      value: numDays,
      errors
    };
  }
  
  /**
   * Validates phone number format
   * Requirement 19.3: Validate all inputs on client-side
   * @param {string} phone - Phone number
   * @returns {Object} { valid: boolean, sanitized: string, errors: string[] }
   */
  validatePhoneNumber(phone) {
    const errors = [];
    
    if (!phone || typeof phone !== 'string') {
      errors.push('Phone number is required');
      return { valid: false, sanitized: '', errors };
    }
    
    // Remove all non-digit characters
    const sanitized = phone.replace(/\D/g, '');
    
    // Check if it starts with country code (234) or local format (0)
    if (!sanitized.startsWith('234') && !sanitized.startsWith('0')) {
      errors.push('Phone number must start with +234 or 0');
    }
    
    // Validate length (11 digits for local, 13 for international)
    if (sanitized.startsWith('234') && sanitized.length !== 13) {
      errors.push('International phone number must be 13 digits (+234XXXXXXXXXX)');
    } else if (sanitized.startsWith('0') && sanitized.length !== 11) {
      errors.push('Local phone number must be 11 digits (0XXXXXXXXXX)');
    }
    
    return {
      valid: errors.length === 0,
      sanitized: sanitized.startsWith('234') ? `+${sanitized}` : sanitized,
      errors
    };
  }
  
  /**
   * Validates email address format
   * Requirement 19.3: Validate all inputs on client-side
   * @param {string} email - Email address
   * @returns {Object} { valid: boolean, sanitized: string, errors: string[] }
   */
  validateEmail(email) {
    const errors = [];
    
    if (!email || typeof email !== 'string') {
      errors.push('Email is required');
      return { valid: false, sanitized: '', errors };
    }
    
    // Trim and lowercase
    const sanitized = email.trim().toLowerCase();
    
    // Basic email regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!emailRegex.test(sanitized)) {
      errors.push('Invalid email format');
    }
    
    // Check for suspicious patterns
    if (this.containsSqlInjectionPattern(sanitized)) {
      console.warn('[InputValidationService] Potential SQL injection attempt detected in email:', sanitized);
      errors.push('Email contains invalid characters');
    }
    
    return {
      valid: errors.length === 0,
      sanitized,
      errors
    };
  }
  
  /**
   * Validates transaction ID format
   * Requirement 19.3: Validate all inputs on client-side
   * @param {string} transactionId - Transaction ID
   * @returns {Object} { valid: boolean, sanitized: string, errors: string[] }
   */
  validateTransactionId(transactionId) {
    const errors = [];
    
    if (!transactionId || typeof transactionId !== 'string') {
      errors.push('Transaction ID is required');
      return { valid: false, sanitized: '', errors };
    }
    
    // Trim and uppercase
    const sanitized = transactionId.trim().toUpperCase();
    
    // Check format: TXN-{UUID}
    const txnRegex = /^TXN-[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
    
    if (!txnRegex.test(sanitized)) {
      errors.push('Invalid transaction ID format');
    }
    
    return {
      valid: errors.length === 0,
      sanitized,
      errors
    };
  }
  
  /**
   * Validates dispute description
   * Requirement 19.3: Validate all inputs on client-side
   * @param {string} description - Dispute description
   * @returns {Object} { valid: boolean, sanitized: string, errors: string[] }
   */
  validateDisputeDescription(description) {
    const errors = [];
    
    if (!description || typeof description !== 'string') {
      errors.push('Dispute description is required');
      return { valid: false, sanitized: '', errors };
    }
    
    // Strip HTML tags and trim
    const sanitized = this.stripHtmlTags(description).trim();
    
    // Validate length
    if (sanitized.length < 20) {
      errors.push('Dispute description must be at least 20 characters');
    }
    
    if (sanitized.length > 1000) {
      errors.push('Dispute description must not exceed 1000 characters');
    }
    
    // Check for suspicious SQL patterns
    if (this.containsSqlInjectionPattern(sanitized)) {
      console.warn('[InputValidationService] Potential SQL injection attempt detected in dispute:', sanitized);
      errors.push('Description contains invalid characters');
    }
    
    return {
      valid: errors.length === 0,
      sanitized,
      errors
    };
  }
  
  /**
   * Checks if input contains SQL injection patterns
   * Requirement 19.4: Prevent SQL injection
   * @private
   * @param {string} input - Input to check
   * @returns {boolean} True if suspicious patterns detected
   */
  containsSqlInjectionPattern(input) {
    if (!input || typeof input !== 'string') {
      return false;
    }
    
    // Check against known SQL injection patterns
    return this.sqlInjectionPatterns.some(pattern => pattern.test(input));
  }
  
  /**
   * Validates complete transaction creation form
   * Requirement 19.3: Validate all inputs on client-side before submission
   * @param {Object} formData - Form data object
   * @returns {Object} { valid: boolean, sanitized: Object, errors: Object }
   */
  validateTransactionForm(formData) {
    const errors = {};
    const sanitized = {};
    
    // Validate description
    const descResult = this.validateTransactionDescription(formData.itemDescription);
    if (!descResult.valid) {
      errors.itemDescription = descResult.errors;
    }
    sanitized.itemDescription = descResult.sanitized;
    
    // Validate price
    const priceResult = this.validatePrice(formData.price);
    if (!priceResult.valid) {
      errors.price = priceResult.errors;
    }
    sanitized.price = priceResult.value;
    
    // Validate delivery timeline
    const deliveryResult = this.validateDeliveryTimeline(formData.deliveryTimelineDays);
    if (!deliveryResult.valid) {
      errors.deliveryTimelineDays = deliveryResult.errors;
    }
    sanitized.deliveryTimelineDays = deliveryResult.value;
    
    // Validate inspection window
    const inspectionResult = this.validateInspectionWindow(formData.inspectionWindowDays);
    if (!inspectionResult.valid) {
      errors.inspectionWindowDays = inspectionResult.errors;
    }
    sanitized.inspectionWindowDays = inspectionResult.value;
    
    // Add seller ID (no validation needed, comes from session)
    sanitized.sellerId = formData.sellerId;

    // Pass-through dual-axis (Buyer/Seller initiator) metadata if present.
    // These come from the session/UI and don't require additional sanitisation.
    if (formData.buyerId !== undefined) sanitized.buyerId = formData.buyerId;
    if (formData.initiatorId !== undefined) sanitized.initiatorId = formData.initiatorId;
    if (formData.initiatorRole === 'buyer' || formData.initiatorRole === 'seller') {
      sanitized.initiatorRole = formData.initiatorRole;
    }
    if (Array.isArray(formData.proofUrls)) {
      // Filter out anything that isn't a string data URI / URL
      sanitized.proofUrls = formData.proofUrls.filter(u => typeof u === 'string' && u.length > 0);
    }
    
    return {
      valid: Object.keys(errors).length === 0,
      sanitized,
      errors
    };
  }
  
  /**
   * Prepares SQL query parameters to prevent SQL injection
   * Requirement 19.4: Use parameterized queries for all database operations
   * @param {Array} params - Array of parameters
   * @returns {Array} Sanitized parameters
   */
  prepareSqlParameters(params) {
    if (!Array.isArray(params)) {
      return [];
    }
    
    return params.map(param => {
      // Convert to appropriate type
      if (param === null || param === undefined) {
        return null;
      }
      
      if (typeof param === 'number') {
        return param;
      }
      
      if (typeof param === 'boolean') {
        return param ? 1 : 0;
      }
      
      // For strings, ensure they're properly escaped (though parameterized queries handle this)
      if (typeof param === 'string') {
        // Log if suspicious patterns detected
        if (this.containsSqlInjectionPattern(param)) {
          console.warn('[InputValidationService] Suspicious SQL pattern in parameter:', param);
        }
        return param;
      }
      
      // Convert objects to JSON strings
      if (typeof param === 'object') {
        return JSON.stringify(param);
      }
      
      return String(param);
    });
  }
  
  /**
   * Validates and sanitizes search query input
   * Requirement 19.3: Validate all inputs on client-side
   * @param {string} query - Search query
   * @returns {Object} { valid: boolean, sanitized: string, errors: string[] }
   */
  validateSearchQuery(query) {
    const errors = [];
    
    if (!query || typeof query !== 'string') {
      errors.push('Search query is required');
      return { valid: false, sanitized: '', errors };
    }
    
    // Strip HTML and trim
    const sanitized = this.stripHtmlTags(query).trim();
    
    // Validate length
    if (sanitized.length < 1) {
      errors.push('Search query must not be empty');
    }
    
    if (sanitized.length > 100) {
      errors.push('Search query must not exceed 100 characters');
    }
    
    // Check for SQL injection patterns
    if (this.containsSqlInjectionPattern(sanitized)) {
      console.warn('[InputValidationService] Potential SQL injection in search query:', sanitized);
      errors.push('Search query contains invalid characters');
    }
    
    return {
      valid: errors.length === 0,
      sanitized,
      errors
    };
  }
  
  /**
   * Sanitizes URL to prevent XSS through href attributes
   * Requirement 19.4: Sanitize user-generated content to prevent XSS
   * @param {string} url - URL to sanitize
   * @returns {string} Sanitized URL or empty string if dangerous
   */
  sanitizeUrl(url) {
    if (!url || typeof url !== 'string') {
      return '';
    }
    
    const trimmed = url.trim().toLowerCase();
    
    // Block javascript: and data: URLs (XSS vectors)
    if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:')) {
      console.warn('[InputValidationService] Blocked dangerous URL:', url);
      return '';
    }
    
    // Only allow http, https, and relative URLs
    if (!trimmed.startsWith('http://') && 
        !trimmed.startsWith('https://') && 
        !trimmed.startsWith('/') &&
        !trimmed.startsWith('./')) {
      console.warn('[InputValidationService] Blocked non-standard URL:', url);
      return '';
    }
    
    return url.trim();
  }
  
  /**
   * Validates file upload (for dispute photos)
   * Requirement 19.3: Validate all inputs on client-side
   * @param {File} file - File object
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  validateFileUpload(file) {
    const errors = [];
    
    if (!file) {
      errors.push('File is required');
      return { valid: false, errors };
    }
    
    // Check file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      errors.push('File size must not exceed 5MB');
    }
    
    // Check file type (only images)
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      errors.push('File must be an image (JPEG, PNG, GIF, or WebP)');
    }
    
    // Check filename for suspicious patterns
    if (this.containsSqlInjectionPattern(file.name)) {
      console.warn('[InputValidationService] Suspicious filename:', file.name);
      errors.push('Filename contains invalid characters');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Create global instance
if (typeof window !== 'undefined') {
  window.inputValidationService = new InputValidationService();
  window.InputValidationService = InputValidationService;
}

// Export for use in Node.js (for testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = InputValidationService;
}
