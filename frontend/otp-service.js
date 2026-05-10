/**
 * OTPService - OTP verification service for ScrowPay Account Creation
 * 
 * This service provides OTP verification functionality.
 * For the hackathon implementation, it uses a hardcoded OTP value ("123456")
 * to simplify the implementation and avoid SMS integration complexity.
 * 
 * Requirements: 2.7, 2.8, 18.4
 */

class OTPService {
  /**
   * Verifies an OTP code against the hardcoded correct value
   * 
   * @param {string} otp - The OTP code to verify
   * @returns {boolean} True if OTP is "123456", false for all other inputs
   * 
   * @example
   * OTPService.verifyOTP("123456"); // returns true
   * OTPService.verifyOTP("000000"); // returns false
   * OTPService.verifyOTP("654321"); // returns false
   */
  static verifyOTP(otp) {
    // Hardcoded correct OTP for hackathon implementation
    const CORRECT_OTP = "123456";
    
    // Validate input
    if (!otp || typeof otp !== 'string') {
      return false;
    }
    
    // Return true only if OTP matches the hardcoded value
    return otp === CORRECT_OTP;
  }
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.OTPService = OTPService;
}
