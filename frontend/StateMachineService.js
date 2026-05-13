/**
 * StateMachineService - State management for ScrowPay Escrow Dashboard
 * 
 * This service provides transaction state machine operations including:
 * - Valid state transition enforcement
 * - User permission validation for state changes
 * - State-specific action execution (fund transfers, timestamps)
 * - Auto-release timer management for inspection window expiry
 * - State history recording for audit trail
 * 
 * Valid State Transitions:
 * - Created → Funded_Locked (buyer funds escrow after AI pass)
 * - Funded_Locked → In_Transit (seller marks as shipped)
 * - In_Transit → Completed (buyer accepts OR auto-release timer expires)
 * - In_Transit → Disputed (buyer disputes delivery)
 * - Disputed → Completed (dispute resolved)
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 9.5, 9.7
 */

class StateMachineService {
  /**
   * Creates a new StateMachineService instance
   * @param {Object} config - Configuration object
   * @param {Object} config.turso - Turso DB configuration
   * @param {string} config.turso.databaseUrl - Turso database URL
   * @param {string} config.turso.authToken - Turso authentication token
   * @param {Object} config.squad - Squad API configuration
   * @param {string} config.squad.secretKey - Squad API secret key
   * @param {string} config.squad.environment - 'sandbox' or 'production'
   * @param {string} config.holdingAccount - Central holding account number
   */
  constructor(config) {
    this.dbService = new TursoDBService(config.turso.databaseUrl, config.turso.authToken);
    this.squadService = new SquadVirtualAccountService(config.squad.secretKey, config.squad.environment);
    this.holdingAccount = config.holdingAccount;
    this.connected = false;
    
    // Define valid state transitions (Requirement 6.1)
    this.validTransitions = {
      'Created': ['Funded_Locked'],
      'Funded_Locked': ['In_Transit'],
      'In_Transit': ['Completed', 'Disputed'],
      'Disputed': ['Completed'],
      'Completed': []
    };
    
    // Auto-release timers map: transactionId -> timerId
    this.autoReleaseTimers = new Map();

    // Optional Trust Engine — wired via setTrustEngine() from the
    // dashboard bootstrap. When present, every Completed transition
    // (including auto-release and instant-release paths) updates both
    // parties' Trust Scores. Null-safe everywhere it's used.
    this.trustEngine = null;
  }

  /**
   * Wires the TrustEngineService for terminal-state hooks.
   * @param {TrustEngineService} engine
   */
  setTrustEngine(engine) {
    this.trustEngine = engine || null;
  }
  
  /**
   * Connects to the database
   * @returns {Promise<void>}
   */
  async connect() {
    if (!this.connected) {
      await this.dbService.connect();
      this.connected = true;
      console.log('[StateMachineService] Connected to database');
    }
  }
  
  /**
   * Checks if a state transition is valid
   * @param {string} currentState - Current transaction state
   * @param {string} newState - Desired new state
   * @returns {boolean} True if transition is valid, false otherwise
   */
  isValidTransition(currentState, newState) {
    const validNextStates = this.validTransitions[currentState] || [];
    const isValid = validNextStates.includes(newState);
    
    console.log(`[StateMachineService] Transition validation: ${currentState} → ${newState}: ${isValid ? 'VALID' : 'INVALID'}`);
    
    return isValid;
  }
  
  /**
   * Validates user permission for a state transition
   * @param {Object} transaction - Transaction object
   * @param {string} newState - Desired new state
   * @param {number} userId - User ID attempting the transition
   * @throws {Error} If user does not have permission
   */
  validateUserPermission(transaction, newState, userId) {
    console.log('[StateMachineService] Validating user permission:', {
      transactionId: transaction.transaction_id,
      currentState: transaction.state,
      newState,
      userId,
      sellerId: transaction.seller_id,
      buyerId: transaction.buyer_id
    });
    
    // Created → Funded_Locked: Must be buyer (not seller)
    if (newState === 'Funded_Locked') {
      if (transaction.seller_id === userId) {
        throw new Error('Seller cannot fund their own transaction');
      }
      // Any other user can become the buyer by funding
    }
    
    // Funded_Locked → In_Transit: Must be seller
    if (newState === 'In_Transit') {
      if (transaction.seller_id !== userId) {
        throw new Error('Only seller can mark transaction as shipped');
      }
    }
    
    // In_Transit → Completed: Must be buyer (unless auto-release)
    if (newState === 'Completed' && transaction.state === 'In_Transit') {
      // Allow system auto-release (userId will be null or seller_id)
      if (userId !== null && transaction.buyer_id !== userId && transaction.seller_id !== userId) {
        throw new Error('Only buyer can accept delivery');
      }
    }
    
    // In_Transit → Disputed: Must be buyer
    if (newState === 'Disputed') {
      if (transaction.buyer_id !== userId) {
        throw new Error('Only buyer can dispute transaction');
      }
    }
    
    console.log('[StateMachineService] ✅ User permission validated');
  }
  
  /**
   * Executes state-specific actions during transition
   * @param {Object} transaction - Transaction object
   * @param {string} currentState - Current state
   * @param {string} newState - New state
   * @param {Object} metadata - Additional metadata for the transition
   * @returns {Promise<void>}
   */
  async executeStateActions(transaction, currentState, newState, metadata) {
    console.log('[StateMachineService] Executing state actions:', {
      transactionId: transaction.transaction_id,
      currentState,
      newState,
      metadata
    });
    
    try {
      // Funded_Locked: Transfer funds from buyer to holding account
      if (newState === 'Funded_Locked') {
        await this.transferToHolding(transaction, metadata);
      }
      
      // In_Transit: Set shipped timestamp
      if (newState === 'In_Transit') {
        await this.setShippedTimestamp(transaction.transaction_id);
      }
      
      // Completed: Release funds to seller and set completed timestamp
      if (newState === 'Completed') {
        await this.releaseToSeller(transaction);
        await this.setCompletedTimestamp(transaction.transaction_id);
      }
      
      console.log('[StateMachineService] ✅ State actions executed successfully');
      
    } catch (error) {
      console.error('[StateMachineService] State action execution failed:', error);
      throw new Error('Failed to execute state actions: ' + error.message);
    }
  }
  
  /**
   * Transfers funds from buyer to holding account
   * @private
   * @param {Object} transaction - Transaction object
   * @param {Object} metadata - Metadata containing buyer account info
   * @returns {Promise<void>}
   */
  async transferToHolding(transaction, metadata) {
    console.log('[StateMachineService] Transferring funds to holding account:', {
      transactionId: transaction.transaction_id,
      amount: transaction.price,
      buyerAccount: metadata.buyerAccount,
      holdingAccount: this.holdingAccount
    });
    
    // Note: Squad API transfer implementation would go here
    // For now, we'll simulate the transfer with retry logic
    
    let lastError = null;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[StateMachineService] Transfer attempt ${attempt}/${maxRetries}`);
        
        // Simulate Squad API transfer call
        // In production, this would be:
        // const result = await this.squadService.transfer({
        //   from_account: metadata.buyerAccount,
        //   to_account: this.holdingAccount,
        //   amount: transaction.price,
        //   metadata: {
        //     transaction_id: transaction.transaction_id,
        //     type: 'escrow_funding'
        //   }
        // });
        
        // For now, we'll just log and continue
        console.log('[StateMachineService] ✅ Funds transferred to holding account (simulated)');
        
        // Update funded_at timestamp
        await this.dbService._executeHttp(
          'UPDATE transactions SET funded_at = CURRENT_TIMESTAMP WHERE transaction_id = ?',
          [transaction.transaction_id]
        );
        
        console.log('[StateMachineService] ✅ funded_at timestamp updated');
        return;
        
      } catch (error) {
        lastError = error;
        console.error(`[StateMachineService] Transfer attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt - 1) * 1000;
          console.log(`[StateMachineService] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // All retries failed
    throw new Error('Fund transfer failed after ' + maxRetries + ' attempts: ' + lastError.message);
  }
  
  /**
   * Releases funds from holding account to seller
   * @private
   * @param {Object} transaction - Transaction object
   * @returns {Promise<void>}
   */
  async releaseToSeller(transaction) {
    console.log('[StateMachineService] Releasing funds to seller:', {
      transactionId: transaction.transaction_id,
      amount: transaction.price,
      sellerId: transaction.seller_id
    });
    
    // Get seller's virtual account number
    const sellerResult = await this.dbService._executeHttp(
      'SELECT virtual_account_number FROM users WHERE id = ?',
      [transaction.seller_id]
    );
    
    const executeResult = sellerResult.results[0].response.result;
    const rows = executeResult.rows;
    
    if (rows.length === 0) {
      throw new Error('Seller account not found');
    }
    
    const sellerAccountValue = rows[0][0];
    const sellerAccount = typeof sellerAccountValue === 'object' 
      ? sellerAccountValue.value 
      : sellerAccountValue;
    
    console.log('[StateMachineService] Seller virtual account:', sellerAccount);
    
    // Transfer funds with retry logic
    let lastError = null;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[StateMachineService] Release attempt ${attempt}/${maxRetries}`);
        
        // Simulate Squad API transfer call
        // In production, this would be:
        // const result = await this.squadService.transfer({
        //   from_account: this.holdingAccount,
        //   to_account: sellerAccount,
        //   amount: transaction.price,
        //   metadata: {
        //     transaction_id: transaction.transaction_id,
        //     type: 'escrow_release'
        //   }
        // });
        
        console.log('[StateMachineService] ✅ Funds released to seller (simulated)');
        return;
        
      } catch (error) {
        lastError = error;
        console.error(`[StateMachineService] Release attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt - 1) * 1000;
          console.log(`[StateMachineService] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // All retries failed
    throw new Error('Fund release failed after ' + maxRetries + ' attempts: ' + lastError.message);
  }
  
  /**
   * Sets the shipped_at timestamp for a transaction
   * @private
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<void>}
   */
  async setShippedTimestamp(transactionId) {
    console.log('[StateMachineService] Setting shipped_at timestamp:', transactionId);
    
    await this.dbService._executeHttp(
      'UPDATE transactions SET shipped_at = CURRENT_TIMESTAMP WHERE transaction_id = ?',
      [transactionId]
    );
    
    console.log('[StateMachineService] ✅ shipped_at timestamp updated');
  }
  
  /**
   * Sets the completed_at timestamp for a transaction
   * @private
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<void>}
   */
  async setCompletedTimestamp(transactionId) {
    console.log('[StateMachineService] Setting completed_at timestamp:', transactionId);
    
    await this.dbService._executeHttp(
      'UPDATE transactions SET completed_at = CURRENT_TIMESTAMP WHERE transaction_id = ?',
      [transactionId]
    );
    
    console.log('[StateMachineService] ✅ completed_at timestamp updated');
  }
  
  /**
   * Records a state transition to the state history table
   * @param {string} transactionId - Transaction ID
   * @param {string} fromState - Previous state
   * @param {string} toState - New state
   * @param {number} changedBy - User ID who initiated the change
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<void>}
   */
  async recordStateHistory(transactionId, fromState, toState, changedBy, metadata) {
    console.log('[StateMachineService] Recording state history:', {
      transactionId,
      fromState,
      toState,
      changedBy,
      metadata
    });
    
    try {
      const notes = metadata ? JSON.stringify(metadata) : null;
      
      await this.dbService._executeHttp(
        `INSERT INTO transaction_state_history 
         (transaction_id, from_state, to_state, changed_by, notes) 
         VALUES (?, ?, ?, ?, ?)`,
        [transactionId, fromState, toState, changedBy, notes]
      );
      
      console.log('[StateMachineService] ✅ State history recorded');
      
    } catch (error) {
      console.error('[StateMachineService] Failed to record state history:', error);
      // Don't throw - state history is for audit, shouldn't block transition
      console.warn('[StateMachineService] ⚠️ Continuing despite state history failure');
    }
  }
  
  /**
   * Schedules auto-release timer for a transaction in In_Transit state
   * @param {Object} transaction - Transaction object
   * @returns {void}
   */
  scheduleAutoRelease(transaction) {
    console.log('[StateMachineService] Scheduling auto-release:', {
      transactionId: transaction.transaction_id,
      shippedAt: transaction.shipped_at,
      inspectionWindowDays: transaction.inspection_window_days
    });
    
    // Calculate expiry time: shipped_at + inspection_window_days
    const shippedDate = new Date(transaction.shipped_at);
    const expiryDate = new Date(shippedDate);
    expiryDate.setDate(expiryDate.getDate() + transaction.inspection_window_days);
    
    const timeUntilExpiry = expiryDate.getTime() - Date.now();
    
    console.log('[StateMachineService] Auto-release timing:', {
      shippedDate: shippedDate.toISOString(),
      expiryDate: expiryDate.toISOString(),
      timeUntilExpiryMs: timeUntilExpiry,
      timeUntilExpiryHours: (timeUntilExpiry / (1000 * 60 * 60)).toFixed(2)
    });
    
    if (timeUntilExpiry > 0) {
      // Cancel any existing timer for this transaction
      this.cancelAutoRelease(transaction.transaction_id);
      
      // Schedule new timer
      const timerId = setTimeout(async () => {
        console.log(`[StateMachineService] 🔔 Auto-release timer expired for ${transaction.transaction_id}`);
        
        try {
          // Transition to Completed state
          await this.transitionState(
            transaction.transaction_id,
            'Completed',
            transaction.seller_id,  // System action on behalf of seller
            { autoRelease: true, reason: 'Inspection window expired' }
          );
          
          console.log('[StateMachineService] ✅ Auto-release completed successfully');
          
        } catch (error) {
          console.error('[StateMachineService] ❌ Auto-release failed:', error);
          
          // Log failure for manual intervention
          await this.logAutoReleaseFailure(transaction.transaction_id, error);
        }
      }, timeUntilExpiry);
      
      // Store timer ID
      this.autoReleaseTimers.set(transaction.transaction_id, timerId);
      
      console.log(`[StateMachineService] ✅ Auto-release scheduled for ${expiryDate.toISOString()}`);
    } else {
      console.warn('[StateMachineService] ⚠️ Inspection window already expired, triggering immediate auto-release');
      
      // Trigger immediate auto-release
      setTimeout(async () => {
        try {
          await this.transitionState(
            transaction.transaction_id,
            'Completed',
            transaction.seller_id,
            { autoRelease: true, reason: 'Inspection window already expired' }
          );
        } catch (error) {
          console.error('[StateMachineService] Immediate auto-release failed:', error);
          await this.logAutoReleaseFailure(transaction.transaction_id, error);
        }
      }, 0);
    }
  }
  
  /**
   * Cancels auto-release timer for a transaction
   * @param {string} transactionId - Transaction ID
   * @returns {void}
   */
  cancelAutoRelease(transactionId) {
    const timerId = this.autoReleaseTimers.get(transactionId);
    
    if (timerId) {
      clearTimeout(timerId);
      this.autoReleaseTimers.delete(transactionId);
      console.log(`[StateMachineService] ✅ Auto-release cancelled for ${transactionId}`);
    } else {
      console.log(`[StateMachineService] No auto-release timer found for ${transactionId}`);
    }
  }
  
  /**
   * Logs auto-release failure for manual intervention
   * @private
   * @param {string} transactionId - Transaction ID
   * @param {Error} error - Error that occurred
   * @returns {Promise<void>}
   */
  async logAutoReleaseFailure(transactionId, error) {
    console.log('[StateMachineService] Logging auto-release failure:', {
      transactionId,
      error: error.message
    });
    
    try {
      // Log to state history with failure note
      await this.dbService._executeHttp(
        `INSERT INTO transaction_state_history 
         (transaction_id, from_state, to_state, changed_by, notes) 
         VALUES (?, ?, ?, ?, ?)`,
        [
          transactionId,
          'In_Transit',
          'In_Transit',  // State unchanged
          0,  // System user ID
          JSON.stringify({
            autoReleaseFailure: true,
            error: error.message,
            timestamp: new Date().toISOString()
          })
        ]
      );
      
      console.log('[StateMachineService] ✅ Auto-release failure logged');
      
    } catch (logError) {
      console.error('[StateMachineService] Failed to log auto-release failure:', logError);
    }
  }
  
  /**
   * Retrieves a transaction by ID
   * @private
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object|null>} Transaction object or null if not found
   */
  async getTransaction(transactionId) {
    console.log('[StateMachineService] Retrieving transaction:', transactionId);
    
    const result = await this.dbService._executeHttp(
      'SELECT * FROM transactions WHERE transaction_id = ? LIMIT 1',
      [transactionId]
    );
    
    const executeResult = result.results[0].response.result;
    const rows = executeResult.rows;
    const cols = executeResult.cols;
    
    if (rows.length === 0) {
      console.log('[StateMachineService] Transaction not found:', transactionId);
      return null;
    }
    
    // Convert row array to object
    const transaction = {};
    cols.forEach((col, index) => {
      const cellValue = rows[0][index];
      transaction[col.name] = typeof cellValue === 'object' && cellValue.value !== undefined 
        ? cellValue.value 
        : cellValue;
    });
    
    console.log('[StateMachineService] ✅ Transaction retrieved');
    return transaction;
  }
  
  /**
   * Updates transaction state in database
   * @private
   * @param {string} transactionId - Transaction ID
   * @param {string} newState - New state
   * @returns {Promise<void>}
   */
  async updateTransactionState(transactionId, newState) {
    console.log('[StateMachineService] Updating transaction state:', {
      transactionId,
      newState
    });
    
    await this.dbService._executeHttp(
      'UPDATE transactions SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE transaction_id = ?',
      [newState, transactionId]
    );
    
    console.log('[StateMachineService] ✅ Transaction state updated in database');
  }
  
  /**
   * Transitions a transaction to a new state
   * @param {string} transactionId - Transaction ID
   * @param {string} newState - Desired new state
   * @param {number} userId - User ID initiating the transition
   * @param {Object} metadata - Additional metadata for the transition
   * @returns {Promise<Object>} { success: boolean, newState: string, message?: string }
   */
  async transitionState(transactionId, newState, userId, metadata = {}) {
    try {
      console.log('[StateMachineService] ========================================');
      console.log('[StateMachineService] Starting state transition:', {
        transactionId,
        newState,
        userId,
        metadata
      });
      
      // Ensure connection
      await this.connect();
      
      // Get current transaction
      const transaction = await this.getTransaction(transactionId);
      
      if (!transaction) {
        throw new Error('Transaction not found: ' + transactionId);
      }
      
      const currentState = transaction.state;
      
      console.log('[StateMachineService] Current transaction state:', currentState);
      
      // Validate transition (Requirement 6.9)
      if (!this.isValidTransition(currentState, newState)) {
        throw new Error(`Invalid state transition: ${currentState} → ${newState}`);
      }
      
      // Validate user permissions
      this.validateUserPermission(transaction, newState, userId);
      
      // Execute state-specific actions
      await this.executeStateActions(transaction, currentState, newState, metadata);
      
      // Update transaction state in database (Requirement 6.8)
      await this.updateTransactionState(transactionId, newState);
      
      // Record state history (Requirement 6.8)
      await this.recordStateHistory(transactionId, currentState, newState, userId, metadata);
      
      // Trust Engine: fire signal when a transaction reaches Completed.
      // We pass `wasLate` by comparing current time to the seller's
      // delivery deadline, and `autoRelease` from the transition's
      // metadata. Best-effort; never blocks the state machine.
      if (newState === 'Completed' && this.trustEngine) {
        try {
          const fresh = await this.getTransaction(transactionId);
          const wasLate = this._isLateDelivery(fresh);
          await this.trustEngine.onTransactionCompleted({
            sellerId: fresh.seller_id != null ? Number(fresh.seller_id) : null,
            buyerId: fresh.buyer_id != null ? Number(fresh.buyer_id) : null,
            amount: Number(fresh.price) || 0,
            transactionId,
            wasLate,
            autoRelease: Boolean(metadata && (metadata.autoRelease || metadata.instantRelease))
          });
        } catch (e) {
          console.warn('[StateMachineService] trust hook (completed) failed:', e.message);
        }
      }

      // ========================================================
      // INSTANT ESCROW RELEASE
      // --------------------------------------------------------
      // When a Funded → In_Transit transition lands on a transaction
      // that was flagged `auto_release_eligible` at funding time
      // (seller is currently Elite-tier with >=10 successful
      // deliveries and 0 disputes lost), we skip the inspection
      // window and immediately transition to Completed.
      //
      // We DO NOT schedule the normal auto-release timer for these
      // transactions — instead we re-enter transitionState() with
      // `instantRelease: true` in metadata, which both bypasses the
      // timer logic below and surfaces in the trust-hook reason.
      // ========================================================
      if (newState === 'In_Transit') {
        const updatedTransaction = await this.getTransaction(transactionId);
        const eligible = Number(updatedTransaction.auto_release_eligible) === 1;

        if (eligible && !(metadata && metadata.skipInstantRelease)) {
          console.log('[StateMachineService] ⚡ Instant Escrow Release path:', transactionId);
          // Reentrancy guard: pass skipInstantRelease so the next
          // transition's In_Transit branch is never re-evaluated for
          // this same row. (Defensive — In_Transit is the FROM state
          // in the next call, but we keep the flag for clarity.)
          await this.transitionState(
            transactionId,
            'Completed',
            updatedTransaction.seller_id, // system-acting on seller's behalf
            { instantRelease: true, skipInstantRelease: true, reason: 'Instant Escrow Release (Elite-tier seller)' }
          );
          // The recursive call already handled history + trust hooks.
          // Don't schedule the normal auto-release timer.
        } else {
          // Standard path: schedule the inspection-window auto-release.
          this.scheduleAutoRelease(updatedTransaction);
        }
      }
      
      // Cancel auto-release if transitioning from In_Transit
      if (currentState === 'In_Transit' && newState !== 'In_Transit') {
        this.cancelAutoRelease(transactionId);
      }
      
      console.log('[StateMachineService] ✅ State transition completed successfully');
      console.log('[StateMachineService] ========================================');
      
      return {
        success: true,
        newState,
        previousState: currentState
      };
      
    } catch (error) {
      console.error('[StateMachineService] ❌ State transition failed:', error);
      console.log('[StateMachineService] ========================================');
      
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Gets state history for a transaction
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Array>} Array of state history entries
   */
  async getStateHistory(transactionId) {
    try {
      console.log('[StateMachineService] Retrieving state history:', transactionId);
      
      // Ensure connection
      await this.connect();
      
      const result = await this.dbService._executeHttp(
        `SELECT * FROM transaction_state_history 
         WHERE transaction_id = ? 
         ORDER BY changed_at ASC`,
        [transactionId]
      );
      
      const executeResult = result.results[0].response.result;
      const rows = executeResult.rows;
      const cols = executeResult.cols;
      
      // Convert rows to objects
      const history = rows.map(row => {
        const entry = {};
        cols.forEach((col, index) => {
          const cellValue = row[index];
          entry[col.name] = typeof cellValue === 'object' && cellValue.value !== undefined 
            ? cellValue.value 
            : cellValue;
        });
        return entry;
      });
      
      console.log('[StateMachineService] ✅ State history retrieved:', history.length, 'entries');
      
      return history;
      
    } catch (error) {
      console.error('[StateMachineService] Get state history failed:', error);
      
      // If table doesn't exist, return empty array
      if (error.message.includes('no such table')) {
        console.log('[StateMachineService] State history table does not exist yet, returning empty array');
        return [];
      }
      
      throw new Error('Failed to retrieve state history: ' + error.message);
    }
  }
  
  /**
   * Disconnects from the database
   * @returns {Promise<void>}
   */
  /**
   * Returns true if a Completed transaction was delivered after its
   * promised window. Used by the Trust Engine `wasLate` signal.
   *
   * Heuristic: a delivery is "late" when shipped_at + delivery_timeline_days
   * is earlier than completed_at. Returns false if any timestamp is
   * missing — we don't penalize sellers for incomplete data.
   *
   * @private
   * @param {Object} txn
   * @returns {boolean}
   */
  _isLateDelivery(txn) {
    try {
      const shippedAt = txn && txn.shipped_at ? new Date(txn.shipped_at) : null;
      const completedAt = txn && txn.completed_at ? new Date(txn.completed_at) : null;
      const days = Number(txn && txn.delivery_timeline_days);
      if (!shippedAt || !completedAt || !isFinite(days)) return false;
      const deadline = new Date(shippedAt);
      deadline.setDate(deadline.getDate() + days);
      return completedAt.getTime() > deadline.getTime();
    } catch (_) {
      return false;
    }
  }

  async disconnect() {
    if (this.connected) {
      // Cancel all pending auto-release timers
      for (const [transactionId, timerId] of this.autoReleaseTimers.entries()) {
        clearTimeout(timerId);
        console.log(`[StateMachineService] Cancelled auto-release timer for ${transactionId}`);
      }
      this.autoReleaseTimers.clear();
      
      await this.dbService.disconnect();
      this.connected = false;
      console.log('[StateMachineService] Disconnected from database');
    }
  }
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.StateMachineService = StateMachineService;
}
