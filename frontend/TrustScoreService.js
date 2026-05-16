/**
 * TrustScoreService - Reputation management for ScrowPay Escrow Dashboard
 * 
 * This service provides trust score calculation and management operations including:
 * - Trust score calculation with recency weighting
 * - Trust score recalculation on transaction completion
 * - Visual indicator mapping (color-coded)
 * - Default score handling for new users
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */

class TrustScoreService {
  /**
   * Creates a new TrustScoreService instance
   * @param {Object} config - Configuration object
   * @param {Object} config.turso - Turso DB configuration
   * @param {string} config.turso.databaseUrl - Turso database URL
   * @param {string} config.turso.authToken - Turso authentication token
   */
  constructor(config) {
    this.dbService = new TursoDBService(config.turso.databaseUrl, config.turso.authToken);
    this.connected = false;
    
    // Default trust score for new users (Requirement 2.5)
    this.DEFAULT_SCORE = 50;
    
    // Recency weighting decay constant (30 days)
    this.DECAY_CONSTANT = 30;
  }
  
  /**
   * Connects to the database
   * @returns {Promise<void>}
   */
  async connect() {
    if (!this.connected) {
      await this.dbService.connect();
      this.connected = true;
      console.log('[TrustScoreService] Connected to database');
    }
  }
  
  /**
   * Calculates trust score for a user based on transaction history
   * @param {number} userId - User ID
   * @returns {Promise<Object>} { success: boolean, score: number, totalTransactions: number, successfulTransactions: number, message?: string }
   */
  async calculateTrustScore(userId) {
    try {
      console.log('[TrustScoreService] Calculating trust score for user:', userId);
      
      // Ensure connection
      await this.connect();
      
      // Get completed transactions for the user (Requirement 2.1)
      const sql = `
        SELECT 
          transaction_id,
          state,
          completed_at,
          CASE 
            WHEN transaction_id IN (SELECT transaction_id FROM disputes) THEN 1
            ELSE 0
          END as disputed
        FROM transactions
        WHERE (seller_id = ? OR buyer_id = ?)
        AND state = 'Completed'
        ORDER BY completed_at DESC
      `;
      
      const result = await this.dbService._executeHttp(sql, [userId, userId]);
      
      const executeResult = result.results[0].response.result;
      const rows = executeResult.rows;
      const cols = executeResult.cols;
      
      // Handle new users with zero transactions (Requirement 2.5)
      if (rows.length === 0) {
        console.log('[TrustScoreService] ✅ New user (zero transactions), returning default score:', this.DEFAULT_SCORE);
        return {
          success: true,
          score: this.DEFAULT_SCORE,
          totalTransactions: 0,
          successfulTransactions: 0,
          isDefault: true
        };
      }
      
      // Convert rows to transaction objects
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
      
      console.log('[TrustScoreService] Found', transactions.length, 'completed transactions');
      
      // Calculate trust score with recency weighting (Requirement 2.7)
      const score = this.applyRecencyWeighting(transactions);
      
      // Count successful transactions (not disputed). Turso often returns INTEGER
      // columns as strings (e.g. "0"); strict `=== 0` would treat clean deals as disputed.
      const successfulTransactions = transactions.filter(
        (t) => Number(t.disputed) !== 1 && t.disputed !== true
      ).length;
      
      console.log('[TrustScoreService] ✅ Trust score calculated:', {
        score,
        totalTransactions: transactions.length,
        successfulTransactions
      });
      
      return {
        success: true,
        score,
        totalTransactions: transactions.length,
        successfulTransactions,
        isDefault: false
      };
      
    } catch (error) {
      console.error('[TrustScoreService] Calculate trust score failed:', error);
      
      // If table doesn't exist, return default score
      if (error.message.includes('no such table')) {
        console.log('[TrustScoreService] Transactions table does not exist yet, returning default score');
        return {
          success: true,
          score: this.DEFAULT_SCORE,
          totalTransactions: 0,
          successfulTransactions: 0,
          isDefault: true
        };
      }
      
      return {
        success: false,
        score: this.DEFAULT_SCORE,
        totalTransactions: 0,
        successfulTransactions: 0,
        message: 'Failed to calculate trust score: ' + error.message
      };
    }
  }
  
  /**
   * Applies recency weighting to transaction history
   * Formula: (successful/total) * 100, weight = e^(-days/30)
   * @private
   * @param {Array} transactions - Array of transaction objects with completed_at and disputed fields
   * @returns {number} Weighted trust score (1-100)
   */
  applyRecencyWeighting(transactions) {
    if (transactions.length === 0) {
      return this.DEFAULT_SCORE;
    }
    
    const now = Date.now();
    let weightedScore = 0;
    let totalWeight = 0;
    
    // Calculate weighted score (Requirement 2.7)
    transactions.forEach(txn => {
      // Calculate days since completion
      const completedAt = new Date(txn.completed_at).getTime();
      const daysAgo = (now - completedAt) / (1000 * 60 * 60 * 24);
      
      // Calculate exponential decay weight: weight = e^(-days/30)
      const weight = Number.isFinite(daysAgo) ? Math.exp(-daysAgo / this.DECAY_CONSTANT) : 1;
      
      // Transaction score: 100 if successful (not disputed), 0 if disputed.
      // Coerce disputed — SQLite/Turso may return `"0"` / `"1"` strings.
      const isDisputed = Number(txn.disputed) === 1 || txn.disputed === true;
      const txnScore = isDisputed ? 0 : 100;
      
      // Accumulate weighted score
      weightedScore += txnScore * weight;
      totalWeight += weight;
    });
    
    // Calculate final score
    const finalScore = totalWeight > 0 ? weightedScore / totalWeight : this.DEFAULT_SCORE;
    
    // Ensure score is between 1 and 100 (Requirement 2.2)
    return Math.round(Math.max(1, Math.min(100, finalScore)));
  }
  
  /**
   * Recalculates trust score for a user and updates the cache
   * @param {number} userId - User ID
   * @returns {Promise<Object>} { success: boolean, score: number, message?: string }
   */
  async recalculateTrustScore(userId) {
    try {
      console.log('[TrustScoreService] Recalculating trust score for user:', userId);
      
      // Calculate new trust score
      const result = await this.calculateTrustScore(userId);
      
      if (!result.success) {
        return result;
      }
      
      // Update trust_scores cache table
      await this.updateTrustScoreCache(userId, result.score, result.totalTransactions, result.successfulTransactions);
      
      console.log('[TrustScoreService] ✅ Trust score recalculated and cached:', result.score);
      
      return {
        success: true,
        score: result.score,
        totalTransactions: result.totalTransactions,
        successfulTransactions: result.successfulTransactions
      };
      
    } catch (error) {
      console.error('[TrustScoreService] Recalculate trust score failed:', error);
      
      return {
        success: false,
        score: this.DEFAULT_SCORE,
        message: 'Failed to recalculate trust score: ' + error.message
      };
    }
  }
  
  /**
   * Updates the trust_scores cache table
   * @private
   * @param {number} userId - User ID
   * @param {number} score - Calculated trust score
   * @param {number} totalTransactions - Total completed transactions
   * @param {number} successfulTransactions - Successful (non-disputed) transactions
   * @returns {Promise<void>}
   */
  async updateTrustScoreCache(userId, score, totalTransactions, successfulTransactions) {
    try {
      // Ensure connection
      await this.connect();
      
      // Calculate disputed transactions
      const disputedTransactions = totalTransactions - successfulTransactions;
      
      // Upsert into trust_scores table
      const sql = `
        INSERT INTO trust_scores (
          user_id, 
          score, 
          total_transactions, 
          successful_transactions, 
          disputed_transactions,
          last_calculated_at
        ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
          score = excluded.score,
          total_transactions = excluded.total_transactions,
          successful_transactions = excluded.successful_transactions,
          disputed_transactions = excluded.disputed_transactions,
          last_calculated_at = CURRENT_TIMESTAMP
      `;
      
      await this.dbService._executeHttp(sql, [
        userId,
        score,
        totalTransactions,
        successfulTransactions,
        disputedTransactions
      ]);
      
      console.log('[TrustScoreService] ✅ Trust score cache updated');
      
    } catch (error) {
      console.error('[TrustScoreService] Update trust score cache failed:', error);
      
      // If table doesn't exist, log warning but don't throw
      if (error.message.includes('no such table')) {
        console.warn('[TrustScoreService] ⚠️ trust_scores table does not exist yet');
        return;
      }
      
      throw error;
    }
  }
  
  /**
   * Gets cached trust score from trust_scores table
   * @param {number} userId - User ID
   * @returns {Promise<Object|null>} Cached trust score object or null if not found
   */
  async getCachedTrustScore(userId) {
    try {
      // Ensure connection
      await this.connect();
      
      const sql = `
        SELECT 
          score,
          total_transactions,
          successful_transactions,
          disputed_transactions,
          last_calculated_at
        FROM trust_scores
        WHERE user_id = ?
      `;
      
      const result = await this.dbService._executeHttp(sql, [userId]);
      
      const executeResult = result.results[0].response.result;
      const rows = executeResult.rows;
      const cols = executeResult.cols;
      
      if (rows.length === 0) {
        return null;
      }
      
      // Convert row to object
      const cached = {};
      cols.forEach((col, index) => {
        const cellValue = rows[0][index];
        cached[col.name] = typeof cellValue === 'object' && cellValue.value !== undefined 
          ? cellValue.value 
          : cellValue;
      });
      
      return {
        score: parseFloat(cached.score),
        totalTransactions: parseInt(cached.total_transactions),
        successfulTransactions: parseInt(cached.successful_transactions),
        disputedTransactions: parseInt(cached.disputed_transactions),
        lastCalculatedAt: cached.last_calculated_at
      };
      
    } catch (error) {
      console.error('[TrustScoreService] Get cached trust score failed:', error);
      
      // If table doesn't exist, return null
      if (error.message.includes('no such table')) {
        return null;
      }
      
      return null;
    }
  }
  
  /**
   * Gets visual indicator (color) for a trust score
   * @param {number} score - Trust score (1-100)
   * @returns {Object} { color: string, label: string, class: string }
   */
  getVisualIndicator(score) {
    // Requirement 2.6: red <40, yellow 40-70, green >70
    if (score < 40) {
      return {
        color: '#ff6b6b',
        label: 'Low',
        class: 'trust-score-low',
        textColor: '#ffffff'
      };
    } else if (score >= 40 && score <= 70) {
      return {
        color: '#ffd93d',
        label: 'Medium',
        class: 'trust-score-medium',
        textColor: '#1c1c1c'
      };
    } else {
      return {
        color: '#caff04',
        label: 'High',
        class: 'trust-score-high',
        textColor: '#1c1c1c'
      };
    }
  }
  
  /**
   * Formats trust score for display
   * @param {number} score - Trust score (1-100)
   * @returns {string} Formatted score (e.g., "85")
   */
  formatScore(score) {
    // Ensure score is a number
    const numericScore = typeof score === 'number' ? score : parseFloat(score) || this.DEFAULT_SCORE;
    
    // Round to nearest integer (Requirement 2.2)
    return Math.round(numericScore).toString();
  }
  
  /**
   * Gets trust score with visual indicator
   * @param {number} userId - User ID
   * @returns {Promise<Object>} { success: boolean, score: number, indicator: Object, message?: string }
   */
  async getTrustScoreWithIndicator(userId) {
    try {
      // Try to get cached score first
      const cached = await this.getCachedTrustScore(userId);
      
      let scoreResult;
      
      if (cached) {
        console.log('[TrustScoreService] Using cached trust score:', cached.score);
        scoreResult = {
          success: true,
          score: cached.score,
          totalTransactions: cached.totalTransactions,
          successfulTransactions: cached.successfulTransactions,
          cached: true
        };
      } else {
        // Calculate fresh score
        scoreResult = await this.calculateTrustScore(userId);
      }
      
      if (!scoreResult.success) {
        return scoreResult;
      }
      
      // Get visual indicator
      const indicator = this.getVisualIndicator(scoreResult.score);
      
      return {
        success: true,
        score: scoreResult.score,
        indicator,
        totalTransactions: scoreResult.totalTransactions,
        successfulTransactions: scoreResult.successfulTransactions,
        cached: scoreResult.cached || false
      };
      
    } catch (error) {
      console.error('[TrustScoreService] Get trust score with indicator failed:', error);
      
      return {
        success: false,
        score: this.DEFAULT_SCORE,
        indicator: this.getVisualIndicator(this.DEFAULT_SCORE),
        message: 'Failed to get trust score: ' + error.message
      };
    }
  }
  
  /**
   * Initializes trust score for a new user (Requirement 20.6)
   * @param {number} userId - User ID
   * @param {number} score - Initial trust score (default 50)
   * @returns {Promise<Object>} { success: boolean, message?: string }
   */
  async initializeTrustScore(userId, score = 50) {
    try {
      console.log('[TrustScoreService] Initializing trust score for new user:', userId, 'with score:', score);
      
      // Ensure connection
      await this.connect();
      
      // Insert initial trust score into trust_scores table
      const sql = `
        INSERT INTO trust_scores (
          user_id, 
          score, 
          total_transactions, 
          successful_transactions, 
          disputed_transactions,
          last_calculated_at
        ) VALUES (?, ?, 0, 0, 0, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO NOTHING
      `;
      
      await this.dbService._executeHttp(sql, [userId, score]);
      
      console.log('[TrustScoreService] ✅ Trust score initialized for new user');
      
      return {
        success: true
      };
      
    } catch (error) {
      console.error('[TrustScoreService] Initialize trust score failed:', error);
      
      // If table doesn't exist, log warning but don't throw
      if (error.message.includes('no such table')) {
        console.warn('[TrustScoreService] ⚠️ trust_scores table does not exist yet');
        return {
          success: false,
          message: 'Trust scores table does not exist'
        };
      }
      
      return {
        success: false,
        message: 'Failed to initialize trust score: ' + error.message
      };
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
      console.log('[TrustScoreService] Disconnected from database');
    }
  }
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.TrustScoreService = TrustScoreService;
}
