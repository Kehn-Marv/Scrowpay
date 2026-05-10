/**
 * Turso Database Configuration
 * 
 * This file exports database configuration from the central CONFIG object.
 * The actual credentials are loaded from environment variables via config.js
 */

const TURSO_CONFIG = {
  // Database URL (libsql:// format)
  get DATABASE_URL() {
    return window.CONFIG?.turso?.databaseUrl || '';
  },
  
  // Database authentication token
  get AUTH_TOKEN() {
    return window.CONFIG?.turso?.authToken || '';
  }
};

// Export for use in browser
if (typeof window !== 'undefined') {
  window.TURSO_CONFIG = TURSO_CONFIG;
}
