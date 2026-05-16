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

            // Auto-type based on JavaScript type.

            // NOTE: Turso's Hrana HTTP protocol requires integer/float values

            // to be encoded as JSON STRINGS (so 64-bit precision survives

            // JSON's number type). Sending `{ type: 'integer', value: 1 }`

            // gets rejected with HTTP 400 (which the browser surfaces as a

            // CORS error, since 400 responses omit CORS headers).

            if (typeof arg === 'number') {

              // Hrana 3 spec: integer.value MUST be a JSON string (to preserve

              // 64-bit precision), float.value MUST be a JSON number.

              if (Number.isInteger(arg)) {

                return { type: 'integer', value: String(arg) };

              }

              return { type: 'float', value: arg };

            } else if (typeof arg === 'boolean') {

              return { type: 'integer', value: arg ? '1' : '0' };

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

        

        console.log(`[TursoDBService v3] Executing SQL (attempt ${attempt + 1}/${retries + 1}):`, sql);

        if (args.length > 0) {

          console.log('[TursoDBService v3] Raw args:', args);

          console.log('[TursoDBService v3] Typed args sent to Turso:', stmt.args);

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

          face_reference_url TEXT,

          face_reference_uploaded_at TEXT,

          email TEXT,

          email_verified INTEGER DEFAULT 0,

          demo_balance REAL DEFAULT 0,

          last_anomaly_score REAL,

          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP

        )

      `;

      

      await this._executeHttp(createTableSql);
      console.log('[TursoDBService] ✅ Users table created');

      // Ensure all columns exist (idempotent migrations for existing tables)
      const addCols = [
        'face_reference_url TEXT',
        'face_reference_uploaded_at TEXT',
        'email TEXT',
        'email_verified INTEGER DEFAULT 0',
        'demo_balance REAL DEFAULT 0',
        'last_anomaly_score REAL'
      ];
      for (const col of addCols) {
        try {
          await this._executeHttp(`ALTER TABLE users ADD COLUMN ${col}`);
          console.log(`[TursoDBService] Added column: ${col}`);
        } catch (e) {
          // Column already exists — safe to ignore
        }
      }

      

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

      

      // List of columns that should exist with their definitions.

      // Behavioral counters power the Dynamic Trust Engine — they are kept

      // as cumulative totals on the user row so trust recalculation stays

      // O(1) per terminal-state event instead of re-aggregating the entire

      // transaction history every time. `trust_score` is the cached final

      // number used everywhere in the UI.

      const requiredColumns = [

        { name: 'dob', definition: 'TEXT DEFAULT NULL' },

        { name: 'gender', definition: "TEXT DEFAULT NULL" },

        { name: 'virtual_account_number', definition: 'TEXT DEFAULT NULL' },

        { name: 'bank_code', definition: 'TEXT DEFAULT NULL' },

        // ----- Trust Engine counters & cache -----

        { name: 'trust_score',                     definition: 'REAL DEFAULT 50' },

        { name: 'trust_score_updated_at',          definition: 'DATETIME' },

        { name: 'successful_deliveries',           definition: 'INTEGER DEFAULT 0' },

        { name: 'total_completed',                 definition: 'INTEGER DEFAULT 0' },

        { name: 'total_cancellations_initiated',   definition: 'INTEGER DEFAULT 0' },

        { name: 'mutual_cancellations',            definition: 'INTEGER DEFAULT 0' },

        { name: 'disputes_won',                    definition: 'INTEGER DEFAULT 0' },

        { name: 'disputes_lost',                   definition: 'INTEGER DEFAULT 0' },

        { name: 'late_deliveries',                 definition: 'INTEGER DEFAULT 0' },

        { name: 'failed_join_attempts',            definition: 'INTEGER DEFAULT 0' },

        { name: 'total_volume_ngn',                definition: 'REAL DEFAULT 0' },

        { name: 'avg_fulfillment_hours',           definition: 'REAL' },

        { name: 'last_activity_at',                definition: 'DATETIME' },

        // Peer-graph signal: # of DISTINCT counterparties this user has

        // lost a dispute to. A user with 5 losses across 5 different

        // counterparties is far riskier than 5 losses to the same

        // chronic complainer; the AnomalyDetectionEngine reads this.

        { name: 'distinct_dispute_losers',         definition: 'INTEGER DEFAULT 0' },

        // ----- v3 additions (email + admin + face reference) -----

        // Email is captured at signup for transactional notifications

        // (Resend) and as the channel for the signup OTP. Nullable so

        // legacy phone-only accounts still work.

        { name: 'email',                           definition: 'TEXT' },

        // Set to 1 after the user enters the correct OTP delivered to

        // their email. Used by transactional-email paths to decide

        // whether to actually attempt delivery.

        { name: 'email_verified',                  definition: 'INTEGER DEFAULT 0' },

        // Single admin flag — flipped manually in the DB for now.

        // Admin dashboard (admin.html) checks this on load and 403s

        // anyone who reaches it without it set.

        { name: 'is_admin',                        definition: 'INTEGER DEFAULT 0' },

        // Face reference image captured during signup liveness. The

        // URL is a Cloudinary secure_url (NOT a base64 blob). On

        // re-verification we send THIS plus a freshly captured frame

        // to FaceVerificationService for a same-person verdict.

        { name: 'face_reference_url',              definition: 'TEXT' },

        { name: 'face_reference_uploaded_at',      definition: 'DATETIME' },

        // Phase F: timestamp of the most recent SUCCESSFUL face

        // re-verification (Gemini match=true). Used to decide whether

        // a fresh re-verify is needed before high-risk actions. NULL

        // means "never re-verified since signup" — treated as stale.

        { name: 'last_face_verified_at',           definition: 'DATETIME' },

        // Profile fields visible in the "My Profile" panel. Address is

        // a single free-text field for now (state + city + street).

        // We deliberately do NOT add a `nickname` column — the user

        // explicitly opted out of having a nickname field on profile.

        { name: 'address',                         definition: 'TEXT' },

        // Hackathon demo: random balance so judges can test escrow flows
        { name: 'demo_balance',                    definition: 'REAL DEFAULT 0' },

        // Anomaly detection engine score cache
        { name: 'last_anomaly_score',              definition: 'REAL' }

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



      // ----- transactions table migrations (dual-axis Buyer/Seller flow) -----

      try {

        const txnTableCheck = await this._executeHttp(

          "SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'"

        );

        const txnExists =

          txnTableCheck.results[0] &&

          txnTableCheck.results[0].response &&

          txnTableCheck.results[0].response.result &&

          txnTableCheck.results[0].response.result.rows.length > 0;



        if (txnExists) {

          const txnSchema = await this._executeHttp('PRAGMA table_info(transactions)');

          const txnRows = txnSchema.results[0].response.result.rows;

          const txnCols = txnRows.map(col => {

            const nameCell = col[1];

            return typeof nameCell === 'object' && nameCell.value !== undefined ? nameCell.value : nameCell;

          });



          console.log('[TursoDBService] Existing transactions columns:', txnCols);



          // Columns required by the current TransactionService / dashboard flow.

          // SQLite ALTER TABLE ADD COLUMN cannot add NOT NULL without a default,

          // so all of these are nullable to stay safe on existing rows.

          const requiredTxnColumns = [

            { name: 'initiator_id', definition: 'INTEGER' },

            { name: 'initiator_role', definition: "TEXT CHECK(initiator_role IN ('buyer','seller'))" },

            { name: 'joiner_id', definition: 'INTEGER' },

            { name: 'proof_urls', definition: 'TEXT' },

            { name: 'fulfillment_proof', definition: 'TEXT' },

            { name: 'risk_score', definition: 'INTEGER' },

            { name: 'ai_verdict', definition: 'TEXT' },

            // Cancellation flow:

            //  - cancellation_requested_by: user_id of whoever opened the

            //    cancellation request (only meaningful while state =

            //    'Funded_Locked' and not yet accepted/declined).

            //  - cancellation_requested_at: ISO timestamp of that request.

            //  - cancellation_reason: optional reason captured at cancel time

            //    (used for both unilateral 'Created' cancels and mutual

            //    'Funded_Locked' accepts). Stored even on terminal Cancelled

            //    rows so it shows up in the Details modal.

            { name: 'cancellation_requested_by', definition: 'INTEGER' },

            { name: 'cancellation_requested_at', definition: 'TEXT' },

            { name: 'cancellation_reason', definition: 'TEXT' },

            // ----- Predictive Risk Profiling cache -----

            // `risk_profile_score` is OUR own deterministic+Gemini score

            // (0–100, higher = riskier), separate from the legacy

            // `risk_score` produced by the external AI engine. We keep

            // them split so we never confuse the two systems.

            // `risk_profile_flags` stores the JSON-serialized rule hits

            // so we can render the warning banner without recomputing.

            { name: 'risk_profile_score', definition: 'REAL' },

            { name: 'risk_profile_flags', definition: 'TEXT' },

            { name: 'risk_profile_evaluated_at', definition: 'DATETIME' },

            // Set at creation/funding time when the seller is currently

            // Elite-tier (>=95) AND has >=10 successful deliveries AND

            // 0 disputes lost. Read by StateMachineService when seller

            // marks shipped — short-circuits the inspection window and

            // releases funds immediately.

            { name: 'auto_release_eligible', definition: 'INTEGER DEFAULT 0' },

            // ----- AI Anomaly Detection Engine umbrella verdict -----

            // The composite decision produced by AnomalyDetectionEngine

            // (combining rules + ML). Cached on the row so

            // re-renders don't re-evaluate. Distinct from `ai_verdict`

            // (ML-only legacy) and `risk_profile_score` (rules-only).

            { name: 'anomaly_decision',        definition: "TEXT CHECK(anomaly_decision IN ('pass','review','block'))" },

            { name: 'anomaly_engine_version',  definition: 'TEXT' }

          ];



          for (const column of requiredTxnColumns) {

            if (!txnCols.includes(column.name)) {

              console.log(`[TursoDBService] Adding missing transactions column: ${column.name}`);

              try {

                await this._executeHttp(

                  `ALTER TABLE transactions ADD COLUMN ${column.name} ${column.definition}`

                );

                console.log(`[TursoDBService] ✅ Added transactions column: ${column.name}`);

              } catch (error) {

                console.error(

                  `[TursoDBService] Failed to add transactions column ${column.name}:`,

                  error

                );

              }

            }

          }



          // ------------------------------------------------------------------

          // Relax the CHECK constraint on transactions.state to allow the new

          // terminal states 'Cancelled' and 'Refunded'. SQLite doesn't support

          // ALTER TABLE ... DROP/MODIFY CONSTRAINT, so we follow the standard

          // 12-step pattern: build a new table with the wider constraint, copy

          // rows over, drop the old table, rename, and recreate the indexes.

          //

          // Detection: read the existing CREATE TABLE statement from

          // sqlite_master and check whether 'Cancelled' already appears in it.

          // The rebuild only runs on legacy databases.

          // ------------------------------------------------------------------

          try {

            const createSqlResult = await this._executeHttp(

              "SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'"

            );

            const rawSqlCell =

              createSqlResult.results[0] &&

              createSqlResult.results[0].response &&

              createSqlResult.results[0].response.result &&

              createSqlResult.results[0].response.result.rows[0] &&

              createSqlResult.results[0].response.result.rows[0][0];

            const currentCreateSql =

              rawSqlCell && typeof rawSqlCell === 'object'

                ? (rawSqlCell.value !== undefined ? rawSqlCell.value : null)

                : rawSqlCell;



            if (typeof currentCreateSql === 'string' && !/'Cancelled'/.test(currentCreateSql)) {

              console.log('[TursoDBService] Rebuilding transactions table to widen state CHECK constraint');



              // 1) New CREATE TABLE targeting transactions_new, with the

              //    state CHECK list extended. The regex is liberal about

              //    quoting / whitespace because Turso may normalize the SQL.

              const newCreateSql = currentCreateSql

                .replace(/CREATE\s+TABLE\s+"?transactions"?/i, 'CREATE TABLE transactions_new')

                .replace(

                  /CHECK\s*\(\s*state\s+IN\s*\([^)]*\)\s*\)/i,

                  "CHECK(state IN ('Created', 'Funded_Locked', 'In_Transit', 'Disputed', 'Completed', 'Cancelled', 'Refunded'))"

                );



              if (!/transactions_new/.test(newCreateSql) || !/'Cancelled'/.test(newCreateSql)) {

                throw new Error('Could not safely rewrite CREATE TABLE statement');

              }



              // 2) Capture existing index DDLs so we can re-create them on

              //    the renamed table. We skip auto-created indexes (those

              //    have sql = NULL in sqlite_master).

              const indexResult = await this._executeHttp(

                "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='transactions' AND sql IS NOT NULL"

              );

              const idxRows =

                (indexResult.results[0] &&

                  indexResult.results[0].response &&

                  indexResult.results[0].response.result &&

                  indexResult.results[0].response.result.rows) ||

                [];

              const indexSqls = idxRows

                .map(r => {

                  const cell = r[1];

                  return typeof cell === 'object' && cell.value !== undefined ? cell.value : cell;

                })

                .filter(s => typeof s === 'string' && s.length > 0);



              // 3) Perform the rebuild. Each step is a separate request; if

              //    any single step fails we abort so we don't leave the DB

              //    in a half-migrated state with both transactions and

              //    transactions_new existing.

              try {

                await this._executeHttp('DROP TABLE IF EXISTS transactions_new');

              } catch (_) { /* best-effort cleanup */ }



              await this._executeHttp(newCreateSql);

              await this._executeHttp('INSERT INTO transactions_new SELECT * FROM transactions');

              await this._executeHttp('DROP TABLE transactions');

              await this._executeHttp('ALTER TABLE transactions_new RENAME TO transactions');



              for (const idxSql of indexSqls) {

                try {

                  await this._executeHttp(idxSql);

                } catch (idxErr) {

                  console.warn('[TursoDBService] Index recreate failed (non-fatal):', idxErr.message);

                }

              }



              console.log("[TursoDBService] ✅ transactions.state CHECK now allows 'Cancelled' and 'Refunded'");

            }

          } catch (constraintErr) {

            console.error('[TursoDBService] state-CHECK widening migration failed:', constraintErr);

            // Non-fatal: app continues; cancel operations will surface the

            // CHECK error to the user until this migration succeeds.

          }

        } else {

          console.log('[TursoDBService] transactions table not found, skipping its migrations');

        }

      } catch (error) {

        console.error('[TursoDBService] transactions migration failed:', error);

      }



      // ----- trust_score_history (append-only audit log) -----

      // Every time TrustEngineService.recalculate() changes a user's

      // score we insert a row here. This powers:

      //   1. The score-history sparkline in the user's own profile chip

      //   2. The "What changed?" tooltip when a score changes after an

      //      action (delta + reason).

      //   3. Optional retroactive analysis if we ever want to tune

      //      formula weights without hot-running migrations.

      try {

        await this._executeHttp(`

          CREATE TABLE IF NOT EXISTS trust_score_history (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            user_id INTEGER NOT NULL,

            score_before REAL,

            score_after REAL NOT NULL,

            delta REAL,

            reason TEXT NOT NULL,

            transaction_id TEXT,

            metadata TEXT,

            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (user_id) REFERENCES users(id)

          )

        `);

        await this._executeHttp(

          'CREATE INDEX IF NOT EXISTS idx_tsh_user_created ON trust_score_history(user_id, created_at DESC)'

        );

        console.log('[TursoDBService] ✅ trust_score_history table ready');

      } catch (e) {

        console.error('[TursoDBService] trust_score_history setup failed:', e);

      }



      // ----- ai_risk_logs enrichment for the AnomalyDetectionEngine -----

      // The legacy `ai_risk_logs` table only captured the ML sub-score.

      // The umbrella engine (AnomalyDetectionEngine) needs to record the

      // full composite picture: which sub-detectors ran, their individual

      // scores, the device fingerprint, and the final composite decision.

      // ALTER TABLE ADD COLUMN is idempotent in spirit — we swallow

      // "duplicate column" errors so re-running this migration is safe.

      try {

        const arlCheck = await this._executeHttp(

          "SELECT name FROM sqlite_master WHERE type='table' AND name='ai_risk_logs'"

        );

        const arlExists =

          arlCheck.results[0] &&

          arlCheck.results[0].response &&

          arlCheck.results[0].response.result &&

          arlCheck.results[0].response.result.rows.length > 0;



        if (arlExists) {

          const arlSchema = await this._executeHttp('PRAGMA table_info(ai_risk_logs)');

          const arlRows = arlSchema.results[0].response.result.rows;

          const arlCols = arlRows.map(col => {

            const cell = col[1];

            return typeof cell === 'object' && cell.value !== undefined ? cell.value : cell;

          });



          const requiredArlColumns = [

            { name: 'device_fingerprint_id', definition: 'TEXT' },

            { name: 'behavioral_signals',    definition: 'TEXT' },

            { name: 'engine_version',        definition: 'TEXT' },

            { name: 'final_decision',        definition: "TEXT" },

            { name: 'sub_scores',            definition: 'TEXT' }

          ];



          for (const column of requiredArlColumns) {

            if (!arlCols.includes(column.name)) {

              try {

                await this._executeHttp(

                  `ALTER TABLE ai_risk_logs ADD COLUMN ${column.name} ${column.definition}`

                );

                console.log(`[TursoDBService] ✅ Added ai_risk_logs column: ${column.name}`);

              } catch (e) {

                console.warn(`[TursoDBService] ai_risk_logs column ${column.name} skip:`, e.message);

              }

            }

          }

        }

      } catch (e) {

        console.error('[TursoDBService] ai_risk_logs enrichment failed:', e);

      }



      // ----- device_fingerprints (multi-account-from-device detection) -----

      // Each row is one (fingerprint, user) pair the platform has seen.

      // Many users sharing one fingerprint = sock-puppet pattern; one

      // user across many fingerprints = device-rotation pattern. Both

      // are flagged by the risk profiling / anomaly stack.

      try {

        await this._executeHttp(`

          CREATE TABLE IF NOT EXISTS device_fingerprints (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            fingerprint_id TEXT NOT NULL,

            user_id INTEGER NOT NULL,

            first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,

            last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,

            seen_count INTEGER DEFAULT 1,

            confidence REAL,

            components TEXT,

            user_agent TEXT,

            UNIQUE(fingerprint_id, user_id),

            FOREIGN KEY (user_id) REFERENCES users(id)

          )

        `);

        await this._executeHttp(

          'CREATE INDEX IF NOT EXISTS idx_df_fpid ON device_fingerprints(fingerprint_id)'

        );

        await this._executeHttp(

          'CREATE INDEX IF NOT EXISTS idx_df_user ON device_fingerprints(user_id)'

        );

        console.log('[TursoDBService] ✅ device_fingerprints table ready');

      } catch (e) {

        console.error('[TursoDBService] device_fingerprints setup failed:', e);

      }



      // ----- anomaly_decisions (umbrella audit trail) -----

      // One row per AnomalyDetectionEngine.evaluate() call. Lives

      // alongside `ai_risk_logs` (which is ML-only) so we can still

      // audit every decision even when the ML sub-detector was down.

      try {

        await this._executeHttp(`

          CREATE TABLE IF NOT EXISTS anomaly_decisions (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            transaction_id TEXT,

            user_id INTEGER NOT NULL,

            decision TEXT NOT NULL CHECK(decision IN ('pass','review','block')),

            composite_score REAL NOT NULL,

            rules_score REAL,

            ml_score REAL,

            behavioral_score REAL,

            flags TEXT,

            layers_active TEXT,

            fingerprint_id TEXT,

            engine_version TEXT,

            evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (user_id) REFERENCES users(id)

          )

        `);

        await this._executeHttp(

          'CREATE INDEX IF NOT EXISTS idx_ad_user ON anomaly_decisions(user_id, evaluated_at DESC)'

        );

        await this._executeHttp(

          'CREATE INDEX IF NOT EXISTS idx_ad_txn ON anomaly_decisions(transaction_id)'

        );

        await this._executeHttp(

          'CREATE INDEX IF NOT EXISTS idx_ad_decision ON anomaly_decisions(decision)'

        );

        console.log('[TursoDBService] ✅ anomaly_decisions table ready');

      } catch (e) {

        console.error('[TursoDBService] anomaly_decisions setup failed:', e);

      }



      // ----- notifications (in-app notification bell) -----

      // One row per notification surfaced in the bell-icon panel.

      // `category` drives the tab layout in the UI (Transactions vs

      // Activities). `action_url` is optional and turns the row into

      // a clickable deep-link (e.g. open a specific transaction).

      // `severity` is the icon color (success/info/warning/danger).

      // We also persist `is_read` so the badge count is correct after

      // a tab close; mark-all-read just bulk-UPDATEs by user_id.

      try {

        await this._executeHttp(`

          CREATE TABLE IF NOT EXISTS notifications (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            user_id INTEGER NOT NULL,

            category TEXT NOT NULL DEFAULT 'activities'

              CHECK(category IN ('transactions','activities')),

            type TEXT NOT NULL,

            title TEXT NOT NULL,

            message TEXT NOT NULL,

            severity TEXT DEFAULT 'info'

              CHECK(severity IN ('info','success','warning','danger')),

            action_url TEXT,

            transaction_id TEXT,

            metadata TEXT,

            is_read INTEGER DEFAULT 0,

            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (user_id) REFERENCES users(id)

          )

        `);

        await this._executeHttp(

          'CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON notifications(user_id, is_read, created_at DESC)'

        );

        await this._executeHttp(

          'CREATE INDEX IF NOT EXISTS idx_notif_user_created ON notifications(user_id, created_at DESC)'

        );

        console.log('[TursoDBService] ✅ notifications table ready');

      } catch (e) {

        console.error('[TursoDBService] notifications setup failed:', e);

      }



      // ----- email_otps (signup + sensitive-action OTP) -----

      // We store ONLY the SHA-256 hash of the OTP, never the plaintext.

      // `purpose` separates signup OTPs from password-reset / withdrawal

      // OTPs so a code minted for one flow can't be replayed against

      // another. `attempts` is the wrong-code counter; we lock the row

      // after 5 wrong tries by setting `used_at`.

      try {

        await this._executeHttp(`

          CREATE TABLE IF NOT EXISTS email_otps (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            email TEXT NOT NULL,

            purpose TEXT NOT NULL DEFAULT 'signup',

            code_hash TEXT NOT NULL,

            attempts INTEGER DEFAULT 0,

            expires_at DATETIME NOT NULL,

            used_at DATETIME,

            created_at DATETIME DEFAULT CURRENT_TIMESTAMP

          )

        `);

        await this._executeHttp(

          'CREATE INDEX IF NOT EXISTS idx_otp_email_purpose ON email_otps(email, purpose, created_at DESC)'

        );

        console.log('[TursoDBService] ✅ email_otps table ready');

      } catch (e) {

        console.error('[TursoDBService] email_otps setup failed:', e);

      }



      // ----- face_verifications (re-verification audit) -----

      // One row per face-comparison attempt. Stores the URLs of both

      // images (reference + fresh capture) plus Gemini's verdict so

      // an admin reviewing a flagged action can see exactly what the

      // system saw. `trigger` records WHY we asked (large withdrawal,

      // password change, anomaly review, etc.).

      try {

        await this._executeHttp(`

          CREATE TABLE IF NOT EXISTS face_verifications (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            user_id INTEGER NOT NULL,

            trigger TEXT NOT NULL,

            reference_url TEXT,

            capture_url TEXT,

            match INTEGER,

            confidence REAL,

            reasoning TEXT,

            transaction_id TEXT,

            engine_used TEXT DEFAULT 'gemini',

            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (user_id) REFERENCES users(id)

          )

        `);

        await this._executeHttp(

          'CREATE INDEX IF NOT EXISTS idx_fv_user_created ON face_verifications(user_id, created_at DESC)'

        );

        console.log('[TursoDBService] ✅ face_verifications table ready');

      } catch (e) {

        console.error('[TursoDBService] face_verifications setup failed:', e);

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

   * Checks if an email is already registered.

   *

   * Mirrors checkPhoneDuplicate(). We lower-case the email both at

   * write-time (saveUser) and here so casing never causes false

   * negatives. Returns false if the `email` column doesn't exist yet

   * (very old deployment) — the migration adds it but we keep this

   * defensive so signup doesn't break before migration runs.

   *

   * @param {string} email

   * @returns {Promise<boolean>}

   */

  async checkEmailDuplicate(email) {

    try {

      if (!this.connected) {

        throw new Error('Database not connected. Call connect() first.');

      }

      const normalized = String(email || '').trim().toLowerCase();

      if (!normalized) return false;



      const result = await this._executeHttp(

        'SELECT COUNT(*) as count FROM users WHERE email = ?',

        [normalized]

      );

      const executeResult = result.results[0].response.result;

      if (!executeResult.rows || executeResult.rows.length === 0) return false;

      const cell = executeResult.rows[0][0];

      const count = typeof cell === 'object' ? parseInt(cell.value) : cell;

      const exists = count > 0;

      console.log(`[TursoDBService] Email duplicate check: ${normalized} - ${exists ? 'EXISTS' : 'NOT FOUND'}`);

      return exists;

    } catch (error) {

      console.error('[TursoDBService] Email duplicate check failed:', error);

      // Missing column on old DB — treat as "no duplicates" so the

      // signup flow can proceed; the migration will add the column on

      // next reconnect.

      if (/no such column|no such table/i.test(error.message)) {

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

      

      // Build the column list dynamically so optional fields (face

      // reference URL, email captured at signup) only get included

      // when they're actually present. This avoids polluting the

      // INSERT with nulls AND keeps the statement compatible with

      // older databases where these columns may not exist yet (the

      // migration above adds them, but on very old deployments the

      // user may have hit this code path before the migration ran).

      const columns = [

        'phone_number', 'id_type', 'id_number', 'first_name', 'middle_name', 'last_name',

        'dob', 'gender', 'virtual_account_number', 'bank_code',

        'current_address_state', 'current_address_lga', 'current_address_area',

        'current_address_text', 'current_address_landmark',

        'permanent_address_state', 'permanent_address_lga', 'permanent_address_area',

        'permanent_address_text', 'hashed_pin'

      ];

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



      if (userData.faceReferenceUrl) {

        columns.push('face_reference_url');

        args.push(userData.faceReferenceUrl);

        columns.push('face_reference_uploaded_at');

        args.push(userData.faceReferenceUploadedAt || new Date().toISOString());

      }

      if (userData.email) {

        columns.push('email');

        args.push(String(userData.email).trim().toLowerCase());

        // email_verified is flipped to 1 only by the OTP verification

        // step (Phase D). Storing the email here without verifying it

        // just records what the user typed.

        columns.push('email_verified');

        args.push(userData.emailVerified ? 1 : 0);

      }


      // Hackathon demo: credit a random balance (₦150,000–₦500,000)
      // so judges can test escrow funding, withdrawals, etc. without
      // needing real bank deposits.
      const demoBalance = Math.floor(Math.random() * 350001) + 150000;
      columns.push('demo_balance');
      args.push(demoBalance);


      const placeholders = columns.map(() => '?').join(', ');

      const sql = `INSERT INTO users (${columns.join(', ')}) VALUES (${placeholders})`;

      

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

          state TEXT NOT NULL CHECK(state IN ('Created', 'Funded_Locked', 'In_Transit', 'Disputed', 'Completed', 'Cancelled', 'Refunded')),

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

      const createIsolationForestLogsTableSql = `

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

      

      await this._executeHttp(createIsolationForestLogsTableSql);

      console.log('[TursoDBService] ✅ Isolation Forest ML logs table (ai_risk_logs) created');

      

      // Create indexes for ai_risk_logs table

      const isolationForestLogIndexes = [

        'CREATE INDEX IF NOT EXISTS idx_risk_log_transaction_id ON ai_risk_logs(transaction_id)',

        'CREATE INDEX IF NOT EXISTS idx_risk_log_user_id ON ai_risk_logs(user_id)',

        'CREATE INDEX IF NOT EXISTS idx_risk_log_created_at ON ai_risk_logs(created_at)'

      ];

      

      for (const indexSql of isolationForestLogIndexes) {

        try {

          await this._executeHttp(indexSql);

        } catch (e) {

          console.log('[TursoDBService] Index already exists:', e.message);

        }

      }

      console.log('[TursoDBService] ✅ AI risk log indexes created');

      
      // Create withdrawal_history table (Squad Transfer API payouts)
      const createWithdrawalHistoryTableSql = `
        CREATE TABLE IF NOT EXISTS withdrawal_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          amount REAL NOT NULL CHECK(amount >= 100),
          bank_name TEXT NOT NULL,
          bank_code TEXT NOT NULL,
          account_number TEXT NOT NULL,
          account_name TEXT NOT NULL,
          transaction_reference TEXT UNIQUE NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'success', 'failed', 'reversed')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `;
      
      await this._executeHttp(createWithdrawalHistoryTableSql);
      console.log('[TursoDBService] ✅ Withdrawal history table created');
      
      const withdrawalIndexes = [
        'CREATE INDEX IF NOT EXISTS idx_withdrawal_user_id ON withdrawal_history(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_withdrawal_reference ON withdrawal_history(transaction_reference)',
        'CREATE INDEX IF NOT EXISTS idx_withdrawal_created_at ON withdrawal_history(created_at)'
      ];
      
      for (const indexSql of withdrawalIndexes) {
        try {
          await this._executeHttp(indexSql);
        } catch (e) {
          console.log('[TursoDBService] Index already exists:', e.message);
        }
      }
      console.log('[TursoDBService] ✅ Withdrawal history indexes created');
      

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

