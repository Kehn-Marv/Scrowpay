/**
 * PINService - Handles PIN validation and secure hashing
 * 
 * This service provides methods for:
 * - Validating PIN format and security rules
 * - Hashing PINs using Web Crypto API SHA-256
 * - Verifying PINs against stored hashes
 */
class PINService {
  /**
   * Validates a PIN according to security rules
   * 
   * Rules:
   * - Exactly 6 digits
   * - No all-same digits (e.g., "111111", "000000")
   * - No simple sequences like "123456", "654321", "012345"
   * - No obvious patterns like "112233", "445566"
   * 
   * @param {string} pin - The PIN to validate
   * @returns {Object} Validation result with isValid boolean and error message
   */
  static validatePIN(pin) {
    // Check if PIN is exactly 6 digits
    if (!pin || pin.length !== 6) {
      return {
        isValid: false,
        error: 'Please enter a 6-digit PIN'
      };
    }

    // Check if all characters are digits
    if (!/^\d+$/.test(pin)) {
      return {
        isValid: false,
        error: 'PIN must contain only digits'
      };
    }

    // Check for all same digits (e.g., 111111, 000000)
    const allSame = new Set(pin).size === 1;
    if (allSame) {
      return {
        isValid: false,
        error: 'PIN cannot be all the same digit (e.g., 111111)'
      };
    }

    // Check for simple ascending sequences (e.g., 123456, 012345)
    const isAscendingSequence = pin === '012345' || pin === '123456' || pin === '234567' || 
                                 pin === '345678' || pin === '456789';
    if (isAscendingSequence) {
      return {
        isValid: false,
        error: 'PIN cannot be a simple sequence (e.g., 123456, 012345)'
      };
    }

    // Check for simple descending sequences (e.g., 654321, 987654)
    const isDescendingSequence = pin === '987654' || pin === '876543' || pin === '765432' || 
                                   pin === '654321' || pin === '543210';
    if (isDescendingSequence) {
      return {
        isValid: false,
        error: 'PIN cannot be a simple sequence (e.g., 654321, 987654)'
      };
    }

    // Check for obvious paired patterns (e.g., 112233, 445566, 009988)
    const isPairedPattern = /^(\d)\1(\d)\2(\d)\3$/.test(pin);
    if (isPairedPattern) {
      return {
        isValid: false,
        error: 'PIN cannot be a simple pattern (e.g., 112233, 445566)'
      };
    }

    return {
      isValid: true,
      error: null
    };
  }

  /**
   * Hashes a PIN using Web Crypto API SHA-256 with salt
   * 
   * @param {string} pin - The PIN to hash
   * @param {string} salt - Salt value (typically user's phone number)
   * @returns {Promise<string>} Hex-encoded hash string
   */
  static async hashPIN(pin, salt) {
    if (!pin || !salt) {
      throw new Error('PIN and salt are required for hashing');
    }

    // Combine PIN with salt
    const saltedPin = pin + salt;

    // Convert string to Uint8Array
    const encoder = new TextEncoder();
    const data = encoder.encode(saltedPin);

    // Hash using SHA-256
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    // Convert ArrayBuffer to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');

    return hashHex;
  }

  /**
   * Verifies a PIN against a stored hash
   * 
   * @param {string} pin - The PIN to verify
   * @param {string} salt - Salt value (typically user's phone number)
   * @param {string} storedHash - The stored hash to compare against
   * @returns {Promise<boolean>} True if PIN matches, false otherwise
   */
  static async verifyPIN(pin, salt, storedHash) {
    if (!pin || !salt || !storedHash) {
      return false;
    }

    try {
      // Hash the provided PIN with the same salt
      const computedHash = await this.hashPIN(pin, salt);

      // Compare hashes using constant-time comparison to prevent timing attacks
      return computedHash === storedHash;
    } catch (error) {
      console.error('Error verifying PIN:', error);
      return false;
    }
  }
}

// Export for use in other modules (if using ES6 modules)
// export default PINService;
