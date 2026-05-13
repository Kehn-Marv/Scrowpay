/**
 * TursoDBService - HTTP API-based Database service for ScrowPay Account Creation
 * 
 * This service provides database operations using Turso DB via HTTP API.
 * It handles user registration, duplicate checking, and data persistence.
 * 
 * Uses @libsql/client/web for browser compatibility with zero native dependencies.
 */

class TursoDBService {
  /**
   * Creates a new TursoDBService instance
   * @param {string} databaseUrl - Turso database URL (e.g., libsql://your-database.turso.io)
   * @param {string} authToken - Turso authentication token
   */
  constructor(databaseUrl, authToken) {
    this.databaseUrl = databaseUrl;
    this.authToken = authToken;
    this.client = null;
    this.connected = false;
    this.httpUrl = this._convertToHttpUrl(databaseUrl);
  }
  
  /**
   * Converts libsql:// URL to https:// URL for HTTP API
   * @private
   * @param {string} libsqlUrl - libSQL URL
   * @returns {string} HTTPS URL
   */
  _convertToHttpUrl(libsqlUrl) {
    return libsqlUrl.replace('libsql://', 'https://');
  }
  
  /**
   * Connects to the Turso database using HTTP API
   * @returns {Promise<void>}
   * @throws {Error} If connection fails
   */
  async connect() {
    try {
      console.log('[TursoDBService] Connecting to Turso database via HTTP API...');
      console.log('[TursoDBService] Database URL:', this.databaseUrl);
      console.log('[TursoDBService] HTTP URL:', this.httpUrl);
      
      // Test connection with a simple query (Requirement 17.2)
      const testResult = await this._executeHttp('SELECT 1 as test');
      
      if (testResult && testResult.results && testResult.results.length > 0) {
        this.connected = true;
        console.log('[TursoDBService] ✅ Connected to Turso database via HTTP API');
        console.log('[TursoDBService] Connection test result:', testResult);
      } else {
        throw new Error('Connection test failed: Invalid response');
      }
      
    } catch (error) {
      console.error('[TursoDBService] ❌ Connection failed:', error);
      this.connected = false;
      
      // Provide more specific error messages (Requirement 17.2)
      if (error.message.includes('network') || error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
        throw new Error('Unable to connect to database. Please check your internet connection and try again.');
      }
      
      if (error.message.includes('auth') || error.message.includes('token') || error.message.includes('401')) {
        throw new Error('Database authentication failed. Please contact support.');
      }
      
      throw new Error('Failed to connect to database: ' + error.message);
    }
  }
  
  /**
   * Executes SQL via HTTP API with retry logic
   * @private
   * @param {string} sql - SQL query
   * @param {Array} args - Query parameters (optional)
   * @param {number} retries - Number of retries (default: 2)
   * @returns {Promise<Object>} Query result
   */
  async _executeHttp(sql, args = [], retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Build statement object
        const stmt = { sql: sql };
        if (args.length > 0) {
          // Turso requires typed parameters: { type: 'text', value: '...' }
          stmt.args = args.map(arg => {
            // Check for null first (typeof null === 'object' in JavaScript!)
            if (arg === null || arg === undefined) {
              return { type: 'null' };
            }
            // Check if already typed
            if (typeof arg === 'object' && arg.type && arg.value !== undefined) {
              // Already typed
              return arg;
            }
            // Auto-type based on JavaScript type
            if (typeof arg === 'number') {
              return { type: Number.isInteger(arg) ? 'integer' : 'float', value: arg };
            } else if (typeof arg === 'boolean') {
              return { type: 'integer', value: arg ? 1 : 0 };
            } else {
              // Default to text for strings and everything else
              return { type: 'text', value: String(arg) };
            }
          });
        }
        
        // Each HTTP request is independent - include both execute and close
        const requests = [
          {
            type: 'execute',
            stmt: stmt
          },
          { type: 'close' }
        ];
        
        console.log(`[TursoDBService] Executing SQL (attempt ${attempt + 1}/${retries + 1}):`, sql);
        if (args.length > 0) {
          console.log('[TursoDBService] Args:', args);
        }
        
        const response = await fetch(`${this.httpUrl}/v2/pipeline`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ requests }),
          mode: 'cors', // Explicitly set CORS mode
          cache: 'no-cache' // Disable caching to avoid stale connections
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('[TursoDBService] HTTP Error:', response.status, errorText);
          
          // Retry on 5xx errors
          if (response.status >= 500 && attempt < retries) {
            console.log(`[TursoDBService] Server error, retrying in ${(attempt + 1) * 1000}ms...`);
            await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
            continue;
          }
          
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        console.log('[TursoDBService] Query result:', result);
        
        // Validate result structure
        if (!result || !result.results || !Array.isArray(result.results)) {
          console.error('[TursoDBService] Invalid result structure:', result);
          
          // Retry on invalid response
          if (attempt < retries) {
            console.log(`[TursoDBService] Invalid response, retrying in ${(attempt + 1) * 1000}ms...`);
            await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
            continue;
          }
          
          throw new Error('Invalid response from database');
        }
        
        // Check if the first result has an error
        if (result.results[0] && result.results[0].type === 'error') {
          const errorMsg = result.results[0].error?.message || 'Unknown database error';
          console.error('[TursoDBService] Database error:', errorMsg);
          throw new Error(errorMsg);
        }
        
        // Validate nested response structure
        if (!result.results[0] || !result.results[0].response) {
          console.error('[TursoDBService] Missing response in result:', result.results[0]);
          throw new Error('Invalid response structure: missing response object');
        }
        
        // Success - return the first result (the execute result, not the close result)
        return result;
        
      } catch (error) {
        console.error(`[TursoDBService] HTTP execution failed (attempt ${attempt + 1}/${retries + 1}):`, error);
        
        // Retry on network errors
        if ((error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) && attempt < retries) {
          console.log(`[TursoDBService] Network error, retrying in ${(attempt + 1) * 1000}ms...`);
          await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
          continue;
        }
        
        // Last attempt failed - throw error
        if (attempt === retries) {
          throw error;
        }
      }
    }
    
    // Should never reach here
    throw new Error('Unexpected error in _executeHttp');
  }
  
  /**
   * Creates the database schema (users table with indexes)
   * @returns {Promise<void>}
   */
  async createSchema() {
    try {
      if (!this.connected) {
        throw new Error('Database not connected. Call connect() first.');
      }
      
      console.log('[TursoDBService] Creating database schema...');
      
      // Create users table with new fields: dob, gender, virtual_account_number, bank_code
      const createTableSql = `
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          phone_number TEXT UNIQUE NOT NULL,
          id_type TEXT NOT NULL CHECK(id_type IN ('BVN', 'NIN')),
          id_number TEXT UNIQUE NOT NULL,
          first_name TEXT NOT NULL,
          middle_name TEXT,
          last_name TEXT NOT NULL,
          dob TEXT NOT NULL,
          gender TEXT NOT NULL CHECK(gender IN ('1', '2')),
          virtual_account_number TEXT UNIQUE,
          bank_code TEXT,
          current_address_state TEXT NOT NULL,
          current_address_lga TEXT NOT NULL,
          current_address_area TEXT NOT NULL,
          current_address_text TEXT NOT NULL,
          current_address_landmark TEXT,
          permanent_address_state TEXT NOT NULL,
          permanent_address_lga TEXT NOT NULL,
          permanent_address_area TEXT NOT NULL,
          permanent_address_text TEXT NOT NULL,
          hashed_pin TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;
      
      await this._executeHttp(createTableSql);
      console.log('[TursoDBService] ✅ Users table created');
      
      // Create indexes for fast duplicate checking
      try {
        await this._executeHttp('CREATE UNIQUE INDEX IF NOT EXISTS idx_phone_number ON users(phone_number)');
        console.log('[TursoDBService] ✅ Phone number index created');
      } catch (e) {
        console.log('[TursoDBService] Phone number index already exists');
      }
      
      try {
        await this._executeHttp('CREATE UNIQUE INDEX IF NOT EXISTS idx_id_number ON users(id_number)');
        console.log('[TursoDBService] ✅ ID number index created');
      } catch (e) {
        console.log('[TursoDBService] ID number index already exists');
      }
      
      try {
        await this._executeHttp('CREATE UNIQUE INDEX IF NOT EXISTS idx_virtual_account_number ON users(virtual_account_number)');
        console.log('[TursoDBService] ✅ Virtual account number index created');
      } catch (e) {
        console.log('[TursoDBService] Virtual account number index already exists');
      }
      
      try {
        await this._executeHttp('CREATE INDEX IF NOT EXISTS idx_created_at ON users(created_at)');
        console.log('[TursoDBService] ✅ Created_at index created');
      } catch (e) {
        console.log('[TursoDBService] Created_at index already exists');
      }
      
      console.log('[TursoDBService] ✅ Database schema setup complete');
      
      // Run migrations to add missing columns to existing tables
      await this.runMigrations();
      
    } catch (error) {
      console.error('[TursoDBService] Schema creation failed:', error);
      throw new Error('Failed to create database schema: ' + error.message);
    }
  }
  
  /**
   * Runs database migrations to add missing columns to existing tables
   * @returns {Promise<void>}
   */
  async runMigrations() {
    try {
      console.log('[TursoDBService] Running database migrations...');
      
      // Check if users table exists
      try {
        const tableCheckResult = await this._executeHttp(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
        );
        
        if (!tableCheckResult.results[0] || !tableCheckResult.results[0].response || !tableCheckResult.results[0].response.result) {
          console.log('[TursoDBService] Could not check table existence, skipping migrations');
          return;
        }
        
        const tableExists = tableCheckResult.results[0].response.result.rows.length > 0;
        
        if (!tableExists) {
          console.log('[TursoDBService] Users table does not exist yet, skipping migrations');
          return;
        }
      } catch (error) {
        console.error('[TursoDBService] Error checking table existence:', error);
        return;
      }
      
      // Get current table schema
      const schemaResult = await this._executeHttp('PRAGMA table_info(users)');
      
      if (!schemaResult.results[0] || !schemaResult.results[0].response || !schemaResult.results[0].response.result) {
        console.log('[TursoDBService] Could not get table schema, skipping migrations');
        return;
      }
      
      const columns = schemaResult.results[0].response.result.rows;
      const columnNames = columns.map(col => {
        // Each column is an array: [cid, name, type, notnull, dflt_value, pk]
        // We need the name which is at index 1
        const nameCell = col[1];
        return typeof nameCell === 'object' && nameCell.value !== undefined ? nameCell.value : nameCell;
      });
      
      console.log('[TursoDBService] Existing columns:', columnNames);
      
      // List of columns that should exist with their definitions
      const requiredColumns = [
        { name: 'dob', definition: 'TEXT DEFAULT NULL' },
        { name: 'gender', definition: "TEXT DEFAULT NULL" },
        { name: 'virtual_account_number', definition: 'TEXT DEFAULT NULL' },
        { name: 'bank_code', definition: 'TEXT DEFAULT NULL' }
      ];
      
      // Add missing columns
      for (const column of requiredColumns) {
        if (!columnNames.includes(column.name)) {
          console.log(`[TursoDBService] Adding missing column: ${column.name}`);
          try {
            await this._executeHttp(`ALTER TABLE users ADD COLUMN ${column.name} ${column.definition}`);
            console.log(`[TursoDBService] ✅ Added column: ${column.name}`);
          } catch (error) {
            console.error(`[TursoDBService] Failed to add column ${column.name}:`, error);
            // Continue with other columns even if one fails
          }
        }
      }
      
      console.log('[TursoDBService] ✅ Migrations complete');
      
    } catch (error) {
      console.error('[TursoDBService] Migration failed:', error);
      // Don't throw - migrations are best-effort
      console.log('[TursoDBService] Continuing despite migration errors');
    }
  }
  
  /**
   * Checks if a phone number already exists in the database
   * @param {string} phoneNumber - Phone number to check (format: +234XXXXXXXXXX)
   * @returns {Promise<boolean>} True if phone number exists, false otherwise
   */
  async checkPhoneDuplicate(phoneNumber) {
    try {
      if (!this.connected) {
        throw new Error('Database not connected. Call connect() first.');
      }
      
      const result = await this._executeHttp(
        'SELECT COUNT(*) as count FROM users WHERE phone_number = ?',
        [phoneNumber]
      );
      
      // With typed parameters, the structure is: results[0].response.result
      const executeResult = result.results[0].response.result;
      
      // Handle empty result set
      if (!executeResult.rows || executeResult.rows.length === 0) {
        console.log('[TursoDBService] No rows returned, phone does not exist');
        return false;
      }
      
      // Extract value from typed object: {type: "integer", value: "0"}
      const countValue = executeResult.rows[0][0];
      const count = typeof countValue === 'object' ? parseInt(countValue.value) : countValue;
      const exists = count > 0;
      
      console.log(`[TursoDBService] Phone duplicate check: ${phoneNumber} - ${exists ? 'EXISTS' : 'NOT FOUND'}`);
      return exists;
      
    } catch (error) {
      console.error('[TursoDBService] Phone duplicate check failed:', error);
      
      // If table doesn't exist, return false (no duplicates)
      if (error.message.includes('no such table')) {
        console.log('[TursoDBService] Users table does not exist yet, returning false');
        return false;
      }
      
      throw new Error('Database query failed: ' + error.message);
    }
  }
  
  /**
   * Checks if a BVN or NIN already exists in the database
   * @param {string} idNumber - BVN or NIN number (11 digits)
   * @param {string} idType - Type of ID ('BVN' or 'NIN')
   * @returns {Promise<boolean>} True if ID exists, false otherwise
   */
  async checkIDDuplicate(idNumber, idType) {
    try {
      if (!this.connected) {
        throw new Error('Database not connected. Call connect() first.');
      }
      
      const result = await this._executeHttp(
        'SELECT COUNT(*) as count FROM users WHERE id_number = ? AND id_type = ?',
        [idNumber, idType]
      );
      
      const executeResult = result.results[0].response.result;
      
      if (!executeResult.rows || executeResult.rows.length === 0) {
        return false;
      }
      
      const countValue = executeResult.rows[0][0];
      const count = typeof countValue === 'object' ? parseInt(countValue.value) : countValue;
      const exists = count > 0;
      
      console.log(`[TursoDBService] ID duplicate check: ${idType} ${idNumber} - ${exists ? 'EXISTS' : 'NOT FOUND'}`);
      return exists;
      
    } catch (error) {
      console.error('[TursoDBService] ID duplicate check failed:', error);
      
      // If table doesn't exist, return false (no duplicates)
      if (error.message.includes('no such table')) {
        console.log('[TursoDBService] Users table does not exist yet, returning false');
        return false;
      }
      
      throw new Error('Database query failed: ' + error.message);
    }
  }
  
  /**
   * Saves a new user to the database
   * @param {Object} userData - User data object
   * @param {string} userData.phoneNumber - User's phone number
   * @param {string} userData.idType - 'BVN' or 'NIN'
   * @param {string} userData.idNumber - BVN or NIN number
   * @param {string} userData.firstName - User's first name
   * @param {string} userData.middleName - User's middle name (optional)
   * @param {string} userData.lastName - User's last name
   * @param {Object} userData.currentAddress - Current address object
   * @param {Object} userData.permanentAddress - Permanent address object
   * @param {string} userData.hashedPin - Hashed PIN
   * @returns {Promise<Object>} Saved user object with generated ID
   */
  async saveUser(userData) {
    try {
      if (!this.connected) {
        throw new Error('Database not connected. Call connect() first.');
      }
      
      const sql = `INSERT INTO users (
        phone_number, id_type, id_number, first_name, middle_name, last_name,
        dob, gender, virtual_account_number, bank_code,
        current_address_state, current_address_lga, current_address_area,
        current_address_text, current_address_landmark,
        permanent_address_state, permanent_address_lga, permanent_address_area,
        permanent_address_text, hashed_pin
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      
      const args = [
        userData.phoneNumber,
        userData.idType,
        userData.idNumber,
        userData.firstName,
        userData.middleName || null,
        userData.lastName,
        userData.dob,
        userData.gender,
        userData.virtualAccountNumber || null,
        userData.bankCode || null,
        userData.currentAddress.state,
        userData.currentAddress.lga,
        userData.currentAddress.area,
        userData.currentAddress.addressText,
        userData.currentAddress.landmark || null,
        userData.permanentAddress.state,
        userData.permanentAddress.lga,
        userData.permanentAddress.area,
        userData.permanentAddress.addressText,
        userData.hashedPin
      ];
      
      const result = await this._executeHttp(sql, args);
      
      // Validate response structure
      if (!result || !result.results || !result.results[0]) {
        console.error('[TursoDBService] Invalid result structure:', result);
        throw new Error('Invalid response from database: missing results array');
      }
      
      if (!result.results[0].response) {
        console.error('[TursoDBService] Invalid result structure - no response:', result.results[0]);
        throw new Error('Invalid response from database: missing response object');
      }
      
      if (!result.results[0].response.result) {
        console.error('[TursoDBService] Invalid result structure - no result:', result.results[0].response);
        throw new Error('Invalid response from database: missing result object');
      }
      
      const executeResult = result.results[0].response.result;
      const lastInsertRowid = executeResult.last_insert_rowid;
      console.log('[TursoDBService] ✅ User saved successfully. ID:', lastInsertRowid);
      
      return {
        id: lastInsertRowid,
        ...userData
      };
      
    } catch (error) {
      console.error('[TursoDBService] Save user failed:', error);
      throw new Error('Failed to save user: ' + error.message);
    }
  }
  
  /**
   * Retrieves a user by phone number
   * @param {string} phoneNumber - Phone number to search for
   * @returns {Promise<Object|null>} User object if found, null otherwise
   */
  async getUserByPhone(phoneNumber) {
    try {
      if (!this.connected) {
        throw new Error('Database not connected. Call connect() first.');
      }
      
      const result = await this._executeHttp(
        'SELECT * FROM users WHERE phone_number = ? LIMIT 1',
        [phoneNumber]
      );
      
      const executeResult = result.results[0].response.result;
      const rows = executeResult.rows;
      const cols = executeResult.cols;
      
      if (rows.length === 0) {
        console.log(`[TursoDBService] Get user by phone: ${phoneNumber} - NOT FOUND`);
        return null;
      }
      
      // Convert row array to object using column names
      // Each cell is a typed object: {type: "text", value: "..."}
      const user = {};
      cols.forEach((col, index) => {
        const cellValue = rows[0][index];
        user[col.name] = typeof cellValue === 'object' && cellValue.value !== undefined ? cellValue.value : cellValue;
      });
      
      console.log(`[TursoDBService] Get user by phone: ${phoneNumber} - FOUND`);
      return user;
      
    } catch (error) {
      console.error('[TursoDBService] Get user by phone failed:', error);
      
      // If table doesn't exist, return null
      if (error.message.includes('no such table')) {
        console.log('[TursoDBService] Users table does not exist yet, returning null');
        return null;
      }
      
      throw new Error('Database query failed: ' + error.message);
    }
  }
  
  /**
   * Gets all users (for testing/debugging)
   * @returns {Promise<Array>} Array of user objects
   */
  async getAllUsers() {
    try {
      if (!this.connected) {
        throw new Error('Database not connected. Call connect() first.');
      }
      
      const result = await this._executeHttp('SELECT * FROM users');
      
      const executeResult = result.results[0].response.result;
      const rows = executeResult.rows;
      const cols = executeResult.cols;
      
      // Convert rows to objects
      const users = rows.map(row => {
        const user = {};
        cols.forEach((col, index) => {
          const cellValue = row[index];
          user[col.name] = typeof cellValue === 'object' && cellValue.value !== undefined ? cellValue.value : cellValue;
        });
        return user;
      });
      
      console.log(`[TursoDBService] Retrieved ${users.length} users`);
      return users;
      
    } catch (error) {
      console.error('[TursoDBService] Get all users failed:', error);
      
      // If table doesn't exist, return empty array
      if (error.message.includes('no such table')) {
        console.log('[TursoDBService] Users table does not exist yet, returning empty array');
        return [];
      }
      
      throw new Error('Database query failed: ' + error.message);
    }
  }
  
  /**
   * Creates the escrow database schema (transactions, disputes, trust_scores, etc.)
   * @returns {Promise<void>}
   */
  async createEscrowSchema() {
    try {
      if (!this.connected) {
        throw new Error('Database not connected. Call connect() first.');
      }
      
      console.log('[TursoDBService] Creating escrow database schema...');
      
      // Create transactions table
      const createTransactionsTableSql = `
        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_id TEXT UNIQUE NOT NULL,
          seller_id INTEGER NOT NULL,
          buyer_id INTEGER,
          item_description TEXT NOT NULL,
          price REAL NOT NULL CHECK(price >= 100 AND price <= 10000000),
          delivery_timeline_days INTEGER NOT NULL CHECK(delivery_timeline_days BETWEEN 1 AND 90),
          inspection_window_days INTEGER NOT NULL CHECK(inspection_window_days BETWEEN 1 AND 14),
          state TEXT NOT NULL CHECK(state IN ('Created', 'Funded_Locked', 'In_Transit', 'Disputed', 'Completed')),
          risk_score REAL,
          ai_verdict TEXT CHECK(ai_verdict IN ('pass', 'fail')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          funded_at DATETIME,
          shipped_at DATETIME,
          completed_at DATETIME,
          
          FOREIGN KEY (seller_id) REFERENCES users(id),
          FOREIGN KEY (buyer_id) REFERENCES users(id)
        )
      `;
      
      await this._executeHttp(createTransactionsTableSql);
      console.log('[TursoDBService] ✅ Transactions table created');

      // Idempotent migrations for dual-axis (Buyer/Seller) initiator support.
      // SQLite ignores duplicate ALTER TABLE ADD COLUMN by throwing; we catch and continue.
      const transactionMigrations = [
        "ALTER TABLE transactions ADD COLUMN initiator_id INTEGER",
        "ALTER TABLE transactions ADD COLUMN initiator_role TEXT",
        "ALTER TABLE transactions ADD COLUMN proof_urls TEXT",
        "ALTER TABLE transactions ADD COLUMN joiner_id INTEGER",
        "ALTER TABLE transactions ADD COLUMN fulfillment_proof TEXT"
      ];
      for (const sql of transactionMigrations) {
        try {
          await this._executeHttp(sql);
          console.log('[TursoDBService] ✅ Migration applied:', sql);
        } catch (e) {
          // Column already exists - safe to ignore
          console.log('[TursoDBService] Migration skipped (already applied):', sql.split(' ').slice(-2).join(' '));
        }
      }
      
      // Create indexes for transactions table
      const transactionIndexes = [
        'CREATE INDEX IF NOT EXISTS idx_transaction_id ON transactions(transaction_id)',
        'CREATE INDEX IF NOT EXISTS idx_seller_id ON transactions(seller_id)',
        'CREATE INDEX IF NOT EXISTS idx_buyer_id ON transactions(buyer_id)',
        'CREATE INDEX IF NOT EXISTS idx_state ON transactions(state)',
        'CREATE INDEX IF NOT EXISTS idx_created_at ON transactions(created_at)'
      ];
      
      for (const indexSql of transactionIndexes) {
        try {
          await this._executeHttp(indexSql);
        } catch (e) {
          console.log('[TursoDBService] Index already exists:', e.message);
        }
      }
      console.log('[TursoDBService] ✅ Transaction indexes created');
      
      // Create transaction_state_history table
      const createStateHistoryTableSql = `
        CREATE TABLE IF NOT EXISTS transaction_state_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_id TEXT NOT NULL,
          from_state TEXT,
          to_state TEXT NOT NULL,
          changed_by INTEGER NOT NULL,
          changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          notes TEXT,
          
          FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id),
          FOREIGN KEY (changed_by) REFERENCES users(id)
        )
      `;
      
      await this._executeHttp(createStateHistoryTableSql);
      console.log('[TursoDBService] ✅ Transaction state history table created');
      
      // Create indexes for state history table
      const stateHistoryIndexes = [
        'CREATE INDEX IF NOT EXISTS idx_history_transaction_id ON transaction_state_history(transaction_id)',
        'CREATE INDEX IF NOT EXISTS idx_history_changed_at ON transaction_state_history(changed_at)'
      ];
      
      for (const indexSql of stateHistoryIndexes) {
        try {
          await this._executeHttp(indexSql);
        } catch (e) {
          console.log('[TursoDBService] Index already exists:', e.message);
        }
      }
      console.log('[TursoDBService] ✅ State history indexes created');
      
      // Create disputes table
      const createDisputesTableSql = `
        CREATE TABLE IF NOT EXISTS disputes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_id TEXT NOT NULL UNIQUE,
          raised_by INTEGER NOT NULL,
          description TEXT NOT NULL,
          photo_urls TEXT,
          ai_resolution TEXT,
          ai_confidence REAL,
          manual_resolution TEXT,
          resolved_at DATETIME,
          resolution_type TEXT CHECK(resolution_type IN ('automated', 'ai_assisted', 'manual')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          
          FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id),
          FOREIGN KEY (raised_by) REFERENCES users(id)
        )
      `;
      
      await this._executeHttp(createDisputesTableSql);
      console.log('[TursoDBService] ✅ Disputes table created');
      
      // Create indexes for disputes table
      const disputeIndexes = [
        'CREATE INDEX IF NOT EXISTS idx_dispute_transaction_id ON disputes(transaction_id)',
        'CREATE INDEX IF NOT EXISTS idx_dispute_created_at ON disputes(created_at)'
      ];
      
      for (const indexSql of disputeIndexes) {
        try {
          await this._executeHttp(indexSql);
        } catch (e) {
          console.log('[TursoDBService] Index already exists:', e.message);
        }
      }
      console.log('[TursoDBService] ✅ Dispute indexes created');
      
      // Create trust_scores table
      const createTrustScoresTableSql = `
        CREATE TABLE IF NOT EXISTS trust_scores (
          user_id INTEGER PRIMARY KEY,
          score REAL NOT NULL CHECK(score BETWEEN 1 AND 100),
          total_transactions INTEGER DEFAULT 0,
          successful_transactions INTEGER DEFAULT 0,
          disputed_transactions INTEGER DEFAULT 0,
          last_calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `;
      
      await this._executeHttp(createTrustScoresTableSql);
      console.log('[TursoDBService] ✅ Trust scores table created');
      
      // Create index for trust_scores table
      try {
        await this._executeHttp('CREATE INDEX IF NOT EXISTS idx_trust_score ON trust_scores(score)');
      } catch (e) {
        console.log('[TursoDBService] Trust score index already exists');
      }
      console.log('[TursoDBService] ✅ Trust score index created');
      
      // Create ai_risk_logs table
      const createAIRiskLogsTableSql = `
        CREATE TABLE IF NOT EXISTS ai_risk_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_id TEXT NOT NULL,
          user_id INTEGER NOT NULL,
          risk_score REAL NOT NULL,
          verdict TEXT NOT NULL,
          anomaly_indicators TEXT,
          features TEXT NOT NULL,
          model_version TEXT,
          response_time_ms INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          
          FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id),
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `;
      
      await this._executeHttp(createAIRiskLogsTableSql);
      console.log('[TursoDBService] ✅ AI risk logs table created');
      
      // Create indexes for ai_risk_logs table
      const aiRiskLogIndexes = [
        'CREATE INDEX IF NOT EXISTS idx_risk_log_transaction_id ON ai_risk_logs(transaction_id)',
        'CREATE INDEX IF NOT EXISTS idx_risk_log_user_id ON ai_risk_logs(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_risk_log_created_at ON ai_risk_logs(created_at)'
      ];
      
      for (const indexSql of aiRiskLogIndexes) {
        try {
          await this._executeHttp(indexSql);
        } catch (e) {
          console.log('[TursoDBService] Index already exists:', e.message);
        }
      }
      console.log('[TursoDBService] ✅ AI risk log indexes created');
      
      console.log('[TursoDBService] ✅ Escrow database schema setup complete');
      
    } catch (error) {
      console.error('[TursoDBService] Escrow schema creation failed:', error);
      throw new Error('Failed to create escrow database schema: ' + error.message);
    }
  }
  
  /**
   * Automatically initializes all database schemas (users + escrow)
   * Detects missing tables and creates them automatically
   * Safe to call multiple times - idempotent operation
   * @returns {Promise<void>}
   */
  async initializeAllSchemas() {
    try {
      if (!this.connected) {
        throw new Error('Database not connected. Call connect() first.');
      }
      
      console.log('[TursoDBService] 🔍 Checking database schemas...');
      
      // Get list of existing tables
      const result = await this._executeHttp(`
        SELECT name FROM sqlite_master 
        WHERE type='table' 
        ORDER BY name
      `);
      
      const existingTables = [];
      if (result.results[0] && result.results[0].response && result.results[0].response.result) {
        const rows = result.results[0].response.result.rows;
        rows.forEach(row => {
          const tableName = row[0];
          const name = typeof tableName === 'object' && tableName.value !== undefined ? tableName.value : tableName;
          existingTables.push(name);
        });
      }
      
      console.log('[TursoDBService] Existing tables:', existingTables);
      
      // Check if user schema exists
      const hasUserSchema = existingTables.includes('users');
      
      // Check if escrow schema exists (check for key tables)
      const hasEscrowSchema = existingTables.includes('transactions') && 
                              existingTables.includes('transaction_state_history') &&
                              existingTables.includes('disputes') &&
                              existingTables.includes('trust_scores') &&
                              existingTables.includes('ai_risk_logs');
      
      // Create user schema if missing
      if (!hasUserSchema) {
        console.log('[TursoDBService] 📦 User schema not found - creating...');
        await this.createSchema();
        console.log('[TursoDBService] ✅ User schema created');
      } else {
        console.log('[TursoDBService] ✅ User schema exists');
        // Run migrations to ensure all columns exist
        await this.runMigrations();
      }
      
      // Create escrow schema if missing
      if (!hasEscrowSchema) {
        console.log('[TursoDBService] 📦 Escrow schema not found - creating...');
        await this.createEscrowSchema();
        console.log('[TursoDBService] ✅ Escrow schema created');
      } else {
        console.log('[TursoDBService] ✅ Escrow schema exists');
      }
      
      console.log('[TursoDBService] 🎉 All database schemas ready!');
      
    } catch (error) {
      console.error('[TursoDBService] ❌ Schema initialization failed:', error);
      throw new Error('Failed to initialize database schemas: ' + error.message);
    }
  }
  
  /**
   * Disconnects from the database (cleanup)
   * @returns {Promise<void>}
   */
  async disconnect() {
    try {
      this.connected = false;
      console.log('[TursoDBService] Disconnected from database');
    } catch (error) {
      console.error('[TursoDBService] Disconnect failed:', error);
      throw new Error('Failed to disconnect: ' + error.message);
    }
  }
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.TursoDBService = TursoDBService;
}
