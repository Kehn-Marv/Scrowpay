/**
 * IDValidationService - ID validation service for ScrowPay Account Creation
 * 
 * This service provides validation functionality for BVN (Bank Verification Number)
 * and NIN (National Identification Number) format validation.
 * 
 * Requirements: 3.6, 3.7
 */

class IDValidationService {
  /**
   * Validates a BVN (Bank Verification Number)
   * BVN must be exactly 11 digits and start with 1 or 2
   * 
   * @param {string} bvn - The BVN to validate
   * @returns {Object} Validation result with isValid boolean and error message
   * 
   * @example
   * IDValidationService.validateBVN("12345678901"); // returns { isValid: true, error: null }
   * IDValidationService.validateBVN("22345678901"); // returns { isValid: true, error: null }
   * IDValidationService.validateBVN("32345678901"); // returns { isValid: false, error: "BVN must start with 1 or 2" }
   * IDValidationService.validateBVN("1234567890");  // returns { isValid: false, error: "BVN must be exactly 11 digits" }
   */
  static validateBVN(bvn) {
    // Validate input exists and is a string
    if (!bvn || typeof bvn !== 'string') {
      return {
        isValid: false,
        error: 'BVN is required'
      };
    }
    
    // Remove any whitespace
    const cleanBVN = bvn.trim();
    
    // Check if it's exactly 11 digits
    if (!/^\d{11}$/.test(cleanBVN)) {
      return {
        isValid: false,
        error: 'BVN must be exactly 11 digits'
      };
    }
    
    // Check if it starts with 1 or 2
    const firstDigit = cleanBVN.charAt(0);
    if (firstDigit !== '1' && firstDigit !== '2') {
      return {
        isValid: false,
        error: 'BVN must start with 1 or 2'
      };
    }
    
    // All validations passed
    return {
      isValid: true,
      error: null
    };
  }
  
  /**
   * Validates a NIN (National Identification Number)
   * NIN must be exactly 11 digits (no specific starting digit requirement)
   * 
   * @param {string} nin - The NIN to validate
   * @returns {Object} Validation result with isValid boolean and error message
   * 
   * @example
   * IDValidationService.validateNIN("12345678901"); // returns { isValid: true, error: null }
   * IDValidationService.validateNIN("98765432109"); // returns { isValid: true, error: null }
   * IDValidationService.validateNIN("1234567890");  // returns { isValid: false, error: "NIN must be exactly 11 digits" }
   * IDValidationService.validateNIN("123456789ab"); // returns { isValid: false, error: "NIN must be exactly 11 digits" }
   */
  static validateNIN(nin) {
    // Validate input exists and is a string
    if (!nin || typeof nin !== 'string') {
      return {
        isValid: false,
        error: 'NIN is required'
      };
    }
    
    // Remove any whitespace
    const cleanNIN = nin.trim();
    
    // Check if it's exactly 11 digits
    if (!/^\d{11}$/.test(cleanNIN)) {
      return {
        isValid: false,
        error: 'NIN must be exactly 11 digits'
      };
    }
    
    // All validations passed
    return {
      isValid: true,
      error: null
    };
  }
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.IDValidationService = IDValidationService;
}
