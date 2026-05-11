/**
 * Security Logger Utility
 * Handles logging of security events with proper data redaction
 * 
 * Requirements:
 * - 19.7: Log security-relevant events (failed risk checks, blocked transactions, rate limit violations)
 * - Redact sensitive data (mask phone numbers, hide amounts)
 */

class SecurityLogger {
  constructor(dbService) {
    this.dbService = dbService;
  }

  /**
   * Masks a phone number for logging
   * Example: +2348012345678 -> +234****5678
   * @param {string} phoneNumber - Phone number to mask
   * @returns {string} Masked phone number
   */
  maskPhoneNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return null;
    }
    
    // Keep first 4 and last 4 characters, mask the middle
    if (phoneNumber.length <= 8) {
      return '****' + phoneNumber.slice(-4);
    }
    
    const start = phoneNumber.slice(0, 4);
    const end = phoneNumber.slice(-4);
    const middle = '*'.repeat(phoneNumber.length - 8);
    
    return start + middle + end;
  }

  /**
   * Masks an amount for logging
   * Example: 50000 -> ₦***
   * @param {number} amount - Amount to mask
   * @returns {string} Masked amount
   */
  maskAmount(amount) {
    if (amount === null || amount === undefined) {
      return null;
    }
    
    return '₦***';
  }

  /**
   * Redacts sensitive data from an object
   * @param {Object} data - Data object to redact
   * @returns {Object} Redacted data object
   */
  redactSensitiveData(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const redacted = { ...data };

    // Mask phone numbers
    if (redacted.phone_number) {
      redacted.phone_number = this.maskPhoneNumber(redacted.phone_number);
    }
    if (redacted.phoneNumber) {
      redacted.phoneNumber = this.maskPhoneNumber(redacted.phoneNumber);
    }

    // Mask amounts
    if (redacted.amount !== undefined) {
      redacted.amount = this.maskAmount(redacted.amount);
    }
    if (redacted.price !== undefined) {
      redacted.price = this.maskAmount(redacted.price);
    }
    if (redacted.transaction_amount !== undefined) {
      redacted.transaction_amount = this.maskAmount(redacted.transaction_amount);
    }

    // Mask BVN if present
    if (redacted.bvn) {
      redacted.bvn = '****';
    }

    // Mask PIN if present
    if (redacted.pin) {
      redacted.pin = '****';
    }

    // Mask account numbers (keep last 4 digits)
    if (redacted.account_number) {
      redacted.account_number = '****' + redacted.account_number.slice(-4);
    }
    if (redacted.virtual_account_number) {
      redacted.virtual_account_number = '****' + redacted.virtual_account_number.slice(-4);
    }

    return redacted;
  }

  /**
   * Logs a security event to the database
   * @param {Object} event - Security event data
   * @param {string} event.eventType - Type of security event
   * @param {number} event.userId - User ID
   * @param {string} [event.transactionId] - Transaction ID (optional)
   * @param {Object} [event.details] - Additional details (optional)
   * @param {string} [event.ipAddress] - IP address (optional)
   * @param {string} [event.userAgent] - User agent (optional)
   * @returns {Promise<void>}
   */
  async logSecurityEvent(event) {
    try {
      // Redact sensitive data from details
      const redactedDetails = event.details 
        ? this.redactSensitiveData(event.details)
        : null;

      const sql = `
        INSERT INTO security_logs (event_type, user_id, transaction_id, details, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      const args = [
        event.eventType,
        event.userId,
        event.transactionId || null,
        redactedDetails ? JSON.stringify(redactedDetails) : null,
        event.ipAddress || null,
        event.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : null)
      ];
      
      await this.dbService._executeHttp(sql, args);
      
      console.log('[SecurityLogger] Security event logged:', event.eventType);
      
    } catch (error) {
      console.error('[SecurityLogger] Failed to log security event:', error);
      // Don't throw - logging failure shouldn't break the main flow
    }
  }

  /**
   * Logs a failed risk check event
   * @param {number} userId - User ID
   * @param {string} transactionId - Transaction ID
   * @param {number} riskScore - Risk score
   * @param {Array} anomalyIndicators - Anomaly indicators
   * @returns {Promise<void>}
   */
  async logFailedRiskCheck(userId, transactionId, riskScore, anomalyIndicators) {
    await this.logSecurityEvent({
      eventType: 'failed_risk_check',
      userId,
      transactionId,
      details: {
        risk_score: riskScore,
        anomaly_indicators: anomalyIndicators,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Logs a blocked transaction event
   * @param {number} userId - User ID
   * @param {string} transactionId - Transaction ID
   * @param {string} reason - Reason for blocking
   * @param {Object} additionalDetails - Additional details
   * @returns {Promise<void>}
   */
  async logBlockedTransaction(userId, transactionId, reason, additionalDetails = {}) {
    await this.logSecurityEvent({
      eventType: 'blocked_transaction',
      userId,
      transactionId,
      details: {
        reason,
        ...additionalDetails,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Logs a rate limit violation event
   * @param {number} userId - User ID
   * @param {number} count - Current transaction count
   * @param {number} limit - Rate limit
   * @param {Date} resetTime - When the limit resets
   * @returns {Promise<void>}
   */
  async logRateLimitViolation(userId, count, limit, resetTime) {
    await this.logSecurityEvent({
      eventType: 'rate_limit_violation',
      userId,
      details: {
        count,
        limit,
        resetTime: resetTime.toISOString()
      }
    });
  }

  /**
   * Logs an invalid state transition attempt
   * @param {number} userId - User ID
   * @param {string} transactionId - Transaction ID
   * @param {string} fromState - Current state
   * @param {string} toState - Attempted state
   * @returns {Promise<void>}
   */
  async logInvalidStateTransition(userId, transactionId, fromState, toState) {
    await this.logSecurityEvent({
      eventType: 'invalid_state_transition',
      userId,
      transactionId,
      details: {
        from_state: fromState,
        to_state: toState,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Logs an unauthorized access attempt
   * @param {number} userId - User ID
   * @param {string} resource - Resource being accessed
   * @param {string} action - Action attempted
   * @returns {Promise<void>}
   */
  async logUnauthorizedAccess(userId, resource, action) {
    await this.logSecurityEvent({
      eventType: 'unauthorized_access',
      userId,
      details: {
        resource,
        action,
        timestamp: new Date().toISOString()
      }
    });
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SecurityLogger;
}
