/**
 * Unit Tests for TransactionService Rate Limiting
 * 
 * Tests the rate limiting functionality for transaction creation:
 * - Limit of 10 transactions per hour per user
 * - Clear error messages when limit exceeded
 * - Security event logging for rate limit violations
 * 
 * Requirements: 19.6
 */

// Load dependencies for Node.js environment
if (typeof window === 'undefined') {
  // Node.js environment - load the service
  const fs = require('fs');
  const path = require('path');
  
  // Load TransactionService
  const transactionServiceCode = fs.readFileSync(
    path.join(__dirname, 'transaction-service.js'),
    'utf8'
  );
  eval(transactionServiceCode);
}

// Mock TursoDBService for testing
class MockTursoDBService {
  constructor() {
    this.transactions = [];
    this.securityLogs = [];
    this.connected = false;
  }
  
  async connect() {
    this.connected = true;
  }
  
  async disconnect() {
    this.connected = false;
  }
  
  async _executeHttp(sql, args) {
    // Mock transaction count query
    if (sql.includes('COUNT(*)') && sql.includes('created_at >=')) {
      const userId = args[0];
      const oneHourAgo = new Date(args[1]);
      
      const recentTransactions = this.transactions.filter(t => 
        t.seller_id === userId && new Date(t.created_at) >= oneHourAgo
      );
      
      return {
        results: [{
          response: {
            result: {
              rows: [[recentTransactions.length]]
            }
          }
        }]
      };
    }
    
    // Mock transaction insert
    if (sql.includes('INSERT INTO transactions')) {
      const transaction = {
        id: this.transactions.length + 1,
        transaction_id: args[0],
        seller_id: args[1],
        buyer_id: args[2],
        item_description: args[3],
        price: args[4],
        delivery_timeline_days: args[5],
        inspection_window_days: args[6],
        state: args[7],
        created_at: new Date().toISOString()
      };
      
      this.transactions.push(transaction);
      
      return {
        results: [{
          response: {
            result: {
              last_insert_rowid: transaction.id
            }
          }
        }]
      };
    }
    
    // Mock security log insert
    if (sql.includes('INSERT INTO security_logs')) {
      const log = {
        id: this.securityLogs.length + 1,
        event_type: args[0],
        user_id: args[1],
        transaction_id: args[2],
        details: args[3],
        ip_address: args[4],
        user_agent: args[5],
        created_at: new Date().toISOString()
      };
      
      this.securityLogs.push(log);
      
      return {
        results: [{
          response: {
            result: {
              last_insert_rowid: log.id
            }
          }
        }]
      };
    }
    
    throw new Error('Unexpected SQL query: ' + sql);
  }
  
  reset() {
    this.transactions = [];
    this.securityLogs = [];
  }
}

// Test suite
async function runTests() {
  console.log('🧪 Starting TransactionService Rate Limiting Tests\n');
  
  let passedTests = 0;
  let failedTests = 0;
  
  // Test 1: Allow transactions within rate limit
  try {
    console.log('Test 1: Allow transactions within rate limit (9 transactions)');
    
    const mockDb = new MockTursoDBService();
    const service = new TransactionService({
      turso: {
        databaseUrl: 'mock://test',
        authToken: 'mock-token'
      }
    });
    
    // Replace dbService with mock
    service.dbService = mockDb;
    service.connected = true;
    
    // Create 9 transactions (should all succeed)
    for (let i = 0; i < 9; i++) {
      const transaction = await service.createTransaction({
        sellerId: 1,
        itemDescription: `Test item ${i + 1}`,
        price: 1000,
        deliveryTimelineDays: 7,
        inspectionWindowDays: 3
      });
      
      if (!transaction || !transaction.transaction_id) {
        throw new Error(`Transaction ${i + 1} creation failed`);
      }
    }
    
    console.log('✅ Test 1 PASSED: All 9 transactions created successfully\n');
    passedTests++;
    
  } catch (error) {
    console.error('❌ Test 1 FAILED:', error.message, '\n');
    failedTests++;
  }
  
  // Test 2: Block 11th transaction (rate limit exceeded)
  try {
    console.log('Test 2: Block 11th transaction (rate limit exceeded)');
    
    const mockDb = new MockTursoDBService();
    const service = new TransactionService({
      turso: {
        databaseUrl: 'mock://test',
        authToken: 'mock-token'
      }
    });
    
    // Replace dbService with mock
    service.dbService = mockDb;
    service.connected = true;
    
    // Create 10 transactions (should succeed)
    for (let i = 0; i < 10; i++) {
      await service.createTransaction({
        sellerId: 1,
        itemDescription: `Test item ${i + 1}`,
        price: 1000,
        deliveryTimelineDays: 7,
        inspectionWindowDays: 3
      });
    }
    
    // Try to create 11th transaction (should fail)
    let rateLimitErrorThrown = false;
    try {
      await service.createTransaction({
        sellerId: 1,
        itemDescription: 'Test item 11',
        price: 1000,
        deliveryTimelineDays: 7,
        inspectionWindowDays: 3
      });
    } catch (error) {
      if (error.message.includes('Rate limit exceeded')) {
        rateLimitErrorThrown = true;
      } else {
        throw error;
      }
    }
    
    if (!rateLimitErrorThrown) {
      throw new Error('Expected rate limit error was not thrown');
    }
    
    // Verify only 10 transactions were created
    if (mockDb.transactions.length !== 10) {
      throw new Error(`Expected 10 transactions, got ${mockDb.transactions.length}`);
    }
    
    console.log('✅ Test 2 PASSED: 11th transaction blocked with rate limit error\n');
    passedTests++;
    
  } catch (error) {
    console.error('❌ Test 2 FAILED:', error.message, '\n');
    failedTests++;
  }
  
  // Test 3: Verify error message contains clear information
  try {
    console.log('Test 3: Verify error message contains clear information');
    
    const mockDb = new MockTursoDBService();
    const service = new TransactionService({
      turso: {
        databaseUrl: 'mock://test',
        authToken: 'mock-token'
      }
    });
    
    // Replace dbService with mock
    service.dbService = mockDb;
    service.connected = true;
    
    // Create 10 transactions
    for (let i = 0; i < 10; i++) {
      await service.createTransaction({
        sellerId: 1,
        itemDescription: `Test item ${i + 1}`,
        price: 1000,
        deliveryTimelineDays: 7,
        inspectionWindowDays: 3
      });
    }
    
    // Try to create 11th transaction and capture error message
    let errorMessage = '';
    try {
      await service.createTransaction({
        sellerId: 1,
        itemDescription: 'Test item 11',
        price: 1000,
        deliveryTimelineDays: 7,
        inspectionWindowDays: 3
      });
    } catch (error) {
      errorMessage = error.message;
    }
    
    // Verify error message contains required information
    const requiredPhrases = [
      'Rate limit exceeded',
      '10 transactions',
      'last hour',
      'try again after'
    ];
    
    for (const phrase of requiredPhrases) {
      if (!errorMessage.toLowerCase().includes(phrase.toLowerCase())) {
        throw new Error(`Error message missing required phrase: "${phrase}". Got: "${errorMessage}"`);
      }
    }
    
    console.log('✅ Test 3 PASSED: Error message contains all required information\n');
    passedTests++;
    
  } catch (error) {
    console.error('❌ Test 3 FAILED:', error.message, '\n');
    failedTests++;
  }
  
  // Test 4: Verify security event logging
  try {
    console.log('Test 4: Verify security event logging for rate limit violations');
    
    const mockDb = new MockTursoDBService();
    const service = new TransactionService({
      turso: {
        databaseUrl: 'mock://test',
        authToken: 'mock-token'
      }
    });
    
    // Replace dbService with mock
    service.dbService = mockDb;
    service.connected = true;
    
    // Create 10 transactions
    for (let i = 0; i < 10; i++) {
      await service.createTransaction({
        sellerId: 1,
        itemDescription: `Test item ${i + 1}`,
        price: 1000,
        deliveryTimelineDays: 7,
        inspectionWindowDays: 3
      });
    }
    
    // Try to create 11th transaction (should log security event)
    try {
      await service.createTransaction({
        sellerId: 1,
        itemDescription: 'Test item 11',
        price: 1000,
        deliveryTimelineDays: 7,
        inspectionWindowDays: 3
      });
    } catch (error) {
      // Expected to fail
    }
    
    // Verify security log was created
    if (mockDb.securityLogs.length !== 1) {
      throw new Error(`Expected 1 security log, got ${mockDb.securityLogs.length}`);
    }
    
    const log = mockDb.securityLogs[0];
    
    if (log.event_type !== 'rate_limit_violation') {
      throw new Error(`Expected event_type 'rate_limit_violation', got '${log.event_type}'`);
    }
    
    if (log.user_id !== 1) {
      throw new Error(`Expected user_id 1, got ${log.user_id}`);
    }
    
    // Verify details contain count and limit
    const details = JSON.parse(log.details);
    if (details.count !== 10) {
      throw new Error(`Expected count 10 in details, got ${details.count}`);
    }
    
    if (details.limit !== 10) {
      throw new Error(`Expected limit 10 in details, got ${details.limit}`);
    }
    
    console.log('✅ Test 4 PASSED: Security event logged correctly\n');
    passedTests++;
    
  } catch (error) {
    console.error('❌ Test 4 FAILED:', error.message, '\n');
    failedTests++;
  }
  
  // Test 5: Different users have separate rate limits
  try {
    console.log('Test 5: Different users have separate rate limits');
    
    const mockDb = new MockTursoDBService();
    const service = new TransactionService({
      turso: {
        databaseUrl: 'mock://test',
        authToken: 'mock-token'
      }
    });
    
    // Replace dbService with mock
    service.dbService = mockDb;
    service.connected = true;
    
    // User 1 creates 10 transactions
    for (let i = 0; i < 10; i++) {
      await service.createTransaction({
        sellerId: 1,
        itemDescription: `User 1 item ${i + 1}`,
        price: 1000,
        deliveryTimelineDays: 7,
        inspectionWindowDays: 3
      });
    }
    
    // User 2 should still be able to create transactions
    const user2Transaction = await service.createTransaction({
      sellerId: 2,
      itemDescription: 'User 2 item 1',
      price: 1000,
      deliveryTimelineDays: 7,
      inspectionWindowDays: 3
    });
    
    if (!user2Transaction || !user2Transaction.transaction_id) {
      throw new Error('User 2 transaction creation failed');
    }
    
    // Verify total transactions
    if (mockDb.transactions.length !== 11) {
      throw new Error(`Expected 11 transactions, got ${mockDb.transactions.length}`);
    }
    
    console.log('✅ Test 5 PASSED: Different users have separate rate limits\n');
    passedTests++;
    
  } catch (error) {
    console.error('❌ Test 5 FAILED:', error.message, '\n');
    failedTests++;
  }
  
  // Test 6: Rate limit check returns correct information
  try {
    console.log('Test 6: Rate limit check returns correct information');
    
    const mockDb = new MockTursoDBService();
    const service = new TransactionService({
      turso: {
        databaseUrl: 'mock://test',
        authToken: 'mock-token'
      }
    });
    
    // Replace dbService with mock
    service.dbService = mockDb;
    service.connected = true;
    
    // Create 5 transactions
    for (let i = 0; i < 5; i++) {
      await service.createTransaction({
        sellerId: 1,
        itemDescription: `Test item ${i + 1}`,
        price: 1000,
        deliveryTimelineDays: 7,
        inspectionWindowDays: 3
      });
    }
    
    // Check rate limit
    const rateLimitCheck = await service.checkRateLimit(1);
    
    if (!rateLimitCheck.allowed) {
      throw new Error('Expected rate limit to be allowed');
    }
    
    if (rateLimitCheck.count !== 5) {
      throw new Error(`Expected count 5, got ${rateLimitCheck.count}`);
    }
    
    if (rateLimitCheck.limit !== 10) {
      throw new Error(`Expected limit 10, got ${rateLimitCheck.limit}`);
    }
    
    if (!(rateLimitCheck.resetTime instanceof Date)) {
      throw new Error('Expected resetTime to be a Date object');
    }
    
    console.log('✅ Test 6 PASSED: Rate limit check returns correct information\n');
    passedTests++;
    
  } catch (error) {
    console.error('❌ Test 6 FAILED:', error.message, '\n');
    failedTests++;
  }
  
  // Summary
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Test Results: ${passedTests} passed, ${failedTests} failed`);
  console.log('═══════════════════════════════════════════════════════\n');
  
  if (failedTests > 0) {
    throw new Error(`${failedTests} test(s) failed`);
  }
  
  console.log('✅ All rate limiting tests passed!\n');
}

// Run tests if executed directly
if (typeof window === 'undefined') {
  // Node.js environment
  runTests().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
} else {
  // Browser environment
  window.runRateLimitTests = runTests;
}
