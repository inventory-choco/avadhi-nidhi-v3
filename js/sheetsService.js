/**
 * Avadhi Nidhi V3 - Google Sheets Live Service
 * Permanent, robust communication with production Google Apps Script Web App
 */

import { APP_CONFIG } from './config.js';

class SheetsService {
  constructor() {
    this.apiUrl = APP_CONFIG.gasApiUrl;
    this.isOnline = false;
    this.lastSynced = localStorage.getItem(APP_CONFIG.storageKeys.lastSynced) || null;
    this.syncListeners = [];
  }

  onSyncStatusChange(callback) {
    this.syncListeners.push(callback);
  }

  notifySyncStatus(status, text) {
    this.syncListeners.forEach(fn => fn(status, text));
  }

  /**
   * Fetch all live data from Google Sheets with caching fallback
   */
  async loadAll() {
    this.notifySyncStatus('syncing', 'Syncing with Google Sheets...');

    try {
      // Live fetch from hardcoded production Web App
      const res = await fetch(this.apiUrl, {
        method: 'GET',
        cache: 'no-store'
      });

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }

      const json = await res.json();
      if (json.status === 'success' && json.data) {
        this.isOnline = true;
        this.lastSynced = new Date().toISOString();
        localStorage.setItem(APP_CONFIG.storageKeys.lastSynced, this.lastSynced);

        // Cache datasets
        const d = json.data;
        if (d.members) this.saveLocal(APP_CONFIG.storageKeys.cachedMembers, d.members);
        if (d.transactions) this.saveLocal(APP_CONFIG.storageKeys.cachedTransactions, d.transactions);
        if (d.loans) this.saveLocal(APP_CONFIG.storageKeys.cachedLoans, d.loans);
        if (d.config) this.saveLocal(APP_CONFIG.storageKeys.cachedConfig, d.config);
        if (d.sahayaNidhi) this.saveLocal(APP_CONFIG.storageKeys.cachedSahaya, d.sahayaNidhi);
        if (d.payments2026) this.saveLocal(APP_CONFIG.storageKeys.cachedPayments2026, d.payments2026);
        if (d.loans2026) this.saveLocal(APP_CONFIG.storageKeys.cachedLoans2026, d.loans2026);

        this.notifySyncStatus('synced', 'Synced with Google Sheets • Just now');

        return {
          isOnline: true,
          members: d.members || [],
          transactions: d.transactions || [],
          loans: d.loans || [],
          config: d.config || APP_CONFIG.defaults,
          sahayaNidhi: d.sahayaNidhi || [],
          payments2026: d.payments2026 || [],
          loans2026: d.loans2026 || []
        };
      } else {
        throw new Error(json.message || "Invalid payload format");
      }

    } catch (err) {
      console.warn("Live fetch error, falling back to cached state:", err);
      this.isOnline = false;
      this.notifySyncStatus('offline', 'Offline Cache Mode');

      // Return cached data
      return {
        isOnline: false,
        members: this.getLocal(APP_CONFIG.storageKeys.cachedMembers, []),
        transactions: this.getLocal(APP_CONFIG.storageKeys.cachedTransactions, []),
        loans: this.getLocal(APP_CONFIG.storageKeys.cachedLoans, []),
        config: this.getLocal(APP_CONFIG.storageKeys.cachedConfig, APP_CONFIG.defaults),
        sahayaNidhi: this.getLocal(APP_CONFIG.storageKeys.cachedSahaya, []),
        payments2026: this.getLocal(APP_CONFIG.storageKeys.cachedPayments2026, []),
        loans2026: this.getLocal(APP_CONFIG.storageKeys.cachedLoans2026, [])
      };
    }
  }

  /**
   * POST Action to Google Apps Script
   */
  async postAction(action, data) {
    const payload = { action, data };

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8' // Standard GAS CORS-friendly header
        },
        body: JSON.stringify(payload)
      });

      const res = await response.json();
      return res;
    } catch (err) {
      console.error(`Action ${action} failed:`, err);
      return { status: "error", message: err.message };
    }
  }

  /**
   * Record smart waterfall payment
   */
  async recordSmartPayment(data) {
    return await this.postAction('RECORD_SMART_PAYMENT', data);
  }

  /**
   * Issue new loan
   */
  async issueLoan(loanData) {
    return await this.postAction('ISSUE_LOAN', loanData);
  }

  /**
   * Submit member loan request (Status = Requested)
   */
  async requestLoan(requestData) {
    return await this.postAction('REQUEST_LOAN', requestData);
  }

  /**
   * Update an existing pending loan request (only while Status = Requested)
   */
  async updateLoanRequest(requestData) {
    return await this.postAction('UPDATE_LOAN_REQUEST', requestData);
  }

  /**
   * Update loan request status (Approved, Rejected, Active when Paid)
   */
  async updateLoanStatus(statusData) {
    return await this.postAction('UPDATE_LOAN_STATUS', statusData);
  }

  /**
   * Repay loan
   */
  async repayLoan(repayData) {
    return await this.postAction('REPAY_LOAN', repayData);
  }

  /**
   * Edit transaction in TransactionsDB
   */
  async editTransaction(txData) {
    return await this.postAction('EDIT_TRANSACTION', txData);
  }

  /**
   * Void transaction in TransactionsDB
   */
  async voidTransaction(txData) {
    return await this.postAction('VOID_TRANSACTION', txData);
  }

  /**
   * Record Sahaya expense
   */
  async recordSahayaExpense(expenseData) {
    return await this.postAction('RECORD_SAHAYA_EXPENSE', expenseData);
  }

  /**
   * Update Member in Member_Details
   */
  async updateMember(memberData) {
    return await this.postAction('UPDATE_MEMBER', memberData);
  }

  /**
   * Update Config in ConfigDB
   */
  async updateConfig(configData) {
    return await this.postAction('UPDATE_CONFIG', configData);
  }

  /**
   * Manually trigger monthly Sahaya deductions
   */
  async runMonthlySahaya() {
    return await this.postAction('RUN_MONTHLY_SAHAYA', {});
  }

  // Local Storage Helpers
  getLocal(key, defaultVal) {
    try {
      const str = localStorage.getItem(key);
      return str ? JSON.parse(str) : defaultVal;
    } catch (e) {
      return defaultVal;
    }
  }

  saveLocal(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.warn("Storage save error:", e);
    }
  }
}

export const sheetsService = new SheetsService();
