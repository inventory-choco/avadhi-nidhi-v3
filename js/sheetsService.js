/**
 * Avadhi Nidhi V3 - Google Sheets & Storage Service
 * Handles live synchronization with Google Apps Script Web App API
 * and provides persistent offline cache via localStorage.
 */

import { APP_CONFIG, INITIAL_MEMBERS, INITIAL_TRANSACTIONS, INITIAL_LOANS, INITIAL_SAHAYA_RECORDS } from './data.js';

class SheetsService {
  constructor() {
    this.apiUrl = localStorage.getItem(APP_CONFIG.storageKeys.apiUrl) || '';
    this.isOnline = false;
    this.lastSynced = localStorage.getItem(APP_CONFIG.storageKeys.lastSynced) || null;
  }

  getApiUrl() {
    return this.apiUrl;
  }

  setApiUrl(url) {
    this.apiUrl = (url || '').trim();
    if (this.apiUrl) {
      localStorage.setItem(APP_CONFIG.storageKeys.apiUrl, this.apiUrl);
    } else {
      localStorage.removeItem(APP_CONFIG.storageKeys.apiUrl);
    }
  }

  /**
   * Test connection to Google Apps Script Web App
   */
  async testConnection(testUrl) {
    const url = testUrl || this.apiUrl;
    if (!url) {
      return { success: false, message: "No Google Apps Script URL provided." };
    }

    try {
      const response = await fetch(url, { method: 'GET', cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.status === 'success') {
        return { success: true, data: data.data };
      }
      return { success: false, message: data.message || "Invalid response format from script." };
    } catch (err) {
      return { success: false, message: err.message || "Network error. Please verify URL and deployment permissions ('Who has access: Anyone')." };
    }
  }

  /**
   * Load all data - tries Google Sheets API first, falls back to localStorage / defaults
   */
  async loadAll() {
    // If API URL is configured, try live fetch
    if (this.apiUrl) {
      try {
        const res = await fetch(this.apiUrl, { method: 'GET', cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (json.status === 'success' && json.data) {
            this.isOnline = true;
            this.lastSynced = new Date().toISOString();
            localStorage.setItem(APP_CONFIG.storageKeys.lastSynced, this.lastSynced);

            // Cache to local storage
            const data = json.data;
            if (data.members && data.members.length > 0) {
              this.saveLocal(APP_CONFIG.storageKeys.members, data.members);
            }
            if (data.transactions) {
              this.saveLocal(APP_CONFIG.storageKeys.transactions, data.transactions);
            }
            if (data.loans) {
              this.saveLocal(APP_CONFIG.storageKeys.loans, data.loans);
            }
            if (data.sahayaNidhi) {
              this.saveLocal(APP_CONFIG.storageKeys.sahaya, data.sahayaNidhi);
            }

            return {
              isOnline: true,
              members: data.members || [],
              transactions: data.transactions || [],
              loans: data.loans || [],
              sahayaNidhi: data.sahayaNidhi || []
            };
          }
        }
      } catch (err) {
        console.warn("Live fetch failed, falling back to local cache:", err);
      }
    }

    // Fallback: Read from localStorage or Seed Defaults
    this.isOnline = false;
    const members = this.getLocal(APP_CONFIG.storageKeys.members, INITIAL_MEMBERS);
    const transactions = this.getLocal(APP_CONFIG.storageKeys.transactions, INITIAL_TRANSACTIONS);
    const loans = this.getLocal(APP_CONFIG.storageKeys.loans, INITIAL_LOANS);
    const sahayaNidhi = this.getLocal(APP_CONFIG.storageKeys.sahaya, INITIAL_SAHAYA_RECORDS);

    return {
      isOnline: false,
      members,
      transactions,
      loans,
      sahayaNidhi
    };
  }

  /**
   * Send action to Google Apps Script
   */
  async postAction(action, data) {
    const payload = { action, data };

    if (this.apiUrl) {
      try {
        // Using text/plain with POST to avoid browser CORS preflight issues with Google Apps Script
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify(payload)
        });

        const result = await response.json();
        return result;
      } catch (err) {
        console.warn("Live post failed, will save locally:", err);
      }
    }

    // Offline / Local handling
    return { status: "success", offline: true };
  }

  /**
   * Record monthly payment (100 savings + 5 sahayanidhi)
   */
  async recordMonthlyPayment(paymentData) {
    const totalAmount = Number(paymentData.amount || APP_CONFIG.monthlyContributionTotal);
    const memberName = paymentData.memberName;
    const date = paymentData.date || new Date().toISOString().split('T')[0];
    const updatedBy = paymentData.updatedBy || APP_CONFIG.currentAdminName;

    const sahayaAmount = 5;
    const savingsAmount = totalAmount - sahayaAmount;

    // 1. Post to API if online
    if (this.apiUrl) {
      await this.postAction('RECORD_MONTHLY_PAYMENT', {
        memberName,
        totalAmount,
        date,
        updatedBy
      });
    }

    // 2. Update local state
    const transactions = this.getLocal(APP_CONFIG.storageKeys.transactions, INITIAL_TRANSACTIONS);
    const nowStr = new Date().toLocaleString('sv-SE');

    if (savingsAmount > 0) {
      transactions.unshift({
        date,
        memberName,
        type: 'Monthly Payment',
        amount: savingsAmount,
        updatedBy,
        updatedDate: nowStr,
        notes: `Monthly savings contribution (${savingsAmount} AED)`
      });
    }

    transactions.unshift({
      date,
      memberName,
      type: 'SahayaNidhi',
      amount: sahayaAmount,
      updatedBy,
      updatedDate: nowStr,
      notes: `Compulsory monthly charity deduction (${sahayaAmount} AED)`
    });

    this.saveLocal(APP_CONFIG.storageKeys.transactions, transactions);

    // Also record in Sahaya DB
    const sahaya = this.getLocal(APP_CONFIG.storageKeys.sahaya, INITIAL_SAHAYA_RECORDS);
    sahaya.unshift({
      date,
      type: 'Monthly Deduction',
      memberName,
      amount: sahayaAmount,
      beneficiaryOrCause: 'Monthly Charity Contribution',
      updatedBy,
      notes: 'Automatic 5 AED monthly deduction'
    });
    this.saveLocal(APP_CONFIG.storageKeys.sahaya, sahaya);

    return { success: true, savingsAmount, sahayaAmount };
  }

  /**
   * Add a raw transaction
   */
  async addTransaction(tx) {
    if (this.apiUrl) {
      await this.postAction('ADD_TRANSACTION', tx);
    }

    const transactions = this.getLocal(APP_CONFIG.storageKeys.transactions, INITIAL_TRANSACTIONS);
    const nowStr = new Date().toLocaleString('sv-SE');

    transactions.unshift({
      date: tx.date || new Date().toISOString().split('T')[0],
      memberName: tx.memberName,
      type: tx.type,
      amount: Number(tx.amount),
      updatedBy: tx.updatedBy || APP_CONFIG.currentAdminName,
      updatedDate: nowStr,
      notes: tx.notes || ''
    });

    this.saveLocal(APP_CONFIG.storageKeys.transactions, transactions);
    return { success: true };
  }

  /**
   * Issue a new Loan (Emergency or Vacation)
   */
  async issueLoan(loanData) {
    const loanId = `LN-${Date.now().toString().slice(-6)}`;
    const fullLoan = {
      loanId,
      memberName: loanData.memberName,
      type: loanData.type,
      amount: Number(loanData.amount),
      requestDate: loanData.requestDate,
      issueDate: loanData.issueDate || new Date().toISOString().split('T')[0],
      dueDate: loanData.dueDate,
      status: 'Active',
      repaidAmount: 0,
      repaidDate: '',
      notes: loanData.notes || '',
      updatedBy: loanData.updatedBy || APP_CONFIG.currentAdminName
    };

    if (this.apiUrl) {
      await this.postAction('ISSUE_LOAN', fullLoan);
    }

    // Save loan locally
    const loans = this.getLocal(APP_CONFIG.storageKeys.loans, INITIAL_LOANS);
    loans.unshift(fullLoan);
    this.saveLocal(APP_CONFIG.storageKeys.loans, loans);

    // Save corresponding TransactionsDB record
    const transactions = this.getLocal(APP_CONFIG.storageKeys.transactions, INITIAL_TRANSACTIONS);
    const nowStr = new Date().toLocaleString('sv-SE');
    transactions.unshift({
      date: fullLoan.issueDate,
      memberName: fullLoan.memberName,
      type: 'Loan issued',
      amount: fullLoan.amount,
      updatedBy: fullLoan.updatedBy,
      updatedDate: nowStr,
      notes: `${fullLoan.type} issued. Due date: ${fullLoan.dueDate}`
    });
    this.saveLocal(APP_CONFIG.storageKeys.transactions, transactions);

    return { success: true, loan: fullLoan };
  }

  /**
   * Repay an active Loan
   */
  async repayLoan(repayData) {
    const amount = Number(repayData.amount);
    const date = repayData.date || new Date().toISOString().split('T')[0];
    const updatedBy = repayData.updatedBy || APP_CONFIG.currentAdminName;
    const loanId = repayData.loanId;
    const memberName = repayData.memberName;

    if (this.apiUrl) {
      await this.postAction('REPAY_LOAN', {
        loanId,
        amount,
        date,
        memberName,
        updatedBy
      });
    }

    // Update loans cache
    const loans = this.getLocal(APP_CONFIG.storageKeys.loans, INITIAL_LOANS);
    const targetLoan = loans.find(l => (l.Loan_ID || l.loanId) === loanId);
    if (targetLoan) {
      const currentRepaid = Number(targetLoan.Repaid_Amount || targetLoan.repaidAmount || 0);
      const principal = Number(targetLoan.Amount || targetLoan.amount || 0);
      const newRepaid = currentRepaid + amount;
      targetLoan.repaidAmount = newRepaid;
      targetLoan.Repaid_Amount = newRepaid;

      if (newRepaid >= principal) {
        targetLoan.status = 'Repaid';
        targetLoan.Status = 'Repaid';
        targetLoan.repaidDate = date;
        targetLoan.Repaid_Date = date;
      } else {
        targetLoan.status = 'Partially Repaid';
        targetLoan.Status = 'Partially Repaid';
      }
      this.saveLocal(APP_CONFIG.storageKeys.loans, loans);
    }

    // Update TransactionsDB
    const transactions = this.getLocal(APP_CONFIG.storageKeys.transactions, INITIAL_TRANSACTIONS);
    const nowStr = new Date().toLocaleString('sv-SE');
    transactions.unshift({
      date,
      memberName,
      type: 'Loan Repayment',
      amount,
      updatedBy,
      updatedDate: nowStr,
      notes: `Loan repayment for ${loanId} (${amount} AED)`
    });
    this.saveLocal(APP_CONFIG.storageKeys.transactions, transactions);

    return { success: true };
  }

  /**
   * Record SahayaNidhi Expense / Charity Disbursement
   */
  async recordSahayaExpense(expenseData) {
    const amount = Number(expenseData.amount);
    const date = expenseData.date || new Date().toISOString().split('T')[0];
    const beneficiaryOrCause = expenseData.beneficiaryOrCause;
    const updatedBy = expenseData.updatedBy || APP_CONFIG.currentAdminName;
    const notes = expenseData.notes || '';

    if (this.apiUrl) {
      await this.postAction('RECORD_SAHAYA_EXPENSE', {
        amount,
        date,
        beneficiaryOrCause,
        updatedBy,
        notes
      });
    }

    const sahaya = this.getLocal(APP_CONFIG.storageKeys.sahaya, INITIAL_SAHAYA_RECORDS);
    sahaya.unshift({
      date,
      type: 'Charity Disbursement',
      memberName: '-',
      amount,
      beneficiaryOrCause,
      updatedBy,
      notes
    });
    this.saveLocal(APP_CONFIG.storageKeys.sahaya, sahaya);

    return { success: true };
  }

  /**
   * Trigger compulsory monthly 5 AED deduction for all members for a month
   */
  async triggerMonthlySahayaDeductions(monthName, dateStr) {
    const members = this.getLocal(APP_CONFIG.storageKeys.members, INITIAL_MEMBERS);
    const date = dateStr || new Date().toISOString().split('T')[0];
    const updatedBy = APP_CONFIG.currentAdminName;

    if (this.apiUrl) {
      await this.postAction('TRIGGER_MONTHLY_SAHAYA_DEDUCTION', {
        monthName,
        date,
        updatedBy
      });
    }

    const transactions = this.getLocal(APP_CONFIG.storageKeys.transactions, INITIAL_TRANSACTIONS);
    const sahaya = this.getLocal(APP_CONFIG.storageKeys.sahaya, INITIAL_SAHAYA_RECORDS);
    const nowStr = new Date().toLocaleString('sv-SE');

    members.forEach(m => {
      const name = m.Name || m.name;
      transactions.unshift({
        date,
        memberName: name,
        type: 'SahayaNidhi',
        amount: 5,
        updatedBy,
        updatedDate: nowStr,
        notes: `Compulsory SahayaNidhi monthly deduction (${monthName})`
      });

      sahaya.unshift({
        date,
        type: 'Monthly Deduction',
        memberName: name,
        amount: 5,
        beneficiaryOrCause: `Monthly Charity Contribution (${monthName})`,
        updatedBy,
        notes: `Deduction for ${monthName}`
      });
    });

    this.saveLocal(APP_CONFIG.storageKeys.transactions, transactions);
    this.saveLocal(APP_CONFIG.storageKeys.sahaya, sahaya);

    return { success: true, count: members.length };
  }

  /**
   * Update Member Details
   */
  async updateMember(memberData) {
    if (this.apiUrl) {
      await this.postAction('UPDATE_MEMBER', memberData);
    }

    const members = this.getLocal(APP_CONFIG.storageKeys.members, INITIAL_MEMBERS);
    const idx = members.findIndex(m => (m['Sr. Num'] || m.srNum) == memberData.srNum || (m.Name || m.name) === memberData.name);
    
    if (idx !== -1) {
      members[idx] = { ...members[idx], ...memberData };
    } else {
      members.push(memberData);
    }

    this.saveLocal(APP_CONFIG.storageKeys.members, members);
    return { success: true };
  }

  // LocalStorage Helpers
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
      console.warn("Error saving to localStorage:", e);
    }
  }

  resetToDefaults() {
    localStorage.removeItem(APP_CONFIG.storageKeys.members);
    localStorage.removeItem(APP_CONFIG.storageKeys.transactions);
    localStorage.removeItem(APP_CONFIG.storageKeys.loans);
    localStorage.removeItem(APP_CONFIG.storageKeys.sahaya);
    localStorage.removeItem(APP_CONFIG.storageKeys.lastSynced);
  }
}

export const sheetsService = new SheetsService();
