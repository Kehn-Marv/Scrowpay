/**
 * DisputeService - Dispute resolution management for ScrowPay Escrow Dashboard
 * 
 * This service provides dispute resolution operations including:
 * - Dispute creation with photo upload and description
 * - AI-powered dispute analysis with confidence scoring
 * - Automatic resolution for high-confidence cases (>90%)
 * - Manual review flagging for low-confidence cases (≤90%)
 * - Notification system for both parties
 * - Fund transfer execution based on resolution
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */

class DisputeService {
  /**
   * Creates a new DisputeService instance
   * @param {Object} config - Configuration object
   * @param {Object} config.turso - Turso DB configuration
   * @param {string} config.turso.databaseUrl - Turso database URL
   * @param {string} config.turso.authToken - Turso authentication token
   * @param {Object} config.aiEngine - AI Engine configuration
   * @param {string} config.aiEngine.url - AI Engine URL
   * @param {Object} config.squad - Squad API configuration
   * @param {string} config.squad.secretKey - Squad API secret key
   * @param {string} config.holdingAccount - Central holding account number
   */
  constructor(config) {
    this.dbService = new TursoDBService(config.turso.databaseUrl, config.turso.authToken);
    this.aiEngineUrl = config.aiEngine ? config.aiEngine.url : null;
    this.squadService = new SquadVirtualAccountService(config.squad.secretKey, config.squad.environment);
    this.holdingAccount = config.holdingAccount;
    this.connected = false;
    
    // AI confidence threshold for automatic resolution (Requirement 10.4)
    this.AUTO_RESOLUTION_THRESHOLD = 90;
    
    // Timeout for AI analysis (5 seconds)
    this.AI_TIMEOUT = 5000;
  }
  
  /**
   * Connects to the database
   * @returns {Promise<void>}
   */
  async connect() {
    if (!this.connected) {
      await this.dbService.connect();
      this.connected = true;
      console.log('[DisputeService] Connected to database');
    }
  }
  
  /**
   * Creates a dispute for a transaction
   * @param {string} transactionId - Transaction ID
   * @param {number} raisedBy - User ID raising the dispute (buyer)
   * @param {string} description - Dispute description
   * @param {Array<string>} photoUrls - Array of photo URLs (optional)
   * @returns {Promise<Object>} { success: boolean, dispute: Object, message?: string }
   */
  async createDispute(transactionId, raisedBy, description, photoUrls = []) {
    try {
      console.log('[DisputeService] Creating dispute:', {
        transactionId,
        raisedBy,
        descriptionLength: description.length,
        photoCount: photoUrls.length
      });
      
      // Ensure connection
      await this.connect();
      
      // Validate inputs
      if (!transactionId || !raisedBy || !description) {
        throw new Error('Transaction ID, raised by, and description are required');
      }
      
      if (description.length < 10) {
        throw new Error('Description must be at least 10 characters');
      }
      
      // Check if dispute already exists for this transaction
      const existingDispute = await this.getDisputeByTransactionId(transactionId);
      if (existingDispute) {
        throw new Error('A dispute already exists for this transaction');
      }
      
      // Convert photo URLs array to JSON string
      const photoUrlsJson = photoUrls.length > 0 ? JSON.stringify(photoUrls) : null;
      
      // Insert dispute into database (Requirement 10.2)
      const sql = `
        INSERT INTO disputes 
        (transaction_id, raised_by, description, photo_urls, created_at) 
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      
      await this.dbService._executeHttp(sql, [
        transactionId,
        raisedBy,
        description,
        photoUrlsJson
      ]);
      
      console.log('[DisputeService] ✅ Dispute created in database');
      
      // Retrieve the created dispute
      const dispute = await this.getDisputeByTransactionId(transactionId);
      
      return {
        success: true,
        dispute
      };
      
    } catch (error) {
      console.error('[DisputeService] Create dispute failed:', error);
      
      return {
        success: false,
        message: 'Failed to create dispute: ' + error.message
      };
    }
  }
  
  /**
   * Analyzes a dispute using AI engine
   * @param {Object} dispute - Dispute object
   * @param {Object} transaction - Transaction object
   * @returns {Promise<Object>} { success: boolean, analysis: Object, message?: string }
   */
  async analyzeDispute(dispute, transaction) {
    try {
      console.log('[DisputeService] Analyzing dispute with AI:', {
        disputeId: dispute.id,
        transactionId: dispute.transaction_id
      });
      
      // For hackathon: Mock AI dispute analysis
      // In production, this would call a real AI endpoint
      
      // Simulate AI analysis based on dispute characteristics
      const analysis = await this.mockDisputeAnalysis(dispute, transaction);
      
      console.log('[DisputeService] ✅ AI analysis completed:', {
        confidence: analysis.confidence,
        resolution: analysis.resolution
      });
      
      return {
        success: true,
        analysis
      };
      
    } catch (error) {
      console.error('[DisputeService] AI analysis failed:', error);
      
      return {
        success: false,
        message: 'Failed to analyze dispute: ' + error.message
      };
    }
  }
  
  /**
   * Mock AI dispute analysis (for hackathon)
   * In production, this would call the actual AI engine endpoint
   * @private
   * @param {Object} dispute - Dispute object
   * @param {Object} transaction - Transaction object
   * @returns {Promise<Object>} Analysis result
   */
  async mockDisputeAnalysis(dispute, transaction) {
    // Simulate AI processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock analysis logic based on dispute characteristics
    let confidence = 50; // Default medium confidence
    let resolution = 'refund_buyer'; // Default resolution
    let reasoning = [];
    
    // Analyze description length and detail
    if (dispute.description.length > 100) {
      confidence += 15;
      reasoning.push('Detailed description provided');
    }
    
    // Analyze photo evidence
    const photoUrls = dispute.photo_urls ? JSON.parse(dispute.photo_urls) : [];
    if (photoUrls.length > 0) {
      confidence += 20;
      reasoning.push(`${photoUrls.length} photo(s) provided as evidence`);
    }
    
    // Analyze transaction amount (higher amounts = more caution)
    if (transaction.price > 100000) {
      confidence -= 10;
      reasoning.push('High-value transaction requires careful review');
    }
    
    // Analyze keywords in description
    const description = dispute.description.toLowerCase();
    
    if (description.includes('damaged') || description.includes('broken')) {
      confidence += 10;
      resolution = 'refund_buyer';
      reasoning.push('Item damage reported');
    }
    
    if (description.includes('not received') || description.includes('never arrived')) {
      confidence += 15;
      resolution = 'refund_buyer';
      reasoning.push('Non-delivery reported');
    }
    
    if (description.includes('wrong item') || description.includes('different')) {
      confidence += 10;
      resolution = 'refund_buyer';
      reasoning.push('Wrong item reported');
    }
    
    if (description.includes('fake') || description.includes('counterfeit')) {
      confidence -= 20; // Requires manual verification
      resolution = 'manual_review';
      reasoning.push('Authenticity dispute requires expert review');
    }
    
    // Clamp confidence to 1-100 range
    confidence = Math.max(1, Math.min(100, confidence));
    
    // Determine resolution type based on confidence
    let resolutionType = 'manual_review';
    if (confidence > this.AUTO_RESOLUTION_THRESHOLD) {
      resolutionType = 'automated';
    } else if (confidence > 70) {
      resolutionType = 'ai_assisted';
    }
    
    return {
      confidence,
      resolution,
      resolutionType,
      reasoning,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Applies dispute resolution
   * @param {string} transactionId - Transaction ID
   * @param {Object} analysis - AI analysis result
   * @returns {Promise<Object>} { success: boolean, message?: string }
   */
  async applyResolution(transactionId, analysis) {
    try {
      console.log('[DisputeService] Applying resolution:', {
        transactionId,
        resolution: analysis.resolution,
        confidence: analysis.confidence,
        resolutionType: analysis.resolutionType
      });
      
      // Ensure connection
      await this.connect();
      
      // Get transaction details
      const transaction = await this.getTransaction(transactionId);
      if (!transaction) {
        throw new Error('Transaction not found');
      }
      
      // Update dispute record with AI analysis (Requirement 10.3)
      const updateSql = `
        UPDATE disputes 
        SET ai_resolution = ?,
            ai_confidence = ?,
            resolution_type = ?,
            resolved_at = CURRENT_TIMESTAMP
        WHERE transaction_id = ?
      `;
      
      await this.dbService._executeHttp(updateSql, [
        analysis.resolution,
        analysis.confidence,
        analysis.resolutionType,
        transactionId
      ]);
      
      console.log('[DisputeService] ✅ Dispute record updated with AI analysis');
      
      // If confidence > 90%, apply resolution automatically (Requirement 10.4)
      if (analysis.confidence > this.AUTO_RESOLUTION_THRESHOLD) {
        console.log('[DisputeService] High confidence - applying automatic resolution');
        
        // Execute fund transfer based on resolution
        await this.executeFundTransfer(transaction, analysis.resolution);
        
        // Update transaction state to Completed
        await this.updateTransactionState(transactionId, 'Completed');
        
        console.log('[DisputeService] ✅ Automatic resolution applied');
        
        return {
          success: true,
          resolutionType: 'automated',
          message: 'Dispute resolved automatically based on AI analysis'
        };
      } else {
        // If confidence ≤ 90%, flag for manual review (Requirement 10.5)
        console.log('[DisputeService] Low confidence - flagging for manual review');
        
        return {
          success: true,
          resolutionType: 'manual_review',
          message: 'Dispute flagged for manual review due to low AI confidence'
        };
      }
      
    } catch (error) {
      console.error('[DisputeService] Apply resolution failed:', error);
      
      return {
        success: false,
        message: 'Failed to apply resolution: ' + error.message
      };
    }
  }
  
  /**
   * Executes fund transfer based on dispute resolution
   * @private
   * @param {Object} transaction - Transaction object
   * @param {string} resolution - Resolution decision ('refund_buyer', 'release_to_seller', 'split')
   * @returns {Promise<void>}
   */
  async executeFundTransfer(transaction, resolution) {
    console.log('[DisputeService] Executing fund transfer:', {
      transactionId: transaction.transaction_id,
      resolution,
      amount: transaction.price
    });
    
    try {
      // Get buyer and seller account numbers
      const buyerResult = await this.dbService._executeHttp(
        'SELECT virtual_account_number FROM users WHERE id = ?',
        [transaction.buyer_id]
      );
      
      const sellerResult = await this.dbService._executeHttp(
        'SELECT virtual_account_number FROM users WHERE id = ?',
        [transaction.seller_id]
      );
      
      const buyerAccount = this.extractValue(buyerResult.results[0].response.result.rows[0][0]);
      const sellerAccount = this.extractValue(sellerResult.results[0].response.result.rows[0][0]);
      
      // Execute transfer based on resolution (Requirement 10.6, 10.7)
      switch (resolution) {
        case 'refund_buyer':
          console.log('[DisputeService] Refunding buyer');
          // Transfer from holding account to buyer
          await this.transferFunds(this.holdingAccount, buyerAccount, transaction.price, {
            transaction_id: transaction.transaction_id,
            type: 'dispute_refund'
          });
          break;
          
        case 'release_to_seller':
          console.log('[DisputeService] Releasing funds to seller');
          // Transfer from holding account to seller
          await this.transferFunds(this.holdingAccount, sellerAccount, transaction.price, {
            transaction_id: transaction.transaction_id,
            type: 'dispute_release'
          });
          break;
          
        case 'split':
          console.log('[DisputeService] Splitting funds 50/50');
          // Split funds between buyer and seller
          const halfAmount = transaction.price / 2;
          await this.transferFunds(this.holdingAccount, buyerAccount, halfAmount, {
            transaction_id: transaction.transaction_id,
            type: 'dispute_split_buyer'
          });
          await this.transferFunds(this.holdingAccount, sellerAccount, halfAmount, {
            transaction_id: transaction.transaction_id,
            type: 'dispute_split_seller'
          });
          break;
          
        default:
          throw new Error('Unknown resolution type: ' + resolution);
      }
      
      console.log('[DisputeService] ✅ Fund transfer executed successfully');
      
    } catch (error) {
      console.error('[DisputeService] Fund transfer failed:', error);
      throw new Error('Failed to execute fund transfer: ' + error.message);
    }
  }
  
  /**
   * Transfers funds (simulated for hackathon)
   * @private
   * @param {string} fromAccount - Source account
   * @param {string} toAccount - Destination account
   * @param {number} amount - Amount to transfer
   * @param {Object} metadata - Transfer metadata
   * @returns {Promise<void>}
   */
  async transferFunds(fromAccount, toAccount, amount, metadata) {
    console.log('[DisputeService] Transferring funds:', {
      from: fromAccount,
      to: toAccount,
      amount,
      metadata
    });
    
    // For hackathon: Simulate Squad API transfer
    // In production, this would call the actual Squad API
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('[DisputeService] ✅ Funds transferred (simulated)');
  }
  
  /**
   * Notifies both parties of dispute status
   * @param {string} transactionId - Transaction ID
   * @param {string} status - Dispute status
   * @param {string} message - Notification message
   * @returns {Promise<Object>} { success: boolean, message?: string }
   */
  async notifyParties(transactionId, status, message) {
    try {
      console.log('[DisputeService] Notifying parties:', {
        transactionId,
        status,
        message
      });
      
      // For hackathon: Log notification
      // In production, this would send actual notifications (email, SMS, push)
      
      console.log('[DisputeService] ✅ Parties notified (simulated)');
      
      return {
        success: true
      };
      
    } catch (error) {
      console.error('[DisputeService] Notify parties failed:', error);
      
      return {
        success: false,
        message: 'Failed to notify parties: ' + error.message
      };
    }
  }
  
  /**
   * Gets dispute by transaction ID
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object|null>} Dispute object or null if not found
   */
  async getDisputeByTransactionId(transactionId) {
    try {
      console.log('[DisputeService] Getting dispute for transaction:', transactionId);
      
      await this.connect();
      
      const result = await this.dbService._executeHttp(
        'SELECT * FROM disputes WHERE transaction_id = ? LIMIT 1',
        [transactionId]
      );
      
      const executeResult = result.results[0].response.result;
      const rows = executeResult.rows;
      const cols = executeResult.cols;
      
      if (rows.length === 0) {
        return null;
      }
      
      // Convert row to object
      const dispute = {};
      cols.forEach((col, index) => {
        const cellValue = rows[0][index];
        dispute[col.name] = this.extractValue(cellValue);
      });
      
      console.log('[DisputeService] ✅ Dispute retrieved');
      return dispute;
      
    } catch (error) {
      console.error('[DisputeService] Get dispute failed:', error);
      return null;
    }
  }
  
  /**
   * Gets transaction by ID
   * @private
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object|null>} Transaction object or null if not found
   */
  async getTransaction(transactionId) {
    try {
      const result = await this.dbService._executeHttp(
        'SELECT * FROM transactions WHERE transaction_id = ? LIMIT 1',
        [transactionId]
      );
      
      const executeResult = result.results[0].response.result;
      const rows = executeResult.rows;
      const cols = executeResult.cols;
      
      if (rows.length === 0) {
        return null;
      }
      
      // Convert row to object
      const transaction = {};
      cols.forEach((col, index) => {
        const cellValue = rows[0][index];
        transaction[col.name] = this.extractValue(cellValue);
      });
      
      return transaction;
      
    } catch (error) {
      console.error('[DisputeService] Get transaction failed:', error);
      return null;
    }
  }
  
  /**
   * Updates transaction state
   * @private
   * @param {string} transactionId - Transaction ID
   * @param {string} newState - New state
   * @returns {Promise<void>}
   */
  async updateTransactionState(transactionId, newState) {
    console.log('[DisputeService] Updating transaction state:', {
      transactionId,
      newState
    });
    
    await this.dbService._executeHttp(
      'UPDATE transactions SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE transaction_id = ?',
      [newState, transactionId]
    );
    
    console.log('[DisputeService] ✅ Transaction state updated');
  }
  
  /**
   * Extracts value from Turso DB cell value object
   * @private
   * @param {*} cellValue - Cell value from Turso DB
   * @returns {*} Extracted value
   */
  extractValue(cellValue) {
    return typeof cellValue === 'object' && cellValue.value !== undefined 
      ? cellValue.value 
      : cellValue;
  }
  
  /**
   * Uploads photos to storage (simplified for hackathon)
   * @param {FileList} files - Files to upload
   * @returns {Promise<Array<string>>} Array of photo URLs
   */
  async uploadPhotos(files) {
    try {
      console.log('[DisputeService] Uploading photos:', files.length);
      
      // For hackathon: Convert to base64 data URLs
      // In production, this would upload to cloud storage (S3, Cloudinary, etc.)
      
      const photoUrls = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Validate file type
        if (!file.type.startsWith('image/')) {
          throw new Error(`File ${file.name} is not an image`);
        }
        
        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          throw new Error(`File ${file.name} exceeds 5MB limit`);
        }
        
        // Convert to base64 data URL
        const dataUrl = await this.fileToDataUrl(file);
        photoUrls.push(dataUrl);
      }
      
      console.log('[DisputeService] ✅ Photos uploaded:', photoUrls.length);
      
      return photoUrls;
      
    } catch (error) {
      console.error('[DisputeService] Photo upload failed:', error);
      throw error;
    }
  }
  
  /**
   * Converts file to data URL
   * @private
   * @param {File} file - File to convert
   * @returns {Promise<string>} Data URL
   */
  fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        resolve(e.target.result);
      };
      
      reader.onerror = (e) => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsDataURL(file);
    });
  }
  
  /**
   * Disconnects from the database
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.connected) {
      await this.dbService.disconnect();
      this.connected = false;
      console.log('[DisputeService] Disconnected from database');
    }
  }
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.DisputeService = DisputeService;
}
