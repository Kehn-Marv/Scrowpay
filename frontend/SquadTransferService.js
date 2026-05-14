/**
 * SquadTransferService - Squad Transfer/Payout API integration for ScrowPay
 * 
 * This service handles outbound transfers (withdrawals) from the platform's
 * Squad Merchant Ledger to any Nigerian bank account via NIP.
 * 
 * Endpoints used:
 *   POST /payout/account/lookup   – Verify destination account name
 *   POST /payout/transfer          – Initiate fund transfer
 *   POST /payout/requery           – Re-query transfer status
 *   GET  /merchant/balance          – Get Squad Ledger balance
 *   GET  /payout/list               – List all transfers
 */

class SquadTransferService {
  /**
   * @param {string} secretKey   - Squad API secret key (Bearer token)
   * @param {string} merchantId  - Squad Merchant ID (prepended to transaction refs)
   * @param {string} environment - 'sandbox' or 'production'
   */
  constructor(secretKey, merchantId, environment = 'sandbox') {
    this.secretKey = secretKey;
    this.merchantId = merchantId;
    this.environment = environment;
    this.baseUrl = environment === 'production'
      ? 'https://api-d.squadco.com'
      : 'https://sandbox-api-d.squadco.com';
  }

  // -------------------------------------------------------------------
  // Bank-code map (NIP codes for the banks in the withdraw dropdown)
  // -------------------------------------------------------------------
  static BANK_CODES = {
    'Access Bank':        '000014',
    'Citibank':           '000009',
    'Ecobank':            '000010',
    'Fidelity Bank':      '000007',
    'First Bank':         '000016',
    'FCMB':               '000003',
    'GTBank':             '000013',
    'Heritage Bank':      '000020',
    'Keystone Bank':      '000002',
    'Kuda':               '090267',
    'Opay':               '100004',
    'Palmpay':            '100033',
    'Polaris Bank':       '000008',
    'Stanbic IBTC':       '000012',
    'Standard Chartered': '000021',
    'Sterling Bank':      '000001',
    'Union Bank':         '000018',
    'UBA':                '000004',
    'Unity Bank':         '000011',
    'Wema Bank':          '000017',
    'Zenith Bank':        '000015'
  };

  /**
   * Resolves a bank name (as shown in the UI select) to its NIP bank code.
   * @param {string} bankName
   * @returns {string|null}
   */
  static getBankCode(bankName) {
    return SquadTransferService.BANK_CODES[bankName] || null;
  }

  // -------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------

  /** Standard headers for all Squad API calls */
  _headers() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.secretKey}`
    };
  }

  /**
   * Generates a unique transaction reference prefixed with the merchant ID.
   * Squad *requires* that the merchant ID is prepended.
   * Format: {MERCHANT_ID}_{timestamp}_{random}
   * @returns {string}
   */
  generateTransactionRef() {
    const ts = Date.now();
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${this.merchantId}_${ts}_${rand}`;
  }

  // -------------------------------------------------------------------
  // 1. Account Lookup
  // -------------------------------------------------------------------

  /**
   * Verifies the destination account name before initiating a transfer.
   *
   * @param {string} bankCode      - 6-digit NIP bank code
   * @param {string} accountNumber - 10-digit NUBAN
   * @returns {Promise<Object>} { success, data: { account_name, account_number }, message? }
   */
  async lookupAccount(bankCode, accountNumber) {
    try {
      console.log('[SquadTransfer] Looking up account:', { bankCode, accountNumber });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${this.baseUrl}/payout/account/lookup`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({ bank_code: bankCode, account_number: accountNumber }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await response.json();
      console.log('[SquadTransfer] Lookup response:', data);

      if (response.ok && data.success) {
        return {
          success: true,
          data: {
            account_name: data.data.account_name,
            account_number: data.data.account_number
          }
        };
      }

      return {
        success: false,
        message: data.message || 'Account lookup failed'
      };

    } catch (error) {
      console.error('[SquadTransfer] Lookup error:', error);
      if (error.name === 'AbortError') {
        return { success: false, message: 'Account lookup timed out. Please try again.' };
      }
      return { success: false, message: 'Unable to verify account. Check your connection.' };
    }
  }

  // -------------------------------------------------------------------
  // 2. Fund Transfer
  // -------------------------------------------------------------------

  /**
   * Transfers funds from the Squad Merchant Ledger to an external bank account.
   * Amount is in **Naira** — this method converts to kobo internally.
   *
   * @param {Object} params
   * @param {number} params.amount          - Amount in Naira (e.g. 5000)
   * @param {string} params.bankCode        - NIP bank code
   * @param {string} params.accountNumber   - 10-digit NUBAN
   * @param {string} params.accountName     - Verified account name from lookup
   * @param {string} [params.remark]        - Transfer remark / narration
   * @param {string} [params.transactionRef]- Custom ref (auto-generated if omitted)
   * @returns {Promise<Object>}
   */
  async initiateTransfer({ amount, bankCode, accountNumber, accountName, remark, transactionRef }) {
    try {
      const ref = transactionRef || this.generateTransactionRef();
      const amountInKobo = String(Math.round(amount * 100));

      const payload = {
        transaction_reference: ref,
        amount: amountInKobo,
        bank_code: bankCode,
        account_number: accountNumber,
        account_name: accountName,
        currency_id: 'NGN',
        remark: remark || `ScrowPay withdrawal ${ref}`
      };

      console.log('[SquadTransfer] Initiating transfer:', payload);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      const response = await fetch(`${this.baseUrl}/payout/transfer`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await response.json();
      console.log('[SquadTransfer] Transfer response:', data);

      if (response.ok && data.success) {
        // Best practice: also check for nip_transaction_reference
        const hasNipRef = !!data.data?.nip_transaction_reference;
        return {
          success: true,
          data: data.data,
          transactionRef: ref,
          confirmed: hasNipRef
        };
      }

      return {
        success: false,
        message: data.message || 'Transfer failed',
        transactionRef: ref
      };

    } catch (error) {
      console.error('[SquadTransfer] Transfer error:', error);
      if (error.name === 'AbortError') {
        return { success: false, message: 'Transfer request timed out. Please re-query the status.', transactionRef: transactionRef || null };
      }
      return { success: false, message: 'Transfer request failed. Check your connection.' };
    }
  }

  // -------------------------------------------------------------------
  // 3. Re-query Transfer
  // -------------------------------------------------------------------

  /**
   * Re-queries the status of a previously initiated transfer.
   *
   * @param {string} transactionRef - The transaction_reference used to initiate
   * @returns {Promise<Object>}
   */
  async requeryTransfer(transactionRef) {
    try {
      console.log('[SquadTransfer] Re-querying transfer:', transactionRef);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${this.baseUrl}/payout/requery`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({ transaction_reference: transactionRef }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await response.json();
      console.log('[SquadTransfer] Requery response:', data);

      if (response.ok && data.success !== false) {
        return { success: true, data: data.data || data };
      }

      return { success: false, message: data.message || 'Transfer not found' };

    } catch (error) {
      console.error('[SquadTransfer] Requery error:', error);
      return { success: false, message: 'Unable to check transfer status.' };
    }
  }

  // -------------------------------------------------------------------
  // 4. Ledger Balance
  // -------------------------------------------------------------------

  /**
   * Gets the current Squad Merchant Ledger balance.
   * Squad returns the balance in **kobo** — this method converts to Naira.
   *
   * @returns {Promise<Object>} { success, balance (Naira), raw (kobo), message? }
   */
  async getLedgerBalance() {
    try {
      console.log('[SquadTransfer] Fetching ledger balance...');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(`${this.baseUrl}/merchant/balance?currency_id=NGN`, {
        method: 'GET',
        headers: this._headers(),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await response.json();
      console.log('[SquadTransfer] Ledger balance response:', data);

      if (response.ok && data.success) {
        const balanceKobo = parseInt(data.data.balance, 10) || 0;
        return {
          success: true,
          balance: balanceKobo / 100,
          raw: balanceKobo,
          merchantId: data.data.merchant_id
        };
      }

      return { success: false, balance: 0, message: data.message || 'Failed to fetch ledger balance' };

    } catch (error) {
      console.error('[SquadTransfer] Ledger balance error:', error);
      return { success: false, balance: 0, message: 'Unable to fetch ledger balance.' };
    }
  }

  // -------------------------------------------------------------------
  // 5. Get All Transfers (optional utility)
  // -------------------------------------------------------------------

  /**
   * Lists all transfers from the Squad Wallet.
   *
   * @param {number} [page=1]
   * @param {number} [perPage=20]
   * @param {string} [dir='DESC']
   * @returns {Promise<Object>}
   */
  async getAllTransfers(page = 1, perPage = 20, dir = 'DESC') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(`${this.baseUrl}/payout/list`, {
        method: 'GET',
        headers: this._headers(),
        body: JSON.stringify({ page, perPage, dir }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await response.json();
      if (response.ok && data.success) {
        return { success: true, data: data.data };
      }
      return { success: false, message: data.message || 'Failed to fetch transfers' };

    } catch (error) {
      console.error('[SquadTransfer] Get transfers error:', error);
      return { success: false, message: 'Unable to fetch transfer history.' };
    }
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.SquadTransferService = SquadTransferService;
}
