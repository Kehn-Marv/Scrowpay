/**
 * SessionService - Session management for ScrowPay Escrow Dashboard
 * 
 * This service handles:
 * - Session token validation on dashboard load
 * - 24-hour session expiry with inactivity timeout
 * - Secure session storage (NOT sensitive data like PINs, BVN)
 * - Logout functionality
 * - User data retrieval from Turso DB
 * 
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 19.2, 20.1, 20.2, 20.3
 */

class SessionService {
  /**
   * Creates a new SessionService instance
   * @param {Object} config - Configuration object
   * @param {Object} config.turso - Turso DB configuration
   * @param {string} config.turso.databaseUrl - Turso database URL
   * @param {string} config.turso.authToken - Turso authentication token
   */
  constructor(config) {
    this.dbService = new TursoDBService(config.turso.databaseUrl, config.turso.authToken);
    
    // Session configuration
    this.SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    this.INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
    
    // Session keys in localStorage
    this.SESSION_KEY = 'scrowpay_session';
    this.LAST_ACTIVITY_KEY = 'scrowpay_last_activity';
    
    // Inactivity timer
    this.inactivityTimer = null;
    
    console.log('[SessionService] Service initialized');
  }
  
  /**
   * Creates a new session for a user
   * @param {Object} user - User object from database
   * @returns {Object} { success: boolean, session: Object, message?: string }
   */
  createSession(user) {
    try {
      console.log('[SessionService] Creating session for user:', user.id);
      
      // Validate user object
      if (!user || !user.id || !user.phone_number) {
        throw new Error('Invalid user object');
      }
      
      // Create session object (Requirement 19.2 - NOT storing sensitive data)
      const session = {
        userId: user.id,
        phoneNumber: user.phone_number,
        firstName: user.first_name,
        lastName: user.last_name,
        virtualAccountNumber: user.virtual_account_number,
        createdAt: Date.now(),
        expiresAt: Date.now() + this.SESSION_DURATION
      };
      
      // Store session in localStorage (Requirement 13.1)
      localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
      localStorage.setItem(this.LAST_ACTIVITY_KEY, Date.now().toString());
      
      // Start inactivity monitoring (Requirement 13.4)
      this.startInactivityMonitoring();
      
      console.log('[SessionService] ✅ Session created successfully');
      
      return {
        success: true,
        session
      };
      
    } catch (error) {
      console.error('[SessionService] Create session failed:', error);
      
      return {
        success: false,
        message: 'Failed to create session: ' + error.message
      };
    }
  }
  
  /**
   * Validates the current session
   * @returns {Object} { valid: boolean, session?: Object, reason?: string }
   */
  validateSession() {
    try {
      console.log('[SessionService] Validating session...');
      
      // Get session from localStorage (Requirement 13.2)
      const sessionData = localStorage.getItem(this.SESSION_KEY);
      const lastActivity = localStorage.getItem(this.LAST_ACTIVITY_KEY);
      
      if (!sessionData) {
        console.log('[SessionService] ❌ No session found');
        return {
          valid: false,
          reason: 'no_session'
        };
      }
      
      // Parse session
      const session = JSON.parse(sessionData);
      const now = Date.now();
      
      // Check if session has expired (24 hours) (Requirement 13.4)
      if (now > session.expiresAt) {
        console.log('[SessionService] ❌ Session expired (24 hours)');
        this.clearSession();
        return {
          valid: false,
          reason: 'session_expired'
        };
      }
      
      // Check inactivity timeout (30 minutes) (Requirement 13.4)
      if (lastActivity) {
        const lastActivityTime = parseInt(lastActivity);
        const inactiveTime = now - lastActivityTime;
        
        if (inactiveTime > this.INACTIVITY_TIMEOUT) {
          console.log('[SessionService] ❌ Session expired (inactivity timeout)');
          this.clearSession();
          return {
            valid: false,
            reason: 'inactivity_timeout'
          };
        }
      }
      
      // Update last activity timestamp
      this.updateActivity();
      
      console.log('[SessionService] ✅ Session valid');
      
      return {
        valid: true,
        session
      };
      
    } catch (error) {
      console.error('[SessionService] Session validation failed:', error);
      
      // Clear corrupted session
      this.clearSession();
      
      return {
        valid: false,
        reason: 'validation_error'
      };
    }
  }
  
  /**
   * Updates the last activity timestamp
   * @returns {void}
   */
  updateActivity() {
    localStorage.setItem(this.LAST_ACTIVITY_KEY, Date.now().toString());
  }
  
  /**
   * Starts monitoring user activity for inactivity timeout
   * @returns {void}
   */
  startInactivityMonitoring() {
    console.log('[SessionService] Starting inactivity monitoring...');
    
    // Clear existing timer
    if (this.inactivityTimer) {
      clearInterval(this.inactivityTimer);
    }
    
    // Check inactivity every minute
    this.inactivityTimer = setInterval(() => {
      const validation = this.validateSession();
      
      if (!validation.valid) {
        console.log('[SessionService] Session invalid, redirecting to sign-in...');
        this.redirectToSignIn(validation.reason);
      }
    }, 60 * 1000); // Check every minute
    
    // Track user activity events
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    
    activityEvents.forEach(event => {
      document.addEventListener(event, () => {
        this.updateActivity();
      }, { passive: true });
    });
    
    console.log('[SessionService] ✅ Inactivity monitoring started');
  }
  
  /**
   * Stops inactivity monitoring
   * @returns {void}
   */
  stopInactivityMonitoring() {
    if (this.inactivityTimer) {
      clearInterval(this.inactivityTimer);
      this.inactivityTimer = null;
      console.log('[SessionService] Inactivity monitoring stopped');
    }
  }
  
  /**
   * Gets the current session
   * @returns {Object|null} Session object or null if no valid session
   */
  getSession() {
    const validation = this.validateSession();
    
    if (validation.valid) {
      return validation.session;
    }
    
    return null;
  }
  
  /**
   * Retrieves user data from Turso DB using phone number from session
   * @returns {Promise<Object>} { success: boolean, user?: Object, message?: string }
   */
  async getUserData() {
    try {
      console.log('[SessionService] Retrieving user data from database...');
      
      // Validate session first
      const validation = this.validateSession();
      
      if (!validation.valid) {
        throw new Error('Invalid session');
      }
      
      const session = validation.session;
      
      // Connect to database
      await this.dbService.connect();
      
      // Query user data by phone number (Requirement 13.5, 20.3)
      const user = await this.dbService.getUserByPhone(session.phoneNumber);
      
      if (!user) {
        throw new Error('User not found in database');
      }
      
      console.log('[SessionService] ✅ User data retrieved successfully');
      
      return {
        success: true,
        user
      };
      
    } catch (error) {
      console.error('[SessionService] Get user data failed:', error);
      
      return {
        success: false,
        message: 'Failed to retrieve user data: ' + error.message
      };
    }
  }
  
  /**
   * Clears the current session (Requirement 13.5)
   * @returns {void}
   */
  clearSession() {
    console.log('[SessionService] Clearing session...');
    
    // Remove session data from localStorage
    localStorage.removeItem(this.SESSION_KEY);
    localStorage.removeItem(this.LAST_ACTIVITY_KEY);
    
    // Stop inactivity monitoring
    this.stopInactivityMonitoring();
    
    console.log('[SessionService] ✅ Session cleared');
  }
  
  /**
   * Logs out the user and redirects to sign-in page (Requirement 13.5)
   * @returns {void}
   */
  logout() {
    console.log('[SessionService] Logging out user...');
    
    // Clear session
    this.clearSession();
    
    // Redirect to sign-in page
    this.redirectToSignIn('logout');
  }
  
  /**
   * Redirects to sign-in page with reason (Requirement 13.2)
   * @param {string} reason - Reason for redirect
   * @returns {void}
   */
  redirectToSignIn(reason = 'unknown') {
    console.log('[SessionService] Redirecting to sign-in page, reason:', reason);
    
    // Store redirect reason for display on sign-in page
    sessionStorage.setItem('redirect_reason', reason);
    
    // Redirect to sign-in page
    window.location.href = 'sign-in.html';
  }
  
  /**
   * Checks if user is authenticated
   * @returns {boolean} True if authenticated, false otherwise
   */
  isAuthenticated() {
    const validation = this.validateSession();
    return validation.valid;
  }
  
  /**
   * Gets session expiry information
   * @returns {Object|null} { expiresAt: number, timeRemaining: number } or null
   */
  getSessionExpiry() {
    const session = this.getSession();
    
    if (!session) {
      return null;
    }
    
    const now = Date.now();
    const timeRemaining = session.expiresAt - now;
    
    return {
      expiresAt: session.expiresAt,
      timeRemaining: Math.max(0, timeRemaining)
    };
  }
  
  /**
   * Gets inactivity timeout information
   * @returns {Object|null} { lastActivity: number, timeUntilTimeout: number } or null
   */
  getInactivityInfo() {
    const lastActivity = localStorage.getItem(this.LAST_ACTIVITY_KEY);
    
    if (!lastActivity) {
      return null;
    }
    
    const lastActivityTime = parseInt(lastActivity);
    const now = Date.now();
    const inactiveTime = now - lastActivityTime;
    const timeUntilTimeout = Math.max(0, this.INACTIVITY_TIMEOUT - inactiveTime);
    
    return {
      lastActivity: lastActivityTime,
      inactiveTime,
      timeUntilTimeout
    };
  }
  
  /**
   * Extends the current session (resets expiry)
   * @returns {Object} { success: boolean, message?: string }
   */
  extendSession() {
    try {
      const session = this.getSession();
      
      if (!session) {
        throw new Error('No active session');
      }
      
      // Update expiry time
      session.expiresAt = Date.now() + this.SESSION_DURATION;
      
      // Save updated session
      localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
      
      console.log('[SessionService] ✅ Session extended');
      
      return {
        success: true
      };
      
    } catch (error) {
      console.error('[SessionService] Extend session failed:', error);
      
      return {
        success: false,
        message: 'Failed to extend session: ' + error.message
      };
    }
  }
  
  /**
   * Cleans up resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    console.log('[SessionService] Cleaning up...');
    
    // Stop inactivity monitoring
    this.stopInactivityMonitoring();
    
    // Disconnect database service
    await this.dbService.disconnect();
    
    console.log('[SessionService] ✅ Cleanup completed');
  }
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.SessionService = SessionService;
}
