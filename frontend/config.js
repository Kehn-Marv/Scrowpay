/**
 * Configuration Management for ScrowPay
 * 
 * This file manages environment variables for both local development and production.
 * 
 * Local Development:
 * - Reads from window.ENV object (loaded from env.js)
 * 
 * Production (Vercel/Netlify):
 * - Reads from build-time environment variables
 * - Set in deployment platform dashboard
 */

// Configuration object
const CONFIG = {
  // Turso Database Configuration
  turso: {
    databaseUrl: window.ENV?.TURSO_DATABASE_URL || 'libsql://scrowpay-db-scrop.aws-ap-northeast-1.turso.io',
    authToken: window.ENV?.TURSO_AUTH_TOKEN || ''
  },
  
  // Squad API Configuration
  squad: {
    secretKey: window.ENV?.SQUAD_SECRET_KEY || '',
    publicKey: window.ENV?.SQUAD_PUBLIC_KEY || '',
    environment: window.ENV?.SQUAD_ENVIRONMENT || 'sandbox'
  },
  
  // Helper methods
  isProduction() {
    return this.squad.environment === 'production';
  },
  
  isSandbox() {
    return this.squad.environment === 'sandbox';
  },
  
  // Validate configuration
  validate() {
    const errors = [];
    
    if (!this.turso.databaseUrl) {
      errors.push('TURSO_DATABASE_URL is not set');
    }
    
    if (!this.turso.authToken) {
      errors.push('TURSO_AUTH_TOKEN is not set');
    }
    
    if (!this.squad.secretKey) {
      errors.push('SQUAD_SECRET_KEY is not set');
    }
    
    if (errors.length > 0) {
      console.error('Configuration errors:', errors);
      return false;
    }
    
    return true;
  }
};

// Validate on load (only log warnings, don't block)
if (!CONFIG.validate()) {
  console.warn('⚠️ Some environment variables are missing. Check your .env file or env.js');
}

// Export for use in other files
window.CONFIG = CONFIG;
