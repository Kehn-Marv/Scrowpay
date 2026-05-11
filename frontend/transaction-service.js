/**
 * TransactionService - Transaction CRUD operations for ScrowPay Escrow Dashboard
 * 
 * This service provides transaction management operations including:
 * - Transaction creation with UUID generation
 * - Transaction retrieval and filtering
 * - Active transaction queries
 * - Transaction history with pagination
 * - Input validation for all fields
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 8.1, 8.2, 16.1, 16.2
 */

class TransactionService {
  /**
   * Creates a new TransactionService instance
   * @param {Object} config - Configuration object
   * @param {Object} config.turso - Turso DB configuration
   * @param {string} config.turso.url - Turso database URL
   * @param {string} config.turso.token - Turso authentication token
   */
  constructor(config) {
    this.dbService = new TursoDBService(config.turso.databaseUrl, config.turso.authToken);
    this.connected = false;
  }
  
  /**
   * Connects to the database
   * @returns {Promise<void>}
   */
  async connect() {
    if (!this.connected) {
      await this.dbService.connect();
      this.connected = true;
      console.log('[TransactionService] Connected to database');
    }
  }
  
  /**
   * Generates a unique Transaction ID in format "TXN-{uuid}"
   * @private
   * @returns {string} Transaction ID
   */
  generateTransactionId() {
    // Generate UUID v4
    const uuid = crypto.randomUUID();
    return `TXN-${uuid}`;
  }
  
  /**
   * Validates transaction creation input data
   * @private
   * @param {Object} data - Transaction data
   * @returns {Array<string>} Array of validation error messages (empty if valid)
   */
  validateTransactionData(data) {
    const errors = [];
    
    // Item description validation (Requirement 3.2)
    if (!data.itemDescription || typeof data.itemDescription !== 'string') {
      errors.push('Item description is required');
    } else if (data.itemDescription.trim().length < 10) {
      errors.push('Item description must be at least 10 characters');
    } else if (data.itemDescription.trim().length > 500) {
      errors.push('Item description must not exceed 500 characters');
    }
    
    // Price validation (Requirement 3.6)
    if (data.price === undefined || data.price === null) {
      errors.push('Price is required');
    } else if (typeof data.price !== 'number' || isNaN(data.price)) {
      errors.push('Price must be a valid number');
    } else if (data.price < 100) {
      errors.push('Price must be at least ₦100');
    } else if (data.price > 10000000) {
      errors.push('Price must not exceed ₦10,000,000');
    }
    
    // Delivery timeline validation (Requirement 3.7)
    if (data.deliveryTimelineDays === undefined || data.deliveryTimelineDays === null) {
      errors.push('Delivery timeline is required');
    } else if (!Number.isInteger(data.deliveryTimelineDays)) {
      errors.push('Delivery timeline must be a whole number');
    } else if (data.deliveryTimelineDays < 1) {
      errors.push('Delivery timeline must be at least 1 day');
    } else if (data.deliveryTimelineDays > 90) {
      errors.push('Delivery timeline must not exceed 90 days');
    }
    
    // Inspection window validation (Requirement 3.8)
    if (data.inspectionWindowDays === undefined || data.inspectionWindowDays === null) {
      errors.push('Inspection window is required');
    } else if (!Number.isInteger(data.inspectionWindowDays)) {
      errors.push('Inspection window must be a whole number');
    } else if (data.inspectionWindowDays < 1) {
      errors.push('Inspection window must be at least 1 day');
    } else if (data.inspectionWindowDays > 14) {
      errors.push('Inspection window must not exceed 14 days');
    }
    
    // Seller ID validation
    if (!data.sellerId || typeof data.sellerId !== 'number') {
      errors.push('Seller ID is required and must be a valid user ID');
    }
    
    return errors;
  }
  
  /**
   * Checks if user has exceeded rate limit for transaction creation
   * @private
   * @param {number} userId - User ID to check
   * @returns {Promise<Object>} { allowed: boolean, count: number, resetTime: Date }
   */
  async checkRateLimit(userId) {
    try {
      // Rate limit: 10 transactions per hour per user (Requirement 19.6)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      const sql = `
        SELECT COUNT(*) as count 
        FROM transactions 
        WHERE seller_id = ? AND created_at >= ?
      `;
      
      const result = await this.dbService._executeHttp(sql, [userId, oneHourAgo]);
      const countValue = result.results[0].response.result.rows[0][0];
      const count = typeof countValue === 'object' ? parseInt(countValue.value) : countValue;
      
      // Calculate when the rate limit will reset (1 hour from now)
      const resetTime = new Date(Date.now() + 60 * 60 * 1000);
      
      const allowed = count < 10;
      
      console.log(`[TransactionService] Rate limit check for user ${userId}: ${count}/10 transactions in last hour`);
      
      return {
        allowed,
        count,
        limit: 10,
        resetTime
      };
      
    } catch (error) {
      console.error('[TransactionService] Rate limit check failed:', error);
      // On error, allow the transaction (fail open for better UX)
      return {
        allowed: true,
        count: 0,
        limit: 10,
        resetTime: new Date(Date.now() + 60 * 60 * 1000)
      };
    }
  }
  
  /**
   * Logs a security event to the security_logs table
   * @private
   * @param {Object} event - Security event data
   * @param {string} event.eventType - Type of security event
   * @param {number} event.userId - User ID
   * @param {string} [event.transactionId] - Transaction ID (optional)
   * @param {string} [event.details] - Additional details (optional)
   * @returns {Promise<void>}
   */
  async logSecurityEvent(event) {
    try {
      const sql = `
        INSERT INTO security_logs (event_type, user_id, transaction_id, details, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      const args = [
        event.eventType,
        event.userId,
        event.transactionId || null,
        event.details || null,
        event.ipAddress || null,
        event.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : null)
      ];
      
      await this.dbService._executeHttp(sql, args);
      
      console.log('[TransactionService] Security event logged:', event.eventType);
      
    } catch (error) {
      console.error('[TransactionService] Failed to log security event:', error);
      // Don't throw - logging failure shouldn't break the main flow
    }
  }
  
  /**
   * Creates a new transaction
   * @param {Object} data - Transaction data
   * @param {number} data.sellerId - User ID of the seller (creator)
   * @param {string} data.itemDescription - Description of goods/services
   * @param {number} data.price - Transaction amount in Naira (₦100 - ₦10,000,000)
   * @param {number} data.deliveryTimelineDays - Expected delivery time (1-90 days)
   * @param {number} data.inspectionWindowDays - Buyer inspection period (1-14 days)
   * @returns {Promise<Object>} Created transaction object with transaction_id
   * @throws {Error} If validation fails or database operation fails
   */
  async createTransaction(data) {
    try {
      console.log('[TransactionService] Creating transaction:', data);
      
      // Ensure connection
      await this.connect();
      
      // Check rate limit (Requirement 19.6)
      const rateLimitCheck = await this.checkRateLimit(data.sellerId);
      
      if (!rateLimitCheck.allowed) {
        // Log rate limit violation
        await this.logSecurityEvent({
          eventType: 'rate_limit_violation',
          userId: data.sellerId,
          details: JSON.stringify({
            count: rateLimitCheck.count,
            limit: rateLimitCheck.limit,
            resetTime: rateLimitCheck.resetTime.toISOString()
          })
        });
        
        // Format reset time for user-friendly message
        const resetTimeFormatted = rateLimitCheck.resetTime.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        });
        
        throw new Error(
          `Rate limit exceeded. You have created ${rateLimitCheck.count} transactions in the last hour. ` +
          `The limit is ${rateLimitCheck.limit} transactions per hour. ` +
          `Please try again after ${resetTimeFormatted}.`
        );
      }
      
      // Validate input data (Requirement 3.9)
      const validationErrors = this.validateTransactionData(data);
      if (validationErrors.length > 0) {
        throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
      }
      
      // Generate unique Transaction_ID (Requirement 3.3)
      const transactionId = this.generateTransactionId();
      
      // Save to database with state "Created" (Requirement 3.4)
      const sql = `INSERT INTO transactions (
        transaction_id, seller_id, buyer_id, item_description, price,
        delivery_timeline_days, inspection_window_days, state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      
      const args = [
        transactionId,
        data.sellerId,
        null,  // buyer_id is NULL until transaction is funded
        data.itemDescription.trim(),
        data.price,
        data.deliveryTimelineDays,
        data.inspectionWindowDays,
        'Created'
      ];
      
      const result = await this.dbService._executeHttp(sql, args);
      
      console.log('[TransactionService] ✅ Transaction created successfully:', transactionId);
      
      // Return transaction object (Requirement 3.5)
      return {
        id: result.results[0].response.result.last_insert_rowid,
        transaction_id: transactionId,
        seller_id: data.sellerId,
        buyer_id: null,
        item_description: data.itemDescription.trim(),
        price: data.price,
        delivery_timeline_days: data.deliveryTimelineDays,
        inspection_window_days: data.inspectionWindowDays,
        state: 'Created',
        risk_score: null,
        ai_verdict: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('[TransactionService] Transaction creation failed:', error);
      throw new Error('Failed to create transaction: ' + error.message);
    }
  }
  
  /**
   * Retrieves a transaction by Transaction_ID
   * @param {string} transactionId - Transaction ID to retrieve
   * @returns {Promise<Object|null>} Transaction object if found, null otherwise
   */
  async getTransaction(transactionId) {
    try {
      console.log('[TransactionService] Retrieving transaction:', transactionId);
      
      // Ensure connection
      await this.connect();
      
      // Query database (Requirement 4.2)
      const sql = 'SELECT * FROM transactions WHERE transaction_id = ? LIMIT 1';
      const result = await this.dbService._executeHttp(sql, [transactionId]);
      
      const executeResult = result.results[0].response.result;
      const rows = executeResult.rows;
      const cols = executeResult.cols;
      
      if (rows.length === 0) {
        console.log('[TransactionService] Transaction not found:', transactionId);
        return null;
      }
      
      // Convert row array to object using column names
      const transaction = {};
      cols.forEach((col, index) => {
        const cellValue = rows[0][index];
        transaction[col.name] = typeof cellValue === 'object' && cellValue.value !== undefined 
          ? cellValue.value 
          : cellValue;
      });
      
      console.log('[TransactionService] ✅ Transaction retrieved:', transactionId);
      return transaction;
      
    } catch (error) {
      console.error('[TransactionService] Transaction retrieval failed:', error);
      
      // If table doesn't exist, return null
      if (error.message.includes('no such table')) {
        console.log('[TransactionService] Transactions table does not exist yet, returning null');
        return null;
      }
      
      throw new Error('Failed to retrieve transaction: ' + error.message);
    }
  }
  
  /**
   * Retrieves active transactions for a user (buyer or seller)
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Object with categorized transaction lists
   * @returns {Promise<Object>} { awaitingFunding: [], funded: [], inTransit: [], disputed: [] }
   */
  async getActiveTransactions(userId) {
    try {
      console.log('[TransactionService] Retrieving active transactions for user:', userId);
      
      // Ensure connection
      await this.connect();
      
      // Query active transactions where user is buyer or seller (Requirement 8.1)
      // Active states: Created, Funded_Locked, In_Transit, Disputed
      const sql = `
        SELECT * FROM transactions 
        WHERE (seller_id = ? OR buyer_id = ?)
        AND state IN ('Created', 'Funded_Locked', 'In_Transit', 'Disputed')
        ORDER BY created_at DESC
      `;
      
      const result = await this.dbService._executeHttp(sql, [userId, userId]);
      
      const executeResult = result.results[0].response.result;
      const rows = executeResult.rows;
      const cols = executeResult.cols;
      
      // Convert rows to objects
      const transactions = rows.map(row => {
        const transaction = {};
        cols.forEach((col, index) => {
          const cellValue = row[index];
          transaction[col.name] = typeof cellValue === 'object' && cellValue.value !== undefined 
            ? cellValue.value 
            : cellValue;
        });
        return transaction;
      });
      
      // Categorize by state (Requirement 8.2)
      const categorized = {
        awaitingFunding: transactions.filter(t => t.state === 'Created'),
        funded: transactions.filter(t => t.state === 'Funded_Locked'),
        inTransit: transactions.filter(t => t.state === 'In_Transit'),
        disputed: transactions.filter(t => t.state === 'Disputed')
      };
      
      console.log('[TransactionService] ✅ Active transactions retrieved:', {
        awaitingFunding: categorized.awaitingFunding.length,
        funded: categorized.funded.length,
        inTransit: categorized.inTransit.length,
        disputed: categorized.disputed.length
      });
      
      return categorized;
      
    } catch (error) {
      console.error('[TransactionService] Active transactions retrieval failed:', error);
      
      // If table doesn't exist, return empty categories
      if (error.message.includes('no such table')) {
        console.log('[TransactionService] Transactions table does not exist yet, returning empty lists');
        return {
          awaitingFunding: [],
          funded: [],
          inTransit: [],
          disputed: []
        };
      }
      
      throw new Error('Failed to retrieve active transactions: ' + error.message);
    }
  }
  
  /**
   * Retrieves transaction history for a user with filters and pagination
   * @param {number} userId - User ID
   * @param {Object} filters - Filter options
   * @param {string} [filters.dateFrom] - Start date (ISO format)
   * @param {string} [filters.dateTo] - End date (ISO format)
   * @param {string} [filters.state] - Transaction state filter
   * @param {string} [filters.role] - User role filter ('buyer' or 'seller')
   * @param {string} [filters.sortBy='created_at'] - Sort field (created_at, price, state)
   * @param {string} [filters.sortOrder='DESC'] - Sort order (ASC or DESC)
   * @param {number} [filters.page=1] - Page number (1-indexed)
   * @param {number} [filters.pageSize=20] - Items per page
   * @returns {Promise<Object>} { transactions: [], totalCount: number, page: number, pageSize: number, totalPages: number }
   */
  async getTransactionHistory(userId, filters = {}) {
    try {
      console.log('[TransactionService] Retrieving transaction history for user:', userId, 'with filters:', filters);
      
      // Ensure connection
      await this.connect();
      
      // Default filter values (Requirement 16.5)
      const {
        dateFrom = null,
        dateTo = null,
        state = null,
        role = null,
        sortBy = 'created_at',
        sortOrder = 'DESC',
        page = 1,
        pageSize = 20
      } = filters;
      
      // Validate sort parameters
      const validSortFields = ['created_at', 'price', 'state', 'updated_at'];
      const validSortOrders = ['ASC', 'DESC'];
      
      const safeSortBy = validSortFields.includes(sortBy) ? sortBy : 'created_at';
      const safeSortOrder = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
      
      // Build WHERE clause (Requirement 16.3)
      const whereClauses = [];
      const args = [];
      
      // User filter (buyer or seller)
      if (role === 'buyer') {
        whereClauses.push('buyer_id = ?');
        args.push(userId);
      } else if (role === 'seller') {
        whereClauses.push('seller_id = ?');
        args.push(userId);
      } else {
        whereClauses.push('(seller_id = ? OR buyer_id = ?)');
        args.push(userId, userId);
      }
      
      // Date range filter
      if (dateFrom) {
        whereClauses.push('created_at >= ?');
        args.push(dateFrom);
      }
      
      if (dateTo) {
        whereClauses.push('created_at <= ?');
        args.push(dateTo);
      }
      
      // State filter
      if (state) {
        whereClauses.push('state = ?');
        args.push(state);
      }
      
      const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
      
      // Get total count for pagination
      const countSql = `SELECT COUNT(*) as count FROM transactions ${whereClause}`;
      const countResult = await this.dbService._executeHttp(countSql, args);
      const countValue = countResult.results[0].response.result.rows[0][0];
      const totalCount = typeof countValue === 'object' ? parseInt(countValue.value) : countValue;
      
      // Calculate pagination (Requirement 16.5)
      const offset = (page - 1) * pageSize;
      const totalPages = Math.ceil(totalCount / pageSize);
      
      // Query transactions with pagination (Requirement 16.1, 16.4)
      const sql = `
        SELECT * FROM transactions 
        ${whereClause}
        ORDER BY ${safeSortBy} ${safeSortOrder}
        LIMIT ? OFFSET ?
      `;
      
      const queryArgs = [...args, pageSize, offset];
      const result = await this.dbService._executeHttp(sql, queryArgs);
      
      const executeResult = result.results[0].response.result;
      const rows = executeResult.rows;
      const cols = executeResult.cols;
      
      // Convert rows to objects
      const transactions = rows.map(row => {
        const transaction = {};
        cols.forEach((col, index) => {
          const cellValue = row[index];
          transaction[col.name] = typeof cellValue === 'object' && cellValue.value !== undefined 
            ? cellValue.value 
            : cellValue;
        });
        return transaction;
      });
      
      console.log('[TransactionService] ✅ Transaction history retrieved:', {
        count: transactions.length,
        totalCount,
        page,
        totalPages
      });
      
      return {
        transactions,
        totalCount,
        page,
        pageSize,
        totalPages
      };
      
    } catch (error) {
      console.error('[TransactionService] Transaction history retrieval failed:', error);
      
      // If table doesn't exist, return empty result
      if (error.message.includes('no such table')) {
        console.log('[TransactionService] Transactions table does not exist yet, returning empty history');
        return {
          transactions: [],
          totalCount: 0,
          page: 1,
          pageSize: 20,
          totalPages: 0
        };
      }
      
      throw new Error('Failed to retrieve transaction history: ' + error.message);
    }
  }
  
  /**
   * Updates a transaction's buyer_id when it is funded
   * @param {string} transactionId - Transaction ID
   * @param {number} buyerId - Buyer's user ID
   * @returns {Promise<boolean>} True if update successful
   */
  async updateBuyer(transactionId, buyerId) {
    try {
      console.log('[TransactionService] Updating buyer for transaction:', transactionId);
      
      // Ensure connection
      await this.connect();
      
      const sql = `
        UPDATE transactions 
        SET buyer_id = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE transaction_id = ?
      `;
      
      await this.dbService._executeHttp(sql, [buyerId, transactionId]);
      
      console.log('[TransactionService] ✅ Buyer updated successfully');
      return true;
      
    } catch (error) {
      console.error('[TransactionService] Buyer update failed:', error);
      throw new Error('Failed to update buyer: ' + error.message);
    }
  }
  
  /**
   * Updates a transaction's risk score and AI verdict
   * @param {string} transactionId - Transaction ID
   * @param {number} riskScore - AI-generated risk score (1-100)
   * @param {string} aiVerdict - AI decision ('pass' or 'fail')
   * @returns {Promise<boolean>} True if update successful
   */
  async updateRiskScore(transactionId, riskScore, aiVerdict) {
    try {
      console.log('[TransactionService] Updating risk score for transaction:', transactionId);
      
      // Ensure connection
      await this.connect();
      
      const sql = `
        UPDATE transactions 
        SET risk_score = ?, ai_verdict = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE transaction_id = ?
      `;
      
      await this.dbService._executeHttp(sql, [riskScore, aiVerdict, transactionId]);
      
      console.log('[TransactionService] ✅ Risk score updated successfully');
      return true;
      
    } catch (error) {
      console.error('[TransactionService] Risk score update failed:', error);
      throw new Error('Failed to update risk score: ' + error.message);
    }
  }
  
  /**
   * Disconnects from the database
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.connected) {
      await this.dbService.disconnect();
      this.connected = false;
      console.log('[TransactionService] Disconnected from database');
    }
  }
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.TransactionService = TransactionService;
}
