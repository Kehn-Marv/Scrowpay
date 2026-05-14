/**
 * DisputeService - Dispute resolution management for ScrowPay Escrow Dashboard
 *
 * Responsibilities:
 * - Dispute record persistence (`createDispute`, `getDisputeByTransactionId`)
 * - Photo upload (base64 inline; real object storage is a TODO)
 * - Mapping the DisputeAgent's verdict into a fund-transfer + state
 *   transition (`resolveWithAgentVerdict` -> `applyResolution`)
 * - Trust Engine attribution on auto-resolved cases
 *
 * IMPORTANT: The actual AI judgement now lives in `DisputeAgentService`
 * (multimodal Gemini call). The previous `mockDisputeAnalysis` /
 * `analyzeDispute` heuristic was removed because it was rule-based
 * theatre (description length + photo count + keyword match) and
 * couldn't read evidence. This service is now a thin adapter between
 * the agent's verdict shape and our existing fund-transfer pipeline.
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

    // Optional Trust Engine — wired via setTrustEngine() from the
    // dashboard bootstrap. When present, every auto-applied dispute
    // resolution attributes a win/loss to the appropriate party.
    this.trustEngine = null;
  }

  /** Wire in the TrustEngineService so dispute resolutions update scores. */
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
   * Maps a DisputeAgentService verdict into the legacy analysis shape
   * that `applyResolution` expects, then runs it. This is the single
   * entry point the dashboard should use after collecting an agent
   * verdict. It also persists the agent's reasoning + evidence list on
   * the dispute row so the UI / future admin tools can replay it.
   *
   * @param {string} transactionId
   * @param {Object} verdict - the canonical verdict from DisputeAgentService.analyze()
   *   { action, favoredParty, confidence (0-1), payout, reasoning, evidenceCited }
   * @returns {Promise<Object>} { success, resolutionType, message? }
   */
  async resolveWithAgentVerdict(transactionId, verdict) {
    try {
      if (!verdict || verdict.action !== 'rule') {
        // Caller should never pass an `ask` here, but guard anyway.
        return {
          success: false,
          message: 'Cannot resolve: agent did not produce a final ruling.'
        };
      }

      // Map the agent's structured verdict into the resolution enum the
      // existing fund-transfer code understands. A pure 100/0 split maps
      // to refund_buyer or release_to_seller; anything else is `split`.
      const buyerPct = Number(verdict?.payout?.buyerPct) || 0;
      const sellerPct = Number(verdict?.payout?.sellerPct) || 0;

      let resolution;
      if (buyerPct === 100 && sellerPct === 0) resolution = 'refund_buyer';
      else if (sellerPct === 100 && buyerPct === 0) resolution = 'release_to_seller';
      else resolution = 'split';

      // Convert 0-1 confidence to 0-100 to match the legacy shape and
      // the AUTO_RESOLUTION_THRESHOLD comparison in applyResolution.
      const confidence100 = Math.max(0, Math.min(100, Math.round((Number(verdict.confidence) || 0) * 100)));

      let resolutionType = 'manual_review';
      if (confidence100 > this.AUTO_RESOLUTION_THRESHOLD) resolutionType = 'automated';
      else if (confidence100 > 70) resolutionType = 'ai_assisted';

      const analysis = {
        confidence: confidence100,
        resolution,
        resolutionType,
        reasoning: verdict.reasoning || '',
        evidenceCited: Array.isArray(verdict.evidenceCited) ? verdict.evidenceCited : [],
        favoredParty: verdict.favoredParty || null,
        payout: { buyerPct, sellerPct },
        timestamp: new Date().toISOString()
      };

      // Persist the full agent transcript on the dispute row BEFORE we
      // execute the transfer, so even if the transfer step fails we
      // still have a record of what the agent decided.
      try {
        await this.connect();
        await this.dbService._executeHttp(
          `UPDATE disputes
              SET ai_resolution = ?,
                  ai_confidence = ?,
                  resolution_type = ?
            WHERE transaction_id = ?`,
          [
            JSON.stringify({
              resolution,
              favoredParty: analysis.favoredParty,
              payout: analysis.payout,
              reasoning: analysis.reasoning,
              evidenceCited: analysis.evidenceCited
            }),
            confidence100,
            resolutionType,
            transactionId
          ]
        );
      } catch (e) {
        console.warn('[DisputeService] Failed to persist agent transcript (non-fatal):', e.message);
      }

      // Delegate to the existing fund-transfer + state-transition path.
      return await this.applyResolution(transactionId, analysis);
    } catch (error) {
      console.error('[DisputeService] resolveWithAgentVerdict failed:', error);
      return {
        success: false,
        message: 'Failed to apply agent verdict: ' + error.message
      };
    }
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

        // Trust Engine: attribute win/loss based on the resolution.
        //   refund_buyer       -> buyer was right (win)  / seller wrong (loss)
        //   release_to_seller  -> seller was right (win) / buyer wrong (loss)
        //   split              -> ambiguous, no attribution (no row added)
        // Best-effort; never throws into the dispute flow.
        if (this.trustEngine) {
          try {
            const sellerId = transaction.seller_id != null ? Number(transaction.seller_id) : null;
            const buyerId = transaction.buyer_id != null ? Number(transaction.buyer_id) : null;
            let winnerId = null;
            let loserId = null;
            if (analysis.resolution === 'refund_buyer') {
              winnerId = buyerId;
              loserId = sellerId;
            } else if (analysis.resolution === 'release_to_seller') {
              winnerId = sellerId;
              loserId = buyerId;
            }
            if (winnerId || loserId) {
              await this.trustEngine.onDisputeResolved({
                winnerId,
                loserId,
                transactionId,
                resolution: analysis.resolution
              });
            }
          } catch (e) {
            console.warn('[DisputeService] trust hook (disputeResolved) failed:', e.message);
          }
        }
        
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
   * Admin-only manual resolution. Used by the admin dashboard
   * (admin.html) when a human reviewer overrides — or steps in for —
   * the AI agent. Unlike `applyResolution`, this method does NOT
   * gate on the confidence threshold: the admin's decision is final.
   *
   * Side effects:
   *   1. Executes the fund transfer via Squad (refund / release / split)
   *   2. Transitions the transaction to `Completed`
   *   3. Stamps `manual_resolution`, `resolution_type='manual'`,
   *      `resolved_at`, and the reviewer's notes (stored as JSON in
   *      `manual_resolution`) on the disputes row.
   *   4. Fires the same Trust Engine attribution path as automated
   *      resolution, so a manual ruling still updates buyer/seller
   *      win/loss counters.
   *
   * The caller must already have established that the acting user
   * is an admin. This method does NOT re-check `users.is_admin` —
   * authentication is enforced at the page level.
   *
   * @param {string} transactionId
   * @param {'refund_buyer'|'release_to_seller'|'split'} resolution
   * @param {object} [opts]
   * @param {number} [opts.adminUserId]   id of the resolving admin (audit)
   * @param {string} [opts.notes]         free-text reasoning shown in admin history
   * @returns {Promise<{success:boolean, resolutionType:string, message?:string}>}
   */
  async resolveManually(transactionId, resolution, opts = {}) {
    const allowedResolutions = ['refund_buyer', 'release_to_seller', 'split'];
    if (!allowedResolutions.includes(resolution)) {
      return { success: false, message: `Invalid resolution: ${resolution}` };
    }

    try {
      await this.connect();

      const transaction = await this.getTransaction(transactionId);
      if (!transaction) throw new Error('Transaction not found');

      // Pack the admin's notes + audit info into manual_resolution as
      // JSON so we don't need to add new columns. Older code that
      // reads this column as plain text still works (it'll just see
      // the JSON string verbatim).
      const manualPayload = JSON.stringify({
        resolution,
        resolved_by_admin: opts.adminUserId || null,
        notes: String(opts.notes || '').slice(0, 1000),
        resolved_at: new Date().toISOString()
      });

      // 1. Stamp the dispute row first so an interruption between
      //    fund transfer and DB write still leaves an audit trail.
      await this.dbService._executeHttp(
        `UPDATE disputes
            SET manual_resolution = ?,
                resolution_type   = 'manual',
                resolved_at       = CURRENT_TIMESTAMP
          WHERE transaction_id = ?`,
        [manualPayload, transactionId]
      );

      // 2. Execute the fund transfer (Squad / mock).
      await this.executeFundTransfer(transaction, resolution);

      // 3. Move the transaction to its terminal state.
      await this.updateTransactionState(transactionId, 'Completed');

      // 4. Trust engine attribution. Same rules as the automated
      //    path: 100/0 splits attribute a winner+loser, 50/50 split
      //    attributes neither. Best-effort; never throws.
      if (this.trustEngine) {
        try {
          const sellerId = transaction.seller_id != null ? Number(transaction.seller_id) : null;
          const buyerId  = transaction.buyer_id  != null ? Number(transaction.buyer_id)  : null;
          let winnerId = null, loserId = null;
          if (resolution === 'refund_buyer')      { winnerId = buyerId;  loserId = sellerId; }
          if (resolution === 'release_to_seller') { winnerId = sellerId; loserId = buyerId;  }
          if (winnerId || loserId) {
            await this.trustEngine.onDisputeResolved({
              winnerId, loserId, transactionId, resolution
            });
          }
        } catch (e) {
          console.warn('[DisputeService] manual-trust hook failed:', e.message);
        }
      }

      console.log('[DisputeService] ✅ Manual resolution applied:', { transactionId, resolution });
      return {
        success: true,
        resolutionType: 'manual',
        message: 'Dispute resolved manually by admin'
      };
    } catch (error) {
      console.error('[DisputeService] resolveManually failed:', error);
      return {
        success: false,
        message: 'Failed to apply manual resolution: ' + error.message
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
   * Uploads dispute evidence photos.
   *
   * STRATEGY (Phase B):
   *   1. If a Cloudinary service is available on `window.cloudinaryService`
   *      AND it reports `available === true`, upload each file via the
   *      unsigned-upload preset `scrowpay_disputes` and return secure_urls.
   *   2. Otherwise fall back to the legacy base64 data-URL path so the
   *      dispute flow keeps working even if Cloudinary is misconfigured
   *      or unreachable. The Gemini DisputeAgent accepts both URLs and
   *      base64 data URLs as input, so verdict quality is unaffected.
   *
   * CALLER METADATA (optional, last argument):
   *   { userId, disputeId, transactionId } — these become Cloudinary
   *   tags / context. The Gemini agent doesn't need them but they're
   *   invaluable for admin investigation of fraudulent disputes.
   *
   * @param {FileList|File[]} files
   * @param {{userId?:number, disputeId?:string|number, transactionId?:string}} [meta]
   * @returns {Promise<Array<string>>} Array of photo URLs (https://... or data:image/...)
   */
  async uploadPhotos(files, meta = {}) {
    try {
      const list = Array.isArray(files) ? files : Array.from(files || []);
      console.log('[DisputeService] Uploading photos:', list.length);

      // Pre-validate everything up front. We want a fast failure on a
      // bad file rather than burning bandwidth on partial uploads.
      for (const file of list) {
        if (!file || !file.type || !file.type.startsWith('image/')) {
          throw new Error(`File ${file && file.name} is not an image`);
        }
        if (file.size > 10 * 1024 * 1024) {
          throw new Error(`File ${file.name} exceeds 10MB limit`);
        }
      }

      // Prefer Cloudinary if it's wired up and ready.
      const cs = (typeof window !== 'undefined') ? window.cloudinaryService : null;
      const useCloudinary = cs && cs.available;
      if (useCloudinary) {
        console.log('[DisputeService] Using Cloudinary upload path');
      } else {
        console.warn('[DisputeService] Cloudinary unavailable — falling back to base64 data URLs');
      }

      const photoUrls = [];
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        if (useCloudinary) {
          try {
            const result = await cs.uploadDisputePhoto(file, {
              userId: meta.userId,
              disputeId: meta.disputeId,
              transactionId: meta.transactionId
            });
            photoUrls.push(result.secureUrl);
          } catch (cloudErr) {
            // Single-file Cloudinary failure → fall back to base64 for
            // THIS file only. Partial-Cloudinary, partial-base64 mixes
            // are fine for the dispute agent.
            console.warn(`[DisputeService] Cloudinary upload failed for ${file.name}, using base64 fallback:`, cloudErr.message);
            const dataUrl = await this.fileToDataUrl(file);
            photoUrls.push(dataUrl);
          }
        } else {
          const dataUrl = await this.fileToDataUrl(file);
          photoUrls.push(dataUrl);
        }
      }

      console.log('[DisputeService] ✅ Photos uploaded:', photoUrls.length,
                  useCloudinary ? '(Cloudinary)' : '(base64 fallback)');
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
