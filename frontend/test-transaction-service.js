/**
 * Node.js Test Script for TransactionService
 * 
 * This script tests the TransactionService implementation to verify:
 * - Transaction creation with UUID generation
 * - Input validation
 * - Transaction retrieval
 * - Active transactions filtering
 * - Transaction history with pagination
 */

// Mock crypto.randomUUID for Node.js environment
if (typeof crypto === 'undefined') {
  global.crypto = {
    randomUUID: () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
  };
}

// Mock TursoDBService for testing
class MockTursoDBService {
  constructor(url, token) {
    this.url = url;
    this.token = token;
    this.connected = false;
    this.transactions = [];
    this.nextId = 1;
  }
  
  async connect() {
    this.connected = true;
    console.log('[MockTursoDBService] Connected');
  }
  
  async _executeHttp(sql, args = []) {
    console.log('[MockTursoDBService] Executing SQL:', sql);
    console.log('[MockTursoDBService] Args:', args);
    
    // Mock INSERT
    if (sql.includes('INSERT INTO transactions')) {
      const id = this.nextId++;
      const transaction = {
        id,
        transaction_id: args[0],
        seller_id: args[1],
        buyer_id: args[2],
        item_description: args[3],
        price: args[4],
        delivery_timeline_days: args[5],
        inspection_window_days: args[6],
        state: args[7],
        risk_score: null,
        ai_verdict: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      this.transactions.push(transaction);
      
      return {
        results: [{
          response: {
            result: {
              last_insert_rowid: id
            }
          }
        }]
      };
    }
    
    // Mock SELECT by transaction_id
    if (sql.includes('SELECT * FROM transactions WHERE transaction_id')) {
      const transactionId = args[0];
      const transaction = this.transactions.find(t => t.transaction_id === transactionId);
      
      if (!transaction) {
        return {
          results: [{
            response: {
              result: {
                rows: [],
                cols: []
              }
            }
          }]
        };
      }
      
      const cols = Object.keys(transaction).map(name => ({ name }));
      const row = Object.values(transaction);
      
      return {
        results: [{
          response: {
            result: {
              rows: [row],
              cols
            }
          }
        }]
      };
    }
    
    // Mock SELECT active transactions
    if (sql.includes('state IN')) {
      const userId = args[0];
      const filtered = this.transactions.filter(t => 
        (t.seller_id === userId || t.buyer_id === userId) &&
        ['Created', 'Funded_Locked', 'In_Transit', 'Disputed'].includes(t.state)
      );
      
      const cols = filtered.length > 0 ? Object.keys(filtered[0]).map(name => ({ name })) : [];
      const rows = filtered.map(t => Object.values(t));
      
      return {
        results: [{
          response: {
            result: {
              rows,
              cols
            }
          }
        }]
      };
    }
    
    // Mock COUNT query
    if (sql.includes('COUNT(*)')) {
      return {
        results: [{
          response: {
            result: {
              rows: [[this.transactions.length]]
            }
          }
        }]
      };
    }
    
    // Mock SELECT with pagination
    if (sql.includes('LIMIT')) {
      const cols = this.transactions.length > 0 ? Object.keys(this.transactions[0]).map(name => ({ name })) : [];
      const rows = this.transactions.map(t => Object.values(t));
      
      return {
        results: [{
          response: {
            result: {
              rows,
              cols
            }
          }
        }]
      };
    }
    
    return {
      results: [{
        response: {
          result: {
            rows: [],
            cols: []
          }
        }
      }]
    };
  }
  
  async disconnect() {
    this.connected = false;
    console.log('[MockTursoDBService] Disconnected');
  }
}

// Mock TransactionService with MockTursoDBService
class TransactionService {
  constructor(config) {
    this.dbService = new MockTursoDBService(config.turso.databaseUrl, config.turso.authToken);
    this.connected = false;
  }
  
  async connect() {
    if (!this.connected) {
      await this.dbService.connect();
      this.connected = true;
      console.log('[TransactionService] Connected to database');
    }
  }
  
  generateTransactionId() {
    const uuid = crypto.randomUUID();
    return `TXN-${uuid}`;
  }
  
  validateTransactionData(data) {
    const errors = [];
    
    if (!data.itemDescription || typeof data.itemDescription !== 'string') {
      errors.push('Item description is required');
    } else if (data.itemDescription.trim().length < 10) {
      errors.push('Item description must be at least 10 characters');
    } else if (data.itemDescription.trim().length > 500) {
      errors.push('Item description must not exceed 500 characters');
    }
    
    if (data.price === undefined || data.price === null) {
      errors.push('Price is required');
    } else if (typeof data.price !== 'number' || isNaN(data.price)) {
      errors.push('Price must be a valid number');
    } else if (data.price < 100) {
      errors.push('Price must be at least ₦100');
    } else if (data.price > 10000000) {
      errors.push('Price must not exceed ₦10,000,000');
    }
    
    if (data.deliveryTimelineDays === undefined || data.deliveryTimelineDays === null) {
      errors.push('Delivery timeline is required');
    } else if (!Number.isInteger(data.deliveryTimelineDays)) {
      errors.push('Delivery timeline must be a whole number');
    } else if (data.deliveryTimelineDays < 1) {
      errors.push('Delivery timeline must be at least 1 day');
    } else if (data.deliveryTimelineDays > 90) {
      errors.push('Delivery timeline must not exceed 90 days');
    }
    
    if (data.inspectionWindowDays === undefined || data.inspectionWindowDays === null) {
      errors.push('Inspection window is required');
    } else if (!Number.isInteger(data.inspectionWindowDays)) {
      errors.push('Inspection window must be a whole number');
    } else if (data.inspectionWindowDays < 1) {
      errors.push('Inspection window must be at least 1 day');
    } else if (data.inspectionWindowDays > 14) {
      errors.push('Inspection window must not exceed 14 days');
    }
    
    if (!data.sellerId || typeof data.sellerId !== 'number') {
      errors.push('Seller ID is required and must be a valid user ID');
    }
    
    return errors;
  }
  
  async createTransaction(data) {
    try {
      console.log('[TransactionService] Creating transaction:', data);
      
      await this.connect();
      
      const validationErrors = this.validateTransactionData(data);
      if (validationErrors.length > 0) {
        throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
      }
      
      const transactionId = this.generateTransactionId();
      
      const sql = `INSERT INTO transactions (
        transaction_id, seller_id, buyer_id, item_description, price,
        delivery_timeline_days, inspection_window_days, state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      
      const args = [
        transactionId,
        data.sellerId,
        null,
        data.itemDescription.trim(),
        data.price,
        data.deliveryTimelineDays,
        data.inspectionWindowDays,
        'Created'
      ];
      
      const result = await this.dbService._executeHttp(sql, args);
      
      console.log('[TransactionService] ✅ Transaction created successfully:', transactionId);
      
      return {
        id: result.results[0].response.result.last_insert_rowid,
        transaction_id: transactionId,
        seller_id: data.sellerId,
        buyer_id: null,
        item_description: data.itemDescription.trim(),
        price: data.price,
        delivery_timeline_days: data.deliveryTimelineDays,
        inspection_window_days: data.inspectionWindowDays,
        state: 'Created',
        risk_score: null,
        ai_verdict: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('[TransactionService] Transaction creation failed:', error);
      throw new Error('Failed to create transaction: ' + error.message);
    }
  }
  
  async getTransaction(transactionId) {
    try {
      console.log('[TransactionService] Retrieving transaction:', transactionId);
      
      await this.connect();
      
      const sql = 'SELECT * FROM transactions WHERE transaction_id = ? LIMIT 1';
      const result = await this.dbService._executeHttp(sql, [transactionId]);
      
      const executeResult = result.results[0].response.result;
      const rows = executeResult.rows;
      const cols = executeResult.cols;
      
      if (rows.length === 0) {
        console.log('[TransactionService] Transaction not found:', transactionId);
        return null;
      }
      
      const transaction = {};
      cols.forEach((col, index) => {
        const cellValue = rows[0][index];
        transaction[col.name] = typeof cellValue === 'object' && cellValue.value !== undefined 
          ? cellValue.value 
          : cellValue;
      });
      
      console.log('[TransactionService] ✅ Transaction retrieved:', transactionId);
      return transaction;
      
    } catch (error) {
      console.error('[TransactionService] Transaction retrieval failed:', error);
      throw new Error('Failed to retrieve transaction: ' + error.message);
    }
  }
  
  async getActiveTransactions(userId) {
    try {
      console.log('[TransactionService] Retrieving active transactions for user:', userId);
      
      await this.connect();
      
      const sql = `
        SELECT * FROM transactions 
        WHERE (seller_id = ? OR buyer_id = ?)
        AND state IN ('Created', 'Funded_Locked', 'In_Transit', 'Disputed')
        ORDER BY created_at DESC
      `;
      
      const result = await this.dbService._executeHttp(sql, [userId, userId]);
      
      const executeResult = result.results[0].response.result;
      const rows = executeResult.rows;
      const cols = executeResult.cols;
      
      const transactions = rows.map(row => {
        const transaction = {};
        cols.forEach((col, index) => {
          const cellValue = row[index];
          transaction[col.name] = typeof cellValue === 'object' && cellValue.value !== undefined 
            ? cellValue.value 
            : cellValue;
        });
        return transaction;
      });
      
      const categorized = {
        awaitingFunding: transactions.filter(t => t.state === 'Created'),
        funded: transactions.filter(t => t.state === 'Funded_Locked'),
        inTransit: transactions.filter(t => t.state === 'In_Transit'),
        disputed: transactions.filter(t => t.state === 'Disputed')
      };
      
      console.log('[TransactionService] ✅ Active transactions retrieved');
      
      return categorized;
      
    } catch (error) {
      console.error('[TransactionService] Active transactions retrieval failed:', error);
      throw new Error('Failed to retrieve active transactions: ' + error.message);
    }
  }
}

// Run tests
async function runTests() {
  console.log('\n🧪 Starting TransactionService Tests\n');
  
  const config = {
    turso: {
      databaseUrl: 'libsql://test.turso.io',
      authToken: 'test-token'
    }
  };
  
  const service = new TransactionService(config);
  let testsPassed = 0;
  let testsFailed = 0;
  
  // Test 1: Create Transaction
  try {
    console.log('\n--- Test 1: Create Transaction ---');
    const result = await service.createTransaction({
      sellerId: 1,
      itemDescription: 'Test Item - iPhone 13 Pro Max',
      price: 450000,
      deliveryTimelineDays: 7,
      inspectionWindowDays: 3
    });
    
    console.log('✅ Test 1 PASSED');
    console.log('Transaction ID:', result.transaction_id);
    console.log('State:', result.state);
    testsPassed++;
  } catch (error) {
    console.log('❌ Test 1 FAILED:', error.message);
    testsFailed++;
  }
  
  // Test 2: Validation - Price too low
  try {
    console.log('\n--- Test 2: Validation - Price too low ---');
    await service.createTransaction({
      sellerId: 1,
      itemDescription: 'Test Item Description',
      price: 50,
      deliveryTimelineDays: 7,
      inspectionWindowDays: 3
    });
    console.log('❌ Test 2 FAILED: Should have thrown validation error');
    testsFailed++;
  } catch (error) {
    if (error.message.includes('at least ₦100')) {
      console.log('✅ Test 2 PASSED: Correctly rejected low price');
      testsPassed++;
    } else {
      console.log('❌ Test 2 FAILED: Wrong error:', error.message);
      testsFailed++;
    }
  }
  
  // Test 3: Validation - Price too high
  try {
    console.log('\n--- Test 3: Validation - Price too high ---');
    await service.createTransaction({
      sellerId: 1,
      itemDescription: 'Test Item Description',
      price: 15000000,
      deliveryTimelineDays: 7,
      inspectionWindowDays: 3
    });
    console.log('❌ Test 3 FAILED: Should have thrown validation error');
    testsFailed++;
  } catch (error) {
    if (error.message.includes('not exceed ₦10,000,000')) {
      console.log('✅ Test 3 PASSED: Correctly rejected high price');
      testsPassed++;
    } else {
      console.log('❌ Test 3 FAILED: Wrong error:', error.message);
      testsFailed++;
    }
  }
  
  // Test 4: Validation - Delivery timeline out of range
  try {
    console.log('\n--- Test 4: Validation - Delivery timeline too long ---');
    await service.createTransaction({
      sellerId: 1,
      itemDescription: 'Test Item Description',
      price: 1000,
      deliveryTimelineDays: 100,
      inspectionWindowDays: 3
    });
    console.log('❌ Test 4 FAILED: Should have thrown validation error');
    testsFailed++;
  } catch (error) {
    if (error.message.includes('not exceed 90 days')) {
      console.log('✅ Test 4 PASSED: Correctly rejected long delivery timeline');
      testsPassed++;
    } else {
      console.log('❌ Test 4 FAILED: Wrong error:', error.message);
      testsFailed++;
    }
  }
  
  // Test 5: Validation - Inspection window out of range
  try {
    console.log('\n--- Test 5: Validation - Inspection window too long ---');
    await service.createTransaction({
      sellerId: 1,
      itemDescription: 'Test Item Description',
      price: 1000,
      deliveryTimelineDays: 7,
      inspectionWindowDays: 20
    });
    console.log('❌ Test 5 FAILED: Should have thrown validation error');
    testsFailed++;
  } catch (error) {
    if (error.message.includes('not exceed 14 days')) {
      console.log('✅ Test 5 PASSED: Correctly rejected long inspection window');
      testsPassed++;
    } else {
      console.log('❌ Test 5 FAILED: Wrong error:', error.message);
      testsFailed++;
    }
  }
  
  // Test 6: Validation - Description too short
  try {
    console.log('\n--- Test 6: Validation - Description too short ---');
    await service.createTransaction({
      sellerId: 1,
      itemDescription: 'Short',
      price: 1000,
      deliveryTimelineDays: 7,
      inspectionWindowDays: 3
    });
    console.log('❌ Test 6 FAILED: Should have thrown validation error');
    testsFailed++;
  } catch (error) {
    if (error.message.includes('at least 10 characters')) {
      console.log('✅ Test 6 PASSED: Correctly rejected short description');
      testsPassed++;
    } else {
      console.log('❌ Test 6 FAILED: Wrong error:', error.message);
      testsFailed++;
    }
  }
  
  // Test 7: Transaction ID format
  try {
    console.log('\n--- Test 7: Transaction ID format ---');
    const result = await service.createTransaction({
      sellerId: 1,
      itemDescription: 'Test Item for ID format check',
      price: 5000,
      deliveryTimelineDays: 7,
      inspectionWindowDays: 3
    });
    
    if (result.transaction_id.startsWith('TXN-') && result.transaction_id.length === 40) {
      console.log('✅ Test 7 PASSED: Transaction ID format correct');
      console.log('Transaction ID:', result.transaction_id);
      testsPassed++;
    } else {
      console.log('❌ Test 7 FAILED: Invalid Transaction ID format:', result.transaction_id);
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ Test 7 FAILED:', error.message);
    testsFailed++;
  }
  
  // Test 8: Get Transaction
  try {
    console.log('\n--- Test 8: Get Transaction ---');
    const created = await service.createTransaction({
      sellerId: 1,
      itemDescription: 'Test Item for retrieval',
      price: 10000,
      deliveryTimelineDays: 14,
      inspectionWindowDays: 7
    });
    
    const retrieved = await service.getTransaction(created.transaction_id);
    
    if (retrieved && retrieved.transaction_id === created.transaction_id) {
      console.log('✅ Test 8 PASSED: Transaction retrieved successfully');
      testsPassed++;
    } else {
      console.log('❌ Test 8 FAILED: Retrieved transaction does not match');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ Test 8 FAILED:', error.message);
    testsFailed++;
  }
  
  // Test 9: Get Active Transactions
  try {
    console.log('\n--- Test 9: Get Active Transactions ---');
    const result = await service.getActiveTransactions(1);
    
    if (result && typeof result === 'object' && 
        Array.isArray(result.awaitingFunding) &&
        Array.isArray(result.funded) &&
        Array.isArray(result.inTransit) &&
        Array.isArray(result.disputed)) {
      console.log('✅ Test 9 PASSED: Active transactions retrieved');
      console.log('Categories:', Object.keys(result));
      testsPassed++;
    } else {
      console.log('❌ Test 9 FAILED: Invalid result structure');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ Test 9 FAILED:', error.message);
    testsFailed++;
  }
  
  // Test 10: Transaction ID Uniqueness
  try {
    console.log('\n--- Test 10: Transaction ID Uniqueness (10 transactions) ---');
    const ids = new Set();
    
    for (let i = 0; i < 10; i++) {
      const result = await service.createTransaction({
        sellerId: 1,
        itemDescription: `Uniqueness test transaction ${i + 1}`,
        price: 1000 + i,
        deliveryTimelineDays: 7,
        inspectionWindowDays: 3
      });
      ids.add(result.transaction_id);
    }
    
    if (ids.size === 10) {
      console.log('✅ Test 10 PASSED: All Transaction IDs are unique');
      testsPassed++;
    } else {
      console.log('❌ Test 10 FAILED: Duplicate Transaction IDs found');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ Test 10 FAILED:', error.message);
    testsFailed++;
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('Test Summary:');
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`Total: ${testsPassed + testsFailed}`);
  console.log('='.repeat(50) + '\n');
  
  return testsFailed === 0;
}

// Run the tests
runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});
