/**
 * SquadVirtualAccountService - Squad Virtual Account API integration for ScrowPay
 * 
 * This service creates virtual accounts for users using Squad's Virtual Account API.
 * When a virtual account is created, Squad validates the BVN against NIBSS registry
 * for name, DOB, gender, and phone number - providing built-in identity verification.
 * 
 * Each user gets a real NUBAN account number that can receive payments.
 * 
 * Requirements: 5.1, 5.2, 15.1, 15.2, 15.3, 15.4, 15.5
 */

class SquadVirtualAccountService {
  /**
   * Creates a new SquadVirtualAccountService instance
   * @param {string} secretKey - Squad API secret key for authentication
   * @param {string} environment - 'sandbox' or 'production'
   */
  constructor(secretKey, environment = 'sandbox') {
    this.secretKey = secretKey;
    this.environment = environment;
    this.baseUrl = environment === 'production' 
      ? 'https://api-d.squadco.com'
      : 'https://sandbox-api-d.squadco.com';
  }
  
  /**
   * Creates a virtual account for a customer
   * 
   * This endpoint validates BVN against NIBSS registry. If any details don't match
   * (name, DOB, gender, phone), the account will NOT be created.
   * 
   * @param {Object} customerData - Customer data for virtual account creation
   * @param {string} customerData.customer_identifier - Unique identifier (e.g., phone number or UUID)
   * @param {string} customerData.first_name - Customer's first name (must match BVN)
   * @param {string} customerData.last_name - Customer's last name (must match BVN)
   * @param {string} customerData.middle_name - Customer's middle name (optional)
   * @param {string} customerData.mobile_num - Phone number without +234 (e.g., "08135866028")
   * @param {string} customerData.email - Customer's email address
   * @param {string} customerData.bvn - 11-digit BVN
   * @param {string} customerData.dob - Date of birth in MM/DD/YYYY format (must match BVN)
   * @param {string} customerData.gender - '1' for Male, '2' for Female (must match BVN)
   * @param {string} customerData.address - Customer's address
   * @param {string} customerData.beneficiary_account - Optional GTBank account for settlement
   * 
   * @returns {Promise<Object>} Result object with success status, message, and data
   * 
   * @example
   * const service = new SquadVirtualAccountService('secret_key');
   * const result = await service.createVirtualAccount({
   *   customer_identifier: '+2348135866028',
   *   first_name: 'John',
   *   last_name: 'Doe',
   *   mobile_num: '08135866028',
   *   email: 'john@example.com',
   *   bvn: '12345678901',
   *   dob: '07/19/1990',
   *   gender: '1',
   *   address: '123 Main St, Lagos'
   * });
   */
  async createVirtualAccount(customerData) {
    try {
      console.log('[SquadVirtualAccountService] Creating virtual account for:', customerData.customer_identifier);
      console.log('[SquadVirtualAccountService] Using environment:', this.environment);
      console.log('[SquadVirtualAccountService] Base URL:', this.baseUrl);
      console.log('[SquadVirtualAccountService] Request payload:', JSON.stringify(customerData, null, 2));
      
      // Create abort controller for timeout (Requirement 17.1)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 second timeout (BVN validation can take time)
      
      try {
        // Make API request to Squad Virtual Account endpoint
        const response = await fetch(`${this.baseUrl}/virtual-account`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.secretKey}`
          },
          body: JSON.stringify(customerData),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // Parse response
        const data = await response.json();
        
        console.log('[SquadVirtualAccountService] HTTP Status:', response.status);
        console.log('[SquadVirtualAccountService] API Response:', JSON.stringify(data, null, 2));
        
        // Check if request was successful
        if (!response.ok) {
          console.error('[SquadVirtualAccountService] Virtual account creation failed:', data);
          
          // Handle specific HTTP status codes
          if (response.status >= 500) {
            return {
              success: false,
              message: 'Account creation service is temporarily unavailable. Please try again later.',
              data: null,
              errorType: 'server_error'
            };
          }
          
          if (response.status === 401 || response.status === 403) {
            return {
              success: false,
              message: 'Authentication failed. Please contact support.',
              data: null,
              errorType: 'auth_error'
            };
          }
          
          // BVN validation failure
          if (response.status === 400 || response.status === 424) {
            // Check if it's a BVN mismatch error
            if (data.message && (
              data.message.includes('BVN') || 
              data.message.includes('validation') ||
              data.message.includes('match') ||
              data.message.includes('record')
            )) {
              return {
                success: false,
                message: 'Identity verification failed. The information provided does not match your BVN records. Please verify your details and try again.',
                data: null,
                errorType: 'bvn_mismatch'
              };
            }
            
            return {
              success: false,
              message: data.message || 'Account creation failed. Please check your details and try again.',
              data: null,
              errorType: 'validation_error'
            };
          }
          
          return {
            success: false,
            message: data.message || 'Account creation failed',
            data: null,
            errorType: 'unknown_error'
          };
        }
        
        // Check Squad API response status
        if (data.success === true && data.data) {
          console.log('[SquadVirtualAccountService] ✅ Virtual account created successfully');
          console.log('[SquadVirtualAccountService] Account Number:', data.data.virtual_account_number);
          
          return {
            success: true,
            message: data.message || 'Account created successfully',
            data: {
              virtual_account_number: data.data.virtual_account_number,
              bank_code: data.data.bank_code,
              customer_identifier: data.data.customer_identifier,
              first_name: data.data.first_name,
              last_name: data.data.last_name,
              beneficiary_account: data.data.beneficiary_account,
              created_at: data.data.created_at
            }
          };
        } else {
          console.error('[SquadVirtualAccountService] Virtual account creation failed:', data);
          return {
            success: false,
            message: data.message || 'Account creation failed',
            data: null,
            errorType: 'creation_failed'
          };
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
      
    } catch (error) {
      console.error('[SquadVirtualAccountService] Virtual account creation error:', error);
      
      // Handle timeout errors (Requirement 17.1)
      if (error.name === 'AbortError') {
        return {
          success: false,
          message: 'Account creation request timed out. This may be due to BVN validation taking longer than expected. Please try again.',
          data: null,
          errorType: 'timeout'
        };
      }
      
      // Handle network errors (Requirement 17.1)
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        return {
          success: false,
          message: 'Unable to create account. Please check your internet connection and try again.',
          data: null,
          errorType: 'network_error'
        };
      }
      
      // Generic error
      return {
        success: false,
        message: 'An error occurred during account creation. Please try again.',
        data: null,
        errorType: 'unknown_error'
      };
    }
  }
  
  /**
   * Gets customer details by virtual account number
   * @param {string} virtualAccountNumber - 10-digit virtual account number
   * @returns {Promise<Object>} Customer details
   */
  async getCustomerByVirtualAccount(virtualAccountNumber) {
    try {
      const response = await fetch(`${this.baseUrl}/virtual-account/customer/${virtualAccountNumber}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.secretKey}`
        }
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        return {
          success: true,
          data: data.data
        };
      }
      
      return {
        success: false,
        message: data.message || 'Customer not found'
      };
    } catch (error) {
      console.error('[SquadVirtualAccountService] Get customer error:', error);
      return {
        success: false,
        message: 'Failed to retrieve customer details'
      };
    }
  }
  
  /**
   * Gets customer details by customer identifier
   * @param {string} customerIdentifier - Unique customer identifier
   * @returns {Promise<Object>} Customer details including virtual account number
   */
  async getCustomerByIdentifier(customerIdentifier) {
    try {
      const response = await fetch(`${this.baseUrl}/virtual-account/${customerIdentifier}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.secretKey}`
        }
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        return {
          success: true,
          data: data.data
        };
      }
      
      return {
        success: false,
        message: data.message || 'Customer not found'
      };
    } catch (error) {
      console.error('[SquadVirtualAccountService] Get customer error:', error);
      return {
        success: false,
        message: 'Failed to retrieve customer details'
      };
    }
  }
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.SquadVirtualAccountService = SquadVirtualAccountService;
  // Keep backward compatibility
  window.SquadAPIService = SquadVirtualAccountService;
}
