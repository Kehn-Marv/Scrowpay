/**
 * DashboardService - Main orchestrator for ScrowPay Escrow Dashboard
 * 
 * This service coordinates all dashboard operations including:
 * - User data initialization and loading
 * - Balance refresh (available and locked)
 * - Transaction list refresh
 * - Polling for real-time updates (30s Squad API, 10s Turso DB)
 * - Service coordination (TransactionService, BalanceService, TrustScoreService, IsolationForestService, StateMachineService)
 * - Optimistic UI updates
 * - Error handling and recovery
 * 
 * Requirements: 1.1, 1.3, 1.4, 2.1, 2.3, 2.4, 8.1, 8.4, 11.3, 11.4, 11.5
 */

class DashboardService {
  /**
   * Creates a new DashboardService instance
   * @param {Object} config - Configuration object
   * @param {Object} config.turso - Turso DB configuration
   * @param {string} config.turso.databaseUrl - Turso database URL
   * @param {string} config.turso.authToken - Turso authentication token
   * @param {Object} config.squad - Squad API configuration
   * @param {string} config.squad.secretKey - Squad API secret key
   * @param {string} config.squad.environment - 'sandbox' or 'production'
   * @param {string} config.holdingAccount - Central holding account number
   * @param {Object} [config.aiEngine] - AI Engine configuration (optional)
   * @param {string} [config.aiEngine.url] - AI Engine URL
   */
  constructor(config) {
    // Initialize all services (Requirement 8.1)
    this.transactionService = new TransactionService(config);
    this.balanceService = new BalanceService(config);
    this.trustScoreService = new TrustScoreService(config);
    this.stateMachineService = new StateMachineService(config);
    
    // IsolationForestService is optional (Python engine may be offline in dev)
    this.isolationForestService = config.aiEngine ? new IsolationForestService(config) : null;
    
    // Polling configuration (Requirement 11.3, 11.4)
    this.pollingIntervals = {
      squadAPI: 30000,  // 30 seconds for Squad API balance updates
      tursoDB: 10000    // 10 seconds for Turso DB transaction updates
    };
    
    // Polling interval IDs
    this.pollingTimers = {
      squadAPI: null,
      tursoDB: null
    };
    
    // User context
    this.userId = null;
    this.virtualAccountNumber = null;
    this.userData = null;
    
    // Dashboard state
    this.initialized = false;
    this.isPolling = false;
    
    console.log('[DashboardService] Service initialized');
  }
  
  /**
   * Initializes the dashboard with user data and starts polling
   * @param {number} userId - User ID
   * @returns {Promise<Object>} { success: boolean, userData: Object, message?: string }
   */
  async initialize(userId) {
    try {
      console.log('[DashboardService] ========================================');
      console.log('[DashboardService] Initializing dashboard for user:', userId);
      
      // Store user ID
      this.userId = userId;
      
      // Load user data from database
      const userDataResult = await this.loadUserData(userId);
      
      if (!userDataResult.success) {
        throw new Error(userDataResult.message || 'Failed to load user data');
      }
      
      this.userData = userDataResult.userData;
      this.virtualAccountNumber = userDataResult.userData.virtual_account_number;
      
      console.log('[DashboardService] User data loaded:', {
        userId: this.userId,
        firstName: this.userData.first_name,
        virtualAccount: this.virtualAccountNumber
      });
      
      // Initial data load (Requirement 1.1, 1.3)
      await Promise.all([
        this.refreshBalances(),
        this.refreshTransactions(),
        this.refreshTrustScore()
      ]);
      
      // Start polling for real-time updates (Requirement 11.3, 11.4)
      this.startPolling();
      
      this.initialized = true;
      
      console.log('[DashboardService] ✅ Dashboard initialized successfully');
      console.log('[DashboardService] ========================================');
      
      return {
        success: true,
        userData: this.userData
      };
      
    } catch (error) {
      console.error('[DashboardService] ❌ Dashboard initialization failed:', error);
      console.log('[DashboardService] ========================================');
      
      return {
        success: false,
        message: 'Failed to initialize dashboard: ' + error.message
      };
    }
  }
  
  /**
   * Loads user data from Turso DB
   * @private
   * @param {number} userId - User ID
   * @returns {Promise<Object>} { success: boolean, userData: Object, message?: string }
   */
  async loadUserData(userId) {
    try {
      console.log('[DashboardService] Loading user data for user:', userId);
      
      // Connect to database
      await this.transactionService.connect();
      
      // Query user data
      const sql = 'SELECT * FROM users WHERE id = ? LIMIT 1';
      const result = await this.transactionService.dbService._executeHttp(sql, [userId]);
      
      const executeResult = result.results[0].response.result;
      const rows = executeResult.rows;
      const cols = executeResult.cols;
      
      if (rows.length === 0) {
        throw new Error('User not found');
      }
      
      // Convert row to object
      const userData = {};
      cols.forEach((col, index) => {
        const cellValue = rows[0][index];
        userData[col.name] = typeof cellValue === 'object' && cellValue.value !== undefined 
          ? cellValue.value 
          : cellValue;
      });
      
      console.log('[DashboardService] ✅ User data loaded successfully');
      
      return {
        success: true,
        userData
      };
      
    } catch (error) {
      console.error('[DashboardService] Load user data failed:', error);
      
      return {
        success: false,
        message: 'Failed to load user data: ' + error.message
      };
    }
  }
  
  /**
   * Refreshes balance displays (available and locked)
   * @returns {Promise<Object>} { success: boolean, balances: Object, message?: string }
   */
  async refreshBalances() {
    try {
      console.log('[DashboardService] Refreshing balances...');
      
      if (!this.userId || !this.virtualAccountNumber) {
        throw new Error('Dashboard not initialized');
      }
      
      // Fetch balances from BalanceService (Requirement 1.1, 1.3)
      const balancesResult = await this.balanceService.getBalances(
        this.userId,
        this.virtualAccountNumber
      );
      
      if (!balancesResult.success) {
        console.warn('[DashboardService] ⚠️ Balance refresh failed:', balancesResult.message);
        
        return {
          success: false,
          message: balancesResult.message
        };
      }
      
      console.log('[DashboardService] ✅ Balances refreshed:', {
        available: balancesResult.available,
        locked: balancesResult.locked,
        total: balancesResult.total,
        cached: balancesResult.cached,
        stale: balancesResult.stale
      });
      
      // Validate balance invariant (Requirement 1.4)
      if (!balancesResult.invariantValid) {
        console.error('[DashboardService] ❌ Balance invariant violation detected!');
      }
      
      return {
        success: true,
        balances: {
          available: balancesResult.available,
          locked: balancesResult.locked,
          total: balancesResult.total,
          invariantValid: balancesResult.invariantValid,
          cached: balancesResult.cached,
          stale: balancesResult.stale
        }
      };
      
    } catch (error) {
      console.error('[DashboardService] Refresh balances failed:', error);
      
      return {
        success: false,
        message: 'Failed to refresh balances: ' + error.message
      };
    }
  }
  
  /**
   * Refreshes transaction lists (active transactions)
   * @returns {Promise<Object>} { success: boolean, transactions: Object, message?: string }
   */
  async refreshTransactions() {
    try {
      console.log('[DashboardService] Refreshing transactions...');
      
      if (!this.userId) {
        throw new Error('Dashboard not initialized');
      }
      
      // Fetch active transactions from TransactionService (Requirement 8.1)
      const transactionsResult = await this.transactionService.getActiveTransactions(this.userId);
      
      console.log('[DashboardService] ✅ Transactions refreshed:', {
        awaitingFunding: transactionsResult.awaitingFunding.length,
        funded: transactionsResult.funded.length,
        inTransit: transactionsResult.inTransit.length,
        disputed: transactionsResult.disputed.length
      });
      
      return {
        success: true,
        transactions: transactionsResult
      };
      
    } catch (error) {
      console.error('[DashboardService] Refresh transactions failed:', error);
      
      return {
        success: false,
        message: 'Failed to refresh transactions: ' + error.message
      };
    }
  }
  
  /**
   * Refreshes trust score display
   * @returns {Promise<Object>} { success: boolean, trustScore: Object, message?: string }
   */
  async refreshTrustScore() {
    try {
      console.log('[DashboardService] Refreshing trust score...');
      
      if (!this.userId) {
        throw new Error('Dashboard not initialized');
      }
      
      // Fetch trust score from TrustScoreService (Requirement 2.1, 2.3)
      const trustScoreResult = await this.trustScoreService.getTrustScoreWithIndicator(this.userId);
      
      if (!trustScoreResult.success) {
        console.warn('[DashboardService] ⚠️ Trust score refresh failed:', trustScoreResult.message);
        
        return {
          success: false,
          message: trustScoreResult.message
        };
      }
      
      console.log('[DashboardService] ✅ Trust score refreshed:', {
        score: trustScoreResult.score,
        indicator: trustScoreResult.indicator.label,
        cached: trustScoreResult.cached
      });
      
      return {
        success: true,
        trustScore: {
          score: trustScoreResult.score,
          indicator: trustScoreResult.indicator,
          totalTransactions: trustScoreResult.totalTransactions,
          successfulTransactions: trustScoreResult.successfulTransactions,
          cached: trustScoreResult.cached
        }
      };
      
    } catch (error) {
      console.error('[DashboardService] Refresh trust score failed:', error);
      
      return {
        success: false,
        message: 'Failed to refresh trust score: ' + error.message
      };
    }
  }
  
  /**
   * Starts polling for real-time updates
   * @returns {void}
   */
  startPolling() {
    if (this.isPolling) {
      console.log('[DashboardService] Polling already active');
      return;
    }
    
    console.log('[DashboardService] Starting polling:', {
      squadAPIInterval: this.pollingIntervals.squadAPI + 'ms',
      tursoDBInterval: this.pollingIntervals.tursoDB + 'ms'
    });
    
    // Squad API polling (30 seconds) - Balance updates (Requirement 11.3)
    this.pollingTimers.squadAPI = setInterval(async () => {
      try {
        console.log('[DashboardService] [Poll] Squad API balance update...');
        
        // Clear cache to force fresh fetch from Squad API
        this.balanceService.clearCache();
        
        const result = await this.refreshBalances();
        
        if (result.success) {
          console.log('[DashboardService] [Poll] ✅ Squad API balance updated');
          
          // Emit event for UI update
          this.emitEvent('balancesUpdated', result.balances);
        } else {
          console.warn('[DashboardService] [Poll] ⚠️ Squad API balance update failed:', result.message);
        }
        
      } catch (error) {
        console.error('[DashboardService] [Poll] Squad API polling error:', error);
        // Don't stop polling on error - continue trying
      }
    }, this.pollingIntervals.squadAPI);
    
    // Turso DB polling (10 seconds) - Transaction updates (Requirement 11.4)
    this.pollingTimers.tursoDB = setInterval(async () => {
      try {
        console.log('[DashboardService] [Poll] Turso DB transaction update...');
        
        const result = await this.refreshTransactions();
        
        if (result.success) {
          console.log('[DashboardService] [Poll] ✅ Turso DB transactions updated');
          
          // Emit event for UI update
          this.emitEvent('transactionsUpdated', result.transactions);
          
          // Also refresh locked balance since transactions changed
          const balanceResult = await this.refreshBalances();
          if (balanceResult.success) {
            this.emitEvent('balancesUpdated', balanceResult.balances);
          }
        } else {
          console.warn('[DashboardService] [Poll] ⚠️ Turso DB transaction update failed:', result.message);
        }
        
      } catch (error) {
        console.error('[DashboardService] [Poll] Turso DB polling error:', error);
        // Don't stop polling on error - continue trying
      }
    }, this.pollingIntervals.tursoDB);
    
    this.isPolling = true;
    
    console.log('[DashboardService] ✅ Polling started');
  }
  
  /**
   * Stops polling for cleanup
   * @returns {void}
   */
  stopPolling() {
    if (!this.isPolling) {
      console.log('[DashboardService] Polling not active');
      return;
    }
    
    console.log('[DashboardService] Stopping polling...');
    
    // Clear Squad API polling interval
    if (this.pollingTimers.squadAPI) {
      clearInterval(this.pollingTimers.squadAPI);
      this.pollingTimers.squadAPI = null;
      console.log('[DashboardService] Squad API polling stopped');
    }
    
    // Clear Turso DB polling interval
    if (this.pollingTimers.tursoDB) {
      clearInterval(this.pollingTimers.tursoDB);
      this.pollingTimers.tursoDB = null;
      console.log('[DashboardService] Turso DB polling stopped');
    }
    
    this.isPolling = false;
    
    console.log('[DashboardService] ✅ Polling stopped');
  }
  
  /**
   * Emits an event for UI updates
   * @private
   * @param {string} eventName - Event name
   * @param {*} data - Event data
   * @returns {void}
   */
  emitEvent(eventName, data) {
    // Dispatch custom event for UI to listen to
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('dashboardUpdate', {
        detail: {
          type: eventName,
          data: data,
          timestamp: new Date().toISOString()
        }
      });
      
      window.dispatchEvent(event);
      
      console.log('[DashboardService] Event emitted:', eventName);
    }
  }
  
  /**
   * Creates a new transaction (seller action)
   * @param {Object} transactionData - Transaction data
   * @returns {Promise<Object>} { success: boolean, transaction: Object, message?: string }
   */
  async createTransaction(transactionData) {
    try {
      console.log('[DashboardService] Creating transaction...');
      
      if (!this.userId) {
        throw new Error('Dashboard not initialized');
      }
      
      // Add seller ID to transaction data
      const data = {
        ...transactionData,
        sellerId: this.userId
      };
      
      // Create transaction via TransactionService
      const transaction = await this.transactionService.createTransaction(data);
      
      console.log('[DashboardService] ✅ Transaction created:', transaction.transaction_id);
      
      // Optimistic UI update - refresh transactions immediately
      await this.refreshTransactions();
      
      return {
        success: true,
        transaction
      };
      
    } catch (error) {
      console.error('[DashboardService] Create transaction failed:', error);
      
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Funds a transaction (buyer action)
   * @param {string} transactionId - Transaction ID
   * @param {Object} metadata - Additional metadata (buyerAccount, etc.)
   * @returns {Promise<Object>} { success: boolean, newState: string, message?: string }
   */
  async fundTransaction(transactionId, metadata) {
    try {
      console.log('[DashboardService] Funding transaction:', transactionId);
      
      if (!this.userId) {
        throw new Error('Dashboard not initialized');
      }
      
      // Get transaction details
      const transaction = await this.transactionService.getTransaction(transactionId);
      
      if (!transaction) {
        throw new Error('Transaction not found');
      }
      
      // Update buyer ID
      await this.transactionService.updateBuyer(transactionId, this.userId);
      
      // Transition state to Funded_Locked via StateMachineService
      const result = await this.stateMachineService.transitionState(
        transactionId,
        'Funded_Locked',
        this.userId,
        metadata
      );
      
      if (!result.success) {
        throw new Error(result.message);
      }
      
      console.log('[DashboardService] ✅ Transaction funded successfully');
      
      // Optimistic UI update - refresh balances and transactions immediately (Requirement 11.5)
      await Promise.all([
        this.refreshBalances(),
        this.refreshTransactions()
      ]);
      
      return {
        success: true,
        newState: result.newState
      };
      
    } catch (error) {
      console.error('[DashboardService] Fund transaction failed:', error);
      
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Marks transaction as shipped (seller action)
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object>} { success: boolean, newState: string, message?: string }
   */
  async markAsShipped(transactionId) {
    try {
      console.log('[DashboardService] Marking transaction as shipped:', transactionId);
      
      if (!this.userId) {
        throw new Error('Dashboard not initialized');
      }
      
      // Transition state to In_Transit via StateMachineService
      const result = await this.stateMachineService.transitionState(
        transactionId,
        'In_Transit',
        this.userId,
        { shippedBy: this.userId }
      );
      
      if (!result.success) {
        throw new Error(result.message);
      }
      
      console.log('[DashboardService] ✅ Transaction marked as shipped');
      
      // Optimistic UI update - refresh transactions immediately
      await this.refreshTransactions();
      
      return {
        success: true,
        newState: result.newState
      };
      
    } catch (error) {
      console.error('[DashboardService] Mark as shipped failed:', error);
      
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Accepts delivered item (buyer action)
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object>} { success: boolean, newState: string, message?: string }
   */
  async acceptDelivery(transactionId) {
    try {
      console.log('[DashboardService] Accepting delivery:', transactionId);
      
      if (!this.userId) {
        throw new Error('Dashboard not initialized');
      }
      
      // Transition state to Completed via StateMachineService
      const result = await this.stateMachineService.transitionState(
        transactionId,
        'Completed',
        this.userId,
        { acceptedBy: this.userId }
      );
      
      if (!result.success) {
        throw new Error(result.message);
      }
      
      console.log('[DashboardService] ✅ Delivery accepted, transaction completed');
      
      // Optimistic UI update - refresh balances, transactions, and trust score (Requirement 2.4)
      await Promise.all([
        this.refreshBalances(),
        this.refreshTransactions(),
        this.refreshTrustScore()
      ]);
      
      return {
        success: true,
        newState: result.newState
      };
      
    } catch (error) {
      console.error('[DashboardService] Accept delivery failed:', error);
      
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Disputes a transaction (buyer action)
   * @param {string} transactionId - Transaction ID
   * @param {Object} disputeData - Dispute details (description, photos, etc.)
   * @returns {Promise<Object>} { success: boolean, newState: string, message?: string }
   */
  async disputeTransaction(transactionId, disputeData) {
    try {
      console.log('[DashboardService] Disputing transaction:', transactionId);
      
      if (!this.userId) {
        throw new Error('Dashboard not initialized');
      }
      
      // Transition state to Disputed via StateMachineService
      const result = await this.stateMachineService.transitionState(
        transactionId,
        'Disputed',
        this.userId,
        { disputedBy: this.userId, ...disputeData }
      );
      
      if (!result.success) {
        throw new Error(result.message);
      }
      
      console.log('[DashboardService] ✅ Transaction disputed');
      
      // Optimistic UI update - refresh transactions immediately
      await this.refreshTransactions();
      
      return {
        success: true,
        newState: result.newState
      };
      
    } catch (error) {
      console.error('[DashboardService] Dispute transaction failed:', error);
      
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Gets transaction details
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object>} { success: boolean, transaction: Object, message?: string }
   */
  async getTransaction(transactionId) {
    try {
      console.log('[DashboardService] Getting transaction:', transactionId);
      
      const transaction = await this.transactionService.getTransaction(transactionId);
      
      if (!transaction) {
        throw new Error('Transaction not found');
      }
      
      console.log('[DashboardService] ✅ Transaction retrieved');
      
      return {
        success: true,
        transaction
      };
      
    } catch (error) {
      console.error('[DashboardService] Get transaction failed:', error);
      
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Gets transaction history with filters
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} { success: boolean, history: Object, message?: string }
   */
  async getTransactionHistory(filters = {}) {
    try {
      console.log('[DashboardService] Getting transaction history with filters:', filters);
      
      if (!this.userId) {
        throw new Error('Dashboard not initialized');
      }
      
      const history = await this.transactionService.getTransactionHistory(this.userId, filters);
      
      console.log('[DashboardService] ✅ Transaction history retrieved:', history.totalCount, 'transactions');
      
      return {
        success: true,
        history
      };
      
    } catch (error) {
      console.error('[DashboardService] Get transaction history failed:', error);
      
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Recalculates trust score for the current user
   * @returns {Promise<Object>} { success: boolean, trustScore: Object, message?: string }
   */
  async recalculateTrustScore() {
    try {
      console.log('[DashboardService] Recalculating trust score...');
      
      if (!this.userId) {
        throw new Error('Dashboard not initialized');
      }
      
      const result = await this.trustScoreService.recalculateTrustScore(this.userId);
      
      if (!result.success) {
        throw new Error(result.message);
      }
      
      console.log('[DashboardService] ✅ Trust score recalculated:', result.score);
      
      // Refresh trust score display
      await this.refreshTrustScore();
      
      return {
        success: true,
        trustScore: {
          score: result.score,
          totalTransactions: result.totalTransactions,
          successfulTransactions: result.successfulTransactions
        }
      };
      
    } catch (error) {
      console.error('[DashboardService] Recalculate trust score failed:', error);
      
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Cleans up resources and disconnects services
   * @returns {Promise<void>}
   */
  async cleanup() {
    console.log('[DashboardService] Cleaning up...');
    
    // Stop polling
    this.stopPolling();
    
    // Disconnect all services
    await Promise.all([
      this.transactionService.disconnect(),
      this.balanceService.disconnect(),
      this.trustScoreService.disconnect(),
      this.stateMachineService.disconnect()
    ]);
    
    // Reset state
    this.userId = null;
    this.virtualAccountNumber = null;
    this.userData = null;
    this.initialized = false;
    
    console.log('[DashboardService] ✅ Cleanup completed');
  }
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.DashboardService = DashboardService;
}
