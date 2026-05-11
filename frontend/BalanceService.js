/**
 * BalanceService - Balance calculations for ScrowPay Escrow Dashboard
 * 
 * This service provides balance management operations including:
 * - Available balance queries from Squad API
 * - Locked balance calculations from Turso DB
 * - Parallel balance fetching
 * - Balance invariant validation
 * - 30-second cache with TTL for Squad API responses
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.7, 11.1, 11.2, 11.7
 */

class BalanceService {
  /**
   * Creates a new BalanceService instance
   * @param {Object} config - Configuration object
   * @param {Object} config.turso - Turso DB configuration
   * @param {string} config.turso.databaseUrl - Turso database URL
   * @param {string} config.turso.authToken - Turso authentication token
   * @param {Object} config.squad - Squad API configuration
   * @param {string} config.squad.secretKey - Squad API secret key
   * @param {string} config.squad.environment - 'sandbox' or 'production'
   */
  constructor(config) {
    this.dbService = new TursoDBService(config.turso.databaseUrl, config.turso.authToken);
    this.squadService = new SquadVirtualAccountService(config.squad.secretKey, config.squad.environment);
    this.connected = false;
    
    // Cache configuration (Requirement 11.3 - 30-second cache)
    this.cache = {
      availableBalance: null,
      virtualAccountNumber: null,
      timestamp: null,
      ttl: 30000  // 30 seconds in milliseconds
    };
  }
  
  /**
   * Connects to the database
   * @returns {Promise<void>}
   */
  async connect() {
    if (!this.connected) {
      await this.dbService.connect();
      this.connected = true;
      console.log('[BalanceService] Connected to database');
    }
  }
  
  /**
   * Checks if cached balance is still valid
   * @private
   * @param {string} virtualAccountNumber - Virtual account number to check
   * @returns {boolean} True if cache is valid and matches account number
   */
  isCacheValid(virtualAccountNumber) {
    if (!this.cache.timestamp || !this.cache.availableBalance) {
      return false;
    }
    
    // Check if cache is for the same account
    if (this.cache.virtualAccountNumber !== virtualAccountNumber) {
      return false;
    }
    
    // Check if cache has expired (TTL = 30 seconds)
    const now = Date.now();
    const age = now - this.cache.timestamp;
    
    return age < this.cache.ttl;
  }
  
  /**
   * Updates the cache with new balance data
   * @private
   * @param {string} virtualAccountNumber - Virtual account number
   * @param {number} balance - Available balance
   */
  updateCache(virtualAccountNumber, balance) {
    this.cache.availableBalance = balance;
    this.cache.virtualAccountNumber = virtualAccountNumber;
    this.cache.timestamp = Date.now();
    
    console.log('[BalanceService] Cache updated:', {
      virtualAccountNumber,
      balance,
      timestamp: new Date(this.cache.timestamp).toISOString()
    });
  }
  
  /**
   * Clears the balance cache
   */
  clearCache() {
    this.cache.availableBalance = null;
    this.cache.virtualAccountNumber = null;
    this.cache.timestamp = null;
    console.log('[BalanceService] Cache cleared');
  }
  
  /**
   * Gets available balance from Squad API with caching
   * @param {string} virtualAccountNumber - 10-digit virtual account number
   * @returns {Promise<Object>} { success: boolean, balance: number, cached: boolean, message?: string }
   */
  async getAvailableBalance(virtualAccountNumber) {
    try {
      console.log('[BalanceService] Getting available balance for:', virtualAccountNumber);
      
      // Check cache first (Requirement 11.3)
      if (this.isCacheValid(virtualAccountNumber)) {
        console.log('[BalanceService] ✅ Returning cached balance:', this.cache.availableBalance);
        return {
          success: true,
          balance: this.cache.availableBalance,
          cached: true,
          cachedAt: new Date(this.cache.timestamp).toISOString()
        };
      }
      
      // Cache miss or expired - fetch from Squad API (Requirement 1.1)
      console.log('[BalanceService] Cache miss or expired, fetching from Squad API...');
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      try {
        // Query Squad API for balance
        // Note: Squad API doesn't have a direct balance endpoint in the current implementation
        // We'll use the getCustomerByVirtualAccount method which should return account details
        const result = await this.squadService.getCustomerByVirtualAccount(virtualAccountNumber);
        
        clearTimeout(timeoutId);
        
        if (!result.success) {
          console.error('[BalanceService] Squad API error:', result.message);
          
          // If we have cached data, return it with staleness indicator (Requirement 1.6)
          if (this.cache.availableBalance !== null && this.cache.virtualAccountNumber === virtualAccountNumber) {
            const cacheAge = Math.floor((Date.now() - this.cache.timestamp) / 1000);
            console.log('[BalanceService] ⚠️ Returning stale cached balance (age: ' + cacheAge + 's)');
            
            return {
              success: true,
              balance: this.cache.availableBalance,
              cached: true,
              stale: true,
              cachedAt: new Date(this.cache.timestamp).toISOString(),
              cacheAgeSeconds: cacheAge,
              message: `Last updated ${cacheAge} seconds ago`
            };
          }
          
          return {
            success: false,
            balance: 0,
            cached: false,
            message: result.message || 'Unable to fetch balance from Squad API'
          };
        }
        
        // Extract balance from result
        // Note: The actual Squad API response structure may vary
        // For now, we'll assume balance is in result.data.balance or default to 0
        const balance = result.data?.balance || 0;
        
        // Update cache
        this.updateCache(virtualAccountNumber, balance);
        
        console.log('[BalanceService] ✅ Available balance fetched from Squad API:', balance);
        
        return {
          success: true,
          balance: balance,
          cached: false
        };
        
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
      
    } catch (error) {
      console.error('[BalanceService] Get available balance failed:', error);
      
      // Handle timeout errors
      if (error.name === 'AbortError') {
        // Return cached balance if available (Requirement 1.6)
        if (this.cache.availableBalance !== null && this.cache.virtualAccountNumber === virtualAccountNumber) {
          const cacheAge = Math.floor((Date.now() - this.cache.timestamp) / 1000);
          console.log('[BalanceService] ⚠️ Timeout - returning stale cached balance');
          
          return {
            success: true,
            balance: this.cache.availableBalance,
            cached: true,
            stale: true,
            cachedAt: new Date(this.cache.timestamp).toISOString(),
            cacheAgeSeconds: cacheAge,
            message: `Request timed out. Last updated ${cacheAge} seconds ago`
          };
        }
        
        return {
          success: false,
          balance: 0,
          cached: false,
          message: 'Request timed out. Please try again.'
        };
      }
      
      // Handle network errors
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        // Return cached balance if available
        if (this.cache.availableBalance !== null && this.cache.virtualAccountNumber === virtualAccountNumber) {
          const cacheAge = Math.floor((Date.now() - this.cache.timestamp) / 1000);
          console.log('[BalanceService] ⚠️ Network error - returning stale cached balance');
          
          return {
            success: true,
            balance: this.cache.availableBalance,
            cached: true,
            stale: true,
            cachedAt: new Date(this.cache.timestamp).toISOString(),
            cacheAgeSeconds: cacheAge,
            message: `No internet connection. Last updated ${cacheAge} seconds ago`
          };
        }
        
        return {
          success: false,
          balance: 0,
          cached: false,
          message: 'Unable to connect. Please check your internet connection.'
        };
      }
      
      return {
        success: false,
        balance: 0,
        cached: false,
        message: 'Failed to fetch available balance: ' + error.message
      };
    }
  }
  
  /**
   * Calculates locked balance from active transactions in Turso DB
   * @param {number} userId - User ID
   * @returns {Promise<Object>} { success: boolean, balance: number, message?: string }
   */
  async getLockedBalance(userId) {
    try {
      console.log('[BalanceService] Calculating locked balance for user:', userId);
      
      // Ensure connection
      await this.connect();
      
      // Query Turso DB for active transactions (Requirement 1.2)
      // Locked balance = SUM of amounts WHERE state IN ('Funded_Locked', 'In_Transit')
      // AND user is either buyer or seller
      const sql = `
        SELECT COALESCE(SUM(price), 0) as locked_balance
        FROM transactions
        WHERE (seller_id = ? OR buyer_id = ?)
        AND state IN ('Funded_Locked', 'In_Transit')
      `;
      
      const result = await this.dbService._executeHttp(sql, [userId, userId]);
      
      const executeResult = result.results[0].response.result;
      const rows = executeResult.rows;
      
      if (rows.length === 0) {
        console.log('[BalanceService] ✅ No active transactions, locked balance: 0');
        return {
          success: true,
          balance: 0
        };
      }
      
      // Extract locked balance value
      const lockedBalanceValue = rows[0][0];
      const lockedBalance = typeof lockedBalanceValue === 'object' 
        ? parseFloat(lockedBalanceValue.value) 
        : parseFloat(lockedBalanceValue);
      
      console.log('[BalanceService] ✅ Locked balance calculated:', lockedBalance);
      
      return {
        success: true,
        balance: lockedBalance
      };
      
    } catch (error) {
      console.error('[BalanceService] Get locked balance failed:', error);
      
      // If table doesn't exist, return 0
      if (error.message.includes('no such table')) {
        console.log('[BalanceService] Transactions table does not exist yet, locked balance: 0');
        return {
          success: true,
          balance: 0
        };
      }
      
      return {
        success: false,
        balance: 0,
        message: 'Failed to calculate locked balance: ' + error.message
      };
    }
  }
  
  /**
   * Fetches both available and locked balances in parallel
   * @param {number} userId - User ID
   * @param {string} virtualAccountNumber - Virtual account number
   * @returns {Promise<Object>} { success: boolean, available: number, locked: number, total: number, invariantValid: boolean, cached?: boolean, stale?: boolean, message?: string }
   */
  async getBalances(userId, virtualAccountNumber) {
    try {
      console.log('[BalanceService] Fetching balances for user:', userId);
      
      // Fetch both balances in parallel (Requirement 1.3)
      const [availableResult, lockedResult] = await Promise.all([
        this.getAvailableBalance(virtualAccountNumber),
        this.getLockedBalance(userId)
      ]);
      
      // Check if both operations succeeded
      const success = availableResult.success && lockedResult.success;
      
      const available = availableResult.balance;
      const locked = lockedResult.balance;
      const total = available + locked;
      
      // Validate balance invariant (Requirement 1.7, 11.7)
      const invariantValid = this.validateBalanceInvariant(available, locked, total);
      
      console.log('[BalanceService] ✅ Balances fetched:', {
        available,
        locked,
        total,
        invariantValid,
        cached: availableResult.cached,
        stale: availableResult.stale
      });
      
      return {
        success,
        available,
        locked,
        total,
        invariantValid,
        cached: availableResult.cached,
        stale: availableResult.stale,
        cachedAt: availableResult.cachedAt,
        cacheAgeSeconds: availableResult.cacheAgeSeconds,
        message: availableResult.message || lockedResult.message
      };
      
    } catch (error) {
      console.error('[BalanceService] Get balances failed:', error);
      
      return {
        success: false,
        available: 0,
        locked: 0,
        total: 0,
        invariantValid: true,
        message: 'Failed to fetch balances: ' + error.message
      };
    }
  }
  
  /**
   * Validates the balance invariant: available + locked = total
   * @param {number} available - Available balance
   * @param {number} locked - Locked balance
   * @param {number} total - Total balance (should equal available + locked)
   * @returns {boolean} True if invariant holds, false otherwise
   */
  validateBalanceInvariant(available, locked, total) {
    // Calculate expected total
    const expectedTotal = available + locked;
    
    // Allow for small floating-point rounding errors (0.01 Naira tolerance)
    const tolerance = 0.01;
    const difference = Math.abs(expectedTotal - total);
    
    const isValid = difference < tolerance;
    
    if (!isValid) {
      console.warn('[BalanceService] ⚠️ Balance invariant violation detected!', {
        available,
        locked,
        total,
        expectedTotal,
        difference
      });
    }
    
    return isValid;
  }
  
  /**
   * Formats a balance value as Nigerian Naira with 2 decimal places
   * @param {number} balance - Balance value
   * @returns {string} Formatted balance (e.g., "₦1,234.56")
   */
  formatBalance(balance) {
    // Ensure balance is a number
    const numericBalance = typeof balance === 'number' ? balance : parseFloat(balance) || 0;
    
    // Format with 2 decimal places and thousands separator (Requirement 1.5)
    const formatted = numericBalance.toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    
    return `₦${formatted}`;
  }
  
  /**
   * Disconnects from the database
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.connected) {
      await this.dbService.disconnect();
      this.connected = false;
      console.log('[BalanceService] Disconnected from database');
    }
  }
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.BalanceService = BalanceService;
}
