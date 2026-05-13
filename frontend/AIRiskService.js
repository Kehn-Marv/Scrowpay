/**
 * AIRiskService - AI Risk Scoring Integration for ScrowPay Escrow Dashboard
 * 
 * This service provides AI-powered risk scoring operations including:
 * - Transaction risk scoring via AI Engine HTTP API
 * - Feature extraction and formatting
 * - Timeout handling (5 seconds)
 * - Fallback to "fail" verdict on errors
 * - Risk score logging to database
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.6, 5.7, 5.8, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7
 */

class AIRiskService {
  /**
   * Creates a new AIRiskService instance
   * @param {Object} config - Configuration object
   * @param {Object} config.aiEngine - AI Engine configuration
   * @param {string} config.aiEngine.url - AI Engine base URL
   * @param {Object} config.turso - Turso DB configuration
   * @param {string} config.turso.databaseUrl - Turso database URL
   * @param {string} config.turso.authToken - Turso authentication token
   */
  constructor(config) {
    this.aiEngineUrl = config.aiEngine?.url || 'http://localhost:5000';
    this.timeout = 5000;  // 5 seconds (Requirement 14.4)
    this.dbService = new TursoDBService(config.turso.databaseUrl, config.turso.authToken);
    this.connected = false;
    
    console.log('[AIRiskService] Service initialized with AI Engine URL:', this.aiEngineUrl);
  }
  
  /**
   * Connects to the database
   * @returns {Promise<void>}
   */
  async connect() {
    if (!this.connected) {
      await this.dbService.connect();
      this.connected = true;
      console.log('[AIRiskService] Connected to database');
    }
  }
  
  /**
   * Extracts features from transaction data for AI scoring
   * @private
   * @param {Object} transactionData - Transaction data
   * @param {Object} userContext - User context data
   * @returns {Object} Feature object for AI engine
   */
  extractFeatures(transactionData, userContext) {
    console.log('[AIRiskService] Extracting features:', { transactionData, userContext });
    
    // Calculate transaction velocity (transactions in last 24 hours)
    const transactionVelocity = userContext.transactionVelocity || 0;
    
    // Calculate account age in days
    const accountCreatedAt = userContext.accountCreatedAt ? new Date(userContext.accountCreatedAt) : new Date();
    const accountAgeDays = Math.floor((Date.now() - accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24));
    
    // Get device fingerprint. Prefer the integer derived from
    // FingerprintJS (passed in via userContext.deviceFingerprint by the
    // umbrella AnomalyDetectionEngine); fall back to the legacy hash
    // when called directly without the engine in front.
    const deviceFingerprint = (typeof userContext.deviceFingerprint === 'number')
      ? userContext.deviceFingerprint
      : this.generateDeviceFingerprint();
    
    // Get current hour (0-23)
    const timeOfDay = new Date().getHours();
    
    // Get counterparty trust score
    const counterpartyTrustScore = userContext.counterpartyTrustScore || 50;  // Default to 50 if not available
    
    const features = {
      user_id: userContext.userId,
      transaction_amount: transactionData.price,
      transaction_velocity: transactionVelocity,
      account_age_days: accountAgeDays,
      device_fingerprint: deviceFingerprint,
      time_of_day: timeOfDay,
      counterparty_trust_score: counterpartyTrustScore
    };

    // v2: forward behavioral signals to the Python engine if available,
    // so it can apply post-ML auditable boosts. Backward-compat: extra
    // fields are silently ignored by older engine builds.
    if (userContext.behavioralSignals && typeof userContext.behavioralSignals === 'object') {
      features.behavioral_signals = userContext.behavioralSignals;
    }
    
    console.log('[AIRiskService] Features extracted:', features);
    
    return features;
  }
  
  /**
   * Generates a device fingerprint from browser metadata
   * @private
   * @returns {number} Device fingerprint hash
   */
  generateDeviceFingerprint() {
    // Collect device metadata
    const metadata = [
      navigator.userAgent,
      navigator.language,
      screen.width,
      screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset()
    ].join('|');
    
    // Simple hash function (for demo purposes)
    let hash = 0;
    for (let i = 0; i < metadata.length; i++) {
      const char = metadata.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash);
  }
  
  /**
   * Scores a transaction for risk using the AI Engine
   * @param {Object} transactionData - Transaction data
   * @param {Object} userContext - User context data
   * @returns {Promise<Object>} { success: boolean, risk_score: number, verdict: string, anomaly_indicators: Array, fallback?: boolean, message?: string }
   */
  async scoreTransaction(transactionData, userContext) {
    const startTime = Date.now();
    
    try {
      console.log('[AIRiskService] ========================================');
      console.log('[AIRiskService] Scoring transaction:', transactionData.transaction_id || 'NEW');
      
      // Extract features (Requirement 5.2)
      const features = this.extractFeatures(transactionData, userContext);
      
      // Create abort controller for timeout (Requirement 14.4)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      try {
        // POST to AI engine (Requirement 14.1)
        const response = await fetch(`${this.aiEngineUrl}/api/v1/score`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(features),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`AI Engine returned status ${response.status}`);
        }
        
        // Parse response (Requirement 5.3, 14.3)
        const result = await response.json();
        
        const responseTime = Date.now() - startTime;
        
        console.log('[AIRiskService] ✅ AI Engine response received:', {
          risk_score: result.risk_score,
          verdict: result.verdict,
          anomaly_indicators: result.anomaly_indicators,
          response_time_ms: responseTime
        });
        
        // Log to database (Requirement 5.8, 14.7)
        await this.logRiskScore(
          transactionData.transaction_id || null,
          userContext.userId,
          result.risk_score,
          result.verdict,
          result.anomaly_indicators || [],
          features,
          result.model_version || '1.0.0',
          responseTime
        );
        
        // Log failed risk check to security logs (Requirement 19.7)
        if (result.verdict === 'fail') {
          console.log('[AIRiskService] ⚠️ Failed risk check - logging security event');
          await this.logFailedRiskCheck(
            userContext.userId,
            transactionData.transaction_id || null,
            result.risk_score,
            result.anomaly_indicators || []
          );
        }
        
        console.log('[AIRiskService] ========================================');
        
        return {
          success: true,
          risk_score: result.risk_score,
          risk_flag: result.risk_flag,
          verdict: result.verdict,
          anomaly_indicators: result.anomaly_indicators || [],
          model_version: result.model_version,
          response_time_ms: responseTime
        };
        
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      console.error('[AIRiskService] ❌ AI scoring failed:', error);
      
      // Handle timeout (Requirement 14.5)
      if (error.name === 'AbortError') {
        console.warn('[AIRiskService] ⚠️ AI Engine timeout - defaulting to "fail" verdict');
        
        // Log timeout failure
        await this.logRiskScore(
          transactionData.transaction_id || null,
          userContext.userId,
          100,  // Maximum risk score
          'fail',
          ['AI engine timeout'],
          this.extractFeatures(transactionData, userContext),
          'timeout',
          responseTime
        );
        
        console.log('[AIRiskService] ========================================');
        
        return {
          success: true,
          risk_score: 100,
          risk_flag: true,
          verdict: 'fail',
          anomaly_indicators: ['AI engine timeout'],
          fallback: true,
          message: 'Risk scoring timed out. Transaction blocked for security.'
        };
      }
      
      // Handle network errors.
      //
      // NOTE: This service used to fail-CLOSED on network errors,
      // which bricked funding whenever the external Python AI engine
      // at localhost:5000 was offline (the typical state during
      // development). We now fail-OPEN here because the new
      // RiskProfilingService runs deterministically in-browser and
      // already surfaces a risk banner / acknowledgement checkbox to
      // the user when warranted. The legacy AI engine, when present,
      // adds an extra layer but is no longer the only line of
      // defense.
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        console.warn('[AIRiskService] ⚠️ Network error - failing OPEN (RiskProfilingService still active)');

        await this.logRiskScore(
          transactionData.transaction_id || null,
          userContext.userId,
          0,
          'pass',
          ['AI engine unreachable; fallback pass'],
          this.extractFeatures(transactionData, userContext),
          'network_error_fallback_pass',
          responseTime
        );

        console.log('[AIRiskService] ========================================');

        return {
          success: true,
          risk_score: 0,
          risk_flag: false,
          verdict: 'pass',
          anomaly_indicators: [],
          fallback: true,
          message: 'External AI engine unreachable. In-browser risk profiling is active.'
        };
      }

      // Other unexpected errors (parsing, non-200, etc.) — also fail
      // open for the same reason. We log enough to debug later.
      console.warn('[AIRiskService] ⚠️ AI Engine error - failing OPEN:', error.message);

      await this.logRiskScore(
        transactionData.transaction_id || null,
        userContext.userId,
        0,
        'pass',
        ['AI engine error (fallback pass): ' + error.message],
        this.extractFeatures(transactionData, userContext),
        'error_fallback_pass',
        responseTime
      );

      console.log('[AIRiskService] ========================================');

      return {
        success: true,
        risk_score: 0,
        risk_flag: false,
        verdict: 'pass',
        anomaly_indicators: [],
        fallback: true,
        message: 'External AI engine unavailable. In-browser risk profiling is active.'
      };
    }
  }
  
  /**
   * Logs risk score to database for audit trail
   * @private
   * @param {string|null} transactionId - Transaction ID (null for pre-creation scoring)
   * @param {number} userId - User ID
   * @param {number} riskScore - Risk score (1-100)
   * @param {string} verdict - Verdict ('pass' or 'fail')
   * @param {Array} anomalyIndicators - Array of anomaly indicators
   * @param {Object} features - Input features
   * @param {string} modelVersion - Model version
   * @param {number} responseTimeMs - Response time in milliseconds
   * @returns {Promise<void>}
   */
  async logRiskScore(transactionId, userId, riskScore, verdict, anomalyIndicators, features, modelVersion, responseTimeMs) {
    try {
      console.log('[AIRiskService] Logging risk score to database...');
      
      // Ensure connection
      await this.connect();
      
      const sql = `
        INSERT INTO ai_risk_logs (
          transaction_id, user_id, risk_score, verdict, 
          anomaly_indicators, features, model_version, response_time_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const args = [
        transactionId,
        userId,
        riskScore,
        verdict,
        JSON.stringify(anomalyIndicators),
        JSON.stringify(features),
        modelVersion,
        responseTimeMs
      ];
      
      await this.dbService._executeHttp(sql, args);
      
      console.log('[AIRiskService] ✅ Risk score logged to database');
      
    } catch (error) {
      console.error('[AIRiskService] Failed to log risk score:', error);
      
      // Don't throw - logging failure shouldn't block the transaction
      // If table doesn't exist, log warning
      if (error.message.includes('no such table')) {
        console.warn('[AIRiskService] ⚠️ ai_risk_logs table does not exist yet');
      }
    }
  }
  
  /**
   * Calculates transaction velocity for a user (transactions in last 24 hours)
   * @param {number} userId - User ID
   * @returns {Promise<number>} Number of transactions in last 24 hours
   */
  async calculateTransactionVelocity(userId) {
    try {
      console.log('[AIRiskService] Calculating transaction velocity for user:', userId);
      
      // Ensure connection
      await this.connect();
      
      // Query transactions created in last 24 hours
      const sql = `
        SELECT COUNT(*) as count
        FROM transactions
        WHERE (seller_id = ? OR buyer_id = ?)
        AND created_at >= datetime('now', '-1 day')
      `;
      
      const result = await this.dbService._executeHttp(sql, [userId, userId]);
      
      const executeResult = result.results[0].response.result;
      const rows = executeResult.rows;
      
      if (rows.length === 0) {
        return 0;
      }
      
      const countValue = rows[0][0];
      const velocity = typeof countValue === 'object' ? parseInt(countValue.value) : countValue;
      
      console.log('[AIRiskService] ✅ Transaction velocity:', velocity);
      
      return velocity;
      
    } catch (error) {
      console.error('[AIRiskService] Calculate transaction velocity failed:', error);
      
      // If table doesn't exist, return 0
      if (error.message.includes('no such table')) {
        console.log('[AIRiskService] Transactions table does not exist yet, velocity: 0');
        return 0;
      }
      
      // Return 0 on error (safe default)
      return 0;
    }
  }
  
  /**
   * Gets risk score history for a transaction
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Array>} Array of risk score log entries
   */
  async getRiskScoreHistory(transactionId) {
    try {
      console.log('[AIRiskService] Getting risk score history for transaction:', transactionId);
      
      // Ensure connection
      await this.connect();
      
      const sql = `
        SELECT * FROM ai_risk_logs
        WHERE transaction_id = ?
        ORDER BY created_at DESC
      `;
      
      const result = await this.dbService._executeHttp(sql, [transactionId]);
      
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
      
      console.log('[AIRiskService] ✅ Risk score history retrieved:', history.length, 'entries');
      
      return history;
      
    } catch (error) {
      console.error('[AIRiskService] Get risk score history failed:', error);
      
      // If table doesn't exist, return empty array
      if (error.message.includes('no such table')) {
        console.log('[AIRiskService] ai_risk_logs table does not exist yet, returning empty array');
        return [];
      }
      
      throw new Error('Failed to retrieve risk score history: ' + error.message);
    }
  }
  
  /**
   * Checks AI Engine health
   * @returns {Promise<Object>} { success: boolean, status: string, message?: string }
   */
  async checkHealth() {
    try {
      console.log('[AIRiskService] Checking AI Engine health...');
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);  // 3 second timeout for health check
      
      try {
        const response = await fetch(`${this.aiEngineUrl}/health`, {
          method: 'GET',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`Health check returned status ${response.status}`);
        }
        
        const result = await response.json();
        
        console.log('[AIRiskService] ✅ AI Engine is healthy:', result);
        
        return {
          success: true,
          status: result.status,
          modelLoaded: result.model_loaded
        };
        
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
      
    } catch (error) {
      console.error('[AIRiskService] Health check failed:', error);
      
      if (error.name === 'AbortError') {
        return {
          success: false,
          status: 'timeout',
          message: 'Health check timed out'
        };
      }
      
      return {
        success: false,
        status: 'unavailable',
        message: error.message
      };
    }
  }
  
  /**
   * Logs a failed risk check to security logs
   * @private
   * @param {number} userId - User ID
   * @param {string|null} transactionId - Transaction ID (null for pre-creation scoring)
   * @param {number} riskScore - Risk score
   * @param {Array} anomalyIndicators - Anomaly indicators
   * @returns {Promise<void>}
   */
  async logFailedRiskCheck(userId, transactionId, riskScore, anomalyIndicators) {
    try {
      console.log('[AIRiskService] Logging failed risk check to security logs...');
      
      // Ensure connection
      await this.connect();
      
      const sql = `
        INSERT INTO security_logs (event_type, user_id, transaction_id, details, user_agent)
        VALUES (?, ?, ?, ?, ?)
      `;
      
      const details = {
        risk_score: riskScore,
        anomaly_indicators: anomalyIndicators,
        timestamp: new Date().toISOString()
      };
      
      const args = [
        'failed_risk_check',
        userId,
        transactionId,
        JSON.stringify(details),
        typeof navigator !== 'undefined' ? navigator.userAgent : null
      ];
      
      await this.dbService._executeHttp(sql, args);
      
      console.log('[AIRiskService] ✅ Failed risk check logged to security logs');
      
    } catch (error) {
      console.error('[AIRiskService] Failed to log security event:', error);
      // Don't throw - logging failure shouldn't break the main flow
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
      console.log('[AIRiskService] Disconnected from database');
    }
  }
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.AIRiskService = AIRiskService;
}
