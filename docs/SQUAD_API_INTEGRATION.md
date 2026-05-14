# Squad API Integration — Deep Dive

ScrowPay uses Squad as its **complete payment infrastructure**. This document details every API endpoint, how it maps to product features, and the implementation architecture.

---

## Overview

| Squad Product | Endpoints Used | ScrowPay Feature |
|---|---|---|
| Virtual Account API | 3 endpoints | User onboarding, KYC, funding |
| Transfer/Payout API | 4 endpoints | Escrow release, withdrawals, refunds |
| Merchant Balance API | 1 endpoint | Real-time dashboard balance |

**Total: 8 API endpoints across 3 product lines.**

---

## 1. Virtual Account API

### Purpose in ScrowPay

Every user who signs up gets a **real Nigerian bank account (NUBAN)** via Squad's Virtual Account API. This serves two critical functions:

1. **Identity verification (KYC)** — Squad validates the user's BVN against the NIBSS national registry (name, date of birth, gender, phone number). If any detail doesn't match, account creation is rejected. This gives ScrowPay bank-grade identity verification at zero additional cost.

2. **Escrow funding** — Users fund escrow transactions by transferring Naira to the holding virtual account via standard bank transfer.

### Endpoints

#### `POST /virtual-account` — Create Virtual Account

Creates a NUBAN for a new user. Squad validates BVN against NIBSS before creating the account.

**Request payload:**
```json
{
  "customer_identifier": "+2348135866028",
  "first_name": "John",
  "last_name": "Doe",
  "middle_name": "",
  "mobile_num": "08135866028",
  "email": "john@example.com",
  "bvn": "12345678901",
  "dob": "07/19/1990",
  "gender": "1",
  "address": "123 Main St, Lagos"
}
```

**Success response:**
```json
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "virtual_account_number": "0123456789",
    "bank_code": "000013",
    "customer_identifier": "+2348135866028",
    "first_name": "John",
    "last_name": "Doe"
  }
}
```

**Error handling:**
- `400/424` — BVN mismatch (name, DOB, gender, or phone doesn't match NIBSS records)
- `401/403` — Authentication failure
- `500+` — Server error (retry with exponential backoff)
- Timeout: 45 seconds (BVN validation can take time)

**Implementation:** `frontend/squad-api-service.js` → `SquadVirtualAccountService.createVirtualAccount()`

#### `GET /virtual-account/customer/{accountNumber}` — Get Customer by Account

Retrieves customer details and balance for a given virtual account number. Used by the dashboard to display the user's financial information.

**Implementation:** `frontend/squad-api-service.js` → `SquadVirtualAccountService.getCustomerByVirtualAccount()`

#### `GET /virtual-account/{customerIdentifier}` — Get Customer by Identifier

Looks up a customer using their unique identifier (phone number or UUID). Used for cross-referencing users in the system.

**Implementation:** `frontend/squad-api-service.js` → `SquadVirtualAccountService.getCustomerByIdentifier()`

---

## 2. Transfer / Payout API

### Purpose in ScrowPay

All outbound money movement — escrow releases to sellers, refunds to buyers, and user withdrawals — flows through Squad's Transfer API. Transfers go from the Squad Merchant Ledger to any Nigerian bank account via NIP (Nigeria Inter-Bank Payment System).

### Endpoints

#### `POST /payout/account/lookup` — Verify Destination Account

Before any transfer, ScrowPay verifies the recipient's bank account name. This prevents misdirected payments and builds user confidence.

**Request:**
```json
{
  "bank_code": "000013",
  "account_number": "0123456789"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "account_name": "JOHN DOE",
    "account_number": "0123456789"
  }
}
```

**Implementation:** `frontend/SquadTransferService.js` → `SquadTransferService.lookupAccount()`

#### `POST /payout/transfer` — Initiate Fund Transfer

Transfers funds from the Squad Merchant Ledger to an external bank account. Amount is sent in **kobo** (₦1 = 100 kobo). Every transfer gets a unique reference prefixed with the Merchant ID.

**Request:**
```json
{
  "transaction_reference": "MERCHANT_ID_1234567890_ABC123",
  "amount": "500000",
  "bank_code": "000013",
  "account_number": "0123456789",
  "account_name": "JOHN DOE",
  "currency_id": "NGN",
  "remark": "ScrowPay withdrawal MERCHANT_ID_1234567890_ABC123"
}
```

**Key design decisions:**
- Transaction references are formatted as `{MERCHANT_ID}_{timestamp}_{random}` — Squad requires the Merchant ID prefix
- Amount is converted from Naira to kobo internally (`amount * 100`)
- 45-second timeout to accommodate NIP processing

**Implementation:** `frontend/SquadTransferService.js` → `SquadTransferService.initiateTransfer()`

#### `POST /payout/requery` — Re-query Transfer Status

Re-queries a previously initiated transfer to confirm its final status. Critical for handling timeout scenarios and ensuring idempotency.

**Implementation:** `frontend/SquadTransferService.js` → `SquadTransferService.requeryTransfer()`

#### `GET /payout/list` — List All Transfers

Lists all transfers from the Squad Wallet with pagination. Used for audit and reconciliation.

**Implementation:** `frontend/SquadTransferService.js` → `SquadTransferService.getAllTransfers()`

---

## 3. Merchant Balance API

#### `GET /merchant/balance?currency_id=NGN` — Get Ledger Balance

Returns the current Squad Merchant Ledger balance in **kobo**. The service converts to Naira for display.

**Polling strategy:**
- The `DashboardService` polls this endpoint every **30 seconds**
- The `BalanceService` maintains a **30-second TTL cache** to avoid rate-limiting
- On network failure, stale cached values are returned with a staleness indicator
- Cache is force-cleared before each poll cycle

**Implementation:** `frontend/SquadTransferService.js` → `SquadTransferService.getLedgerBalance()`

---

## 4. Supported Banks

The `SquadTransferService` includes NIP codes for **21 Nigerian banks**:

| Bank | NIP Code |
|------|----------|
| Access Bank | 000014 |
| GTBank | 000013 |
| Zenith Bank | 000015 |
| First Bank | 000016 |
| UBA | 000004 |
| Kuda | 090267 |
| OPay | 100004 |
| PalmPay | 100033 |
| ... and 13 more | |

---

## 5. Architecture

```
┌──────────────────────────────────────────────────────┐
│                    BROWSER                             │
│                                                        │
│  ┌─────────────────────┐   ┌─────────────────────┐    │
│  │ SquadVirtualAccount │   │ SquadTransferService │    │
│  │      Service        │   │                      │    │
│  │ • createVirtualAcct │   │ • lookupAccount      │    │
│  │ • getCustomerByAcct │   │ • initiateTransfer   │    │
│  │ • getCustomerById   │   │ • requeryTransfer    │    │
│  └────────┬────────────┘   │ • getLedgerBalance   │    │
│           │                │ • getAllTransfers     │    │
│           │                └──────────┬───────────┘    │
│           │                           │                │
│  ┌────────┴───────────────────────────┴─────────────┐  │
│  │              BalanceService                        │  │
│  │  • getAvailableBalance (Squad + 30s cache)        │  │
│  │  • getLockedBalance (Turso DB query)              │  │
│  │  • validateBalanceInvariant                       │  │
│  └───────────────────────────────────────────────────┘  │
└────────────────────────────┬───────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   Squad API     │
                    │  api-d.squadco  │
                    │      .com       │
                    └─────────────────┘
```

---

## 6. Security & Resilience

- **Bearer token auth** — All requests use `Authorization: Bearer {SECRET_KEY}`
- **AbortController timeouts** — Every request has a timeout (20-45s depending on operation)
- **Graceful degradation** — Network failures return stale cached data with staleness indicators
- **Error categorization** — Responses include `errorType` for precise UI handling (`bvn_mismatch`, `auth_error`, `timeout`, `network_error`)
- **Kobo/Naira conversion** — All internal calculations use kobo to avoid floating-point errors; display converts to Naira

---

## 7. Environment Configuration

```bash
# .env (root) — read by Docker containers
SQUAD_SECRET_KEY=sandbox_sk_your-secret-key
SQUAD_PUBLIC_KEY=sandbox_pk_your-public-key
SQUAD_MERCHANT_ID=your-merchant-id
SQUAD_ENVIRONMENT=sandbox

# frontend/env.js — read by browser
SQUAD_SECRET_KEY: 'sandbox_sk_your-secret-key',
SQUAD_PUBLIC_KEY: 'sandbox_pk_your-public-key',
SQUAD_MERCHANT_ID: 'your-merchant-id',
SQUAD_ENVIRONMENT: 'sandbox',
HOLDING_ACCOUNT: '0123456789'
```

Sandbox base URL: `https://sandbox-api-d.squadco.com`
Production base URL: `https://api-d.squadco.com`
