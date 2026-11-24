/**
 * Avadhi Nidhi V3 - Main Application Logic & UI Controller
 */

import { APP_CONFIG, INITIAL_MEMBERS } from './data.js';
import { sheetsService } from './sheetsService.js';
import {
  formatCurrency,
  formatDate,
  calculateEmergencyLoanDueDate,
  validateVacationLoanNotice,
  checkAnnualLoanEligibility,
  splitMonthlyPayment,
  calculateFundSummary,
  calculateMemberSummaries
} from './calculations.js';

class AvadhiNidhiApp {
  constructor() {
    this.currentTab = 'dashboard';
    this.currentUser = {
      name: APP_CONFIG.currentAdminName,
      email: APP_CONFIG.currentAdminEmail,
      type: 'Admin'
    };

    this.state = {
      members: [],
      transactions: [],
      loans: [],
      sahayaNidhi: [],
      isOnline: false,
      isLoading: true,
      lastSynced: null
    };

    // Filter states
    this.txFilter = {
      search: '',
      type: 'ALL',
      member: 'ALL'
    };
  }

  async init() {
    this.loadSavedUser();
    this.setupEventListeners();
    await this.refreshData();
    this.render();
  }

  loadSavedUser() {
    const saved = localStorage.getItem(APP_CONFIG.storageKeys.currentUser);
    if (saved) {
      try {
        this.currentUser = JSON.parse(saved);
      } catch (e) {
        console.warn("User parse error", e);
      }
    }
  }

  saveCurrentUser(user) {
    this.currentUser = user;
    localStorage.setItem(APP_CONFIG.storageKeys.currentUser, JSON.stringify(user));
    this.render();
    this.showToast(`Switched user to: ${user.name} (${user.type})`, 'info');
  }

  isAdmin() {
    return this.currentUser.type === 'Admin';
  }

  async refreshData() {
    this.state.isLoading = true;
    this.updateSyncBadge();

    try {
      const result = await sheetsService.loadAll();
      this.state.members = result.members || [];
      this.state.transactions = result.transactions || [];
      this.state.loans = result.loans || [];
      this.state.sahayaNidhi = result.sahayaNidhi || [];
      this.state.isOnline = result.isOnline;
      this.state.lastSynced = sheetsService.lastSynced;
    } catch (e) {
      console.error("Refresh error:", e);
      this.showToast("Failed to refresh data", "error");
    } finally {
      this.state.isLoading = false;
      this.render();
      this.updateSyncBadge();
    }
  }

  setupEventListeners() {
    // Navigation Tabs
    document.querySelectorAll('[data-tab-target]').forEach(button => {
      button.addEventListener('click', (e) => {
        const target = e.currentTarget.getAttribute('data-tab-target');
        this.switchTab(target);
      });
    });

    // Mobile menu toggle
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileNav = document.getElementById('mobile-nav');
    if (mobileMenuBtn && mobileNav) {
      mobileMenuBtn.addEventListener('click', () => {
        mobileNav.classList.toggle('hidden');
      });
    }

    // Modal Close Buttons
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.currentTarget.closest('.modal-overlay');
        if (modal) modal.classList.add('hidden');
      });
    });

    // Settings Modal Triggers
    const openSettingsBtn = document.getElementById('btn-open-settings');
    if (openSettingsBtn) {
      openSettingsBtn.addEventListener('click', () => this.openSettingsModal());
    }

    // Refresh Button
    const refreshBtn = document.getElementById('btn-refresh-data');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.refreshData();
        this.showToast("Refreshing data from Google Sheet...", "info");
      });
    }

    // Quick Action: Record Payment Modal
    const btnRecordPayment = document.getElementById('btn-record-payment');
    if (btnRecordPayment) {
      btnRecordPayment.addEventListener('click', () => this.openPaymentModal());
    }

    // Quick Action: Request/Issue Loan Modal
    const btnIssueLoan = document.getElementById('btn-issue-loan');
    if (btnIssueLoan) {
      btnIssueLoan.addEventListener('click', () => this.openLoanModal());
    }

    // Quick Action: Record Sahaya Expense
    const btnSahayaExpense = document.getElementById('btn-sahaya-expense');
    if (btnSahayaExpense) {
      btnSahayaExpense.addEventListener('click', () => this.openSahayaExpenseModal());
    }

    // Quick Action: Trigger Monthly Sahaya
    const btnTriggerSahaya = document.getElementById('btn-trigger-sahaya');
    if (btnTriggerSahaya) {
      btnTriggerSahaya.addEventListener('click', () => this.openTriggerSahayaModal());
    }

    // Form Submissions
    this.setupFormSubmissions();
  }

  switchTab(tabId) {
    this.currentTab = tabId;

    // Update tab bar buttons
    document.querySelectorAll('[data-tab-target]').forEach(btn => {
      const active = btn.getAttribute('data-tab-target') === tabId;
      if (active) {
        btn.classList.add('bg-emerald-600', 'text-white', 'shadow-md');
        btn.classList.remove('text-slate-300', 'hover:bg-slate-800');
      } else {
        btn.classList.remove('bg-emerald-600', 'text-white', 'shadow-md');
        btn.classList.add('text-slate-300', 'hover:bg-slate-800');
      }
    });

    // Update view panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.add('hidden');
    });

    const activePanel = document.getElementById(`panel-${tabId}`);
    if (activePanel) {
      activePanel.classList.remove('hidden');
    }

    // Render tab content
    this.renderCurrentTab();

    // Close mobile nav if open
    const mobileNav = document.getElementById('mobile-nav');
    if (mobileNav) mobileNav.classList.add('hidden');
  }

  render() {
    this.renderHeader();
    this.renderCurrentTab();
  }

  renderHeader() {
    // Current user display & switcher
    const userRoleBadge = document.getElementById('header-user-role');
    const userNameDisplay = document.getElementById('header-user-name');
    const userSelect = document.getElementById('user-switcher-select');

    if (userRoleBadge) {
      userRoleBadge.textContent = this.currentUser.type;
      userRoleBadge.className = this.currentUser.type === 'Admin'
        ? 'px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
        : 'px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30';
    }

    if (userNameDisplay) {
      userNameDisplay.textContent = this.currentUser.name;
    }

    // Populate user switcher dropdown
    if (userSelect && this.state.members.length > 0) {
      userSelect.innerHTML = '';
      this.state.members.forEach(m => {
        const name = m.Name || m.name;
        const type = m.Type || m.type || 'Member';
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = `${name} (${type})`;
        if (name === this.currentUser.name) opt.selected = true;
        userSelect.appendChild(opt);
      });

      userSelect.onchange = (e) => {
        const selectedName = e.target.value;
        const found = this.state.members.find(m => (m.Name || m.name) === selectedName);
        if (found) {
          this.saveCurrentUser({
            name: found.Name || found.name,
            email: found.Email || found.email || '',
            type: found.Type || found.type || 'Member'
          });
        }
      };
    }
  }

  updateSyncBadge() {
    const badge = document.getElementById('sync-status-badge');
    if (!badge) return;

    if (this.state.isLoading) {
      badge.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-amber-400 animate-ping mr-1.5"></span>
        <span class="text-xs text-amber-300">Syncing...</span>
      `;
    } else if (this.state.isOnline) {
      badge.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-emerald-400 mr-1.5"></span>
        <span class="text-xs text-emerald-300">Google Sheet Connected</span>
      `;
    } else {
      badge.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-slate-400 mr-1.5"></span>
        <span class="text-xs text-slate-300">Offline / Local Mode</span>
      `;
    }
  }

  renderCurrentTab() {
    switch (this.currentTab) {
      case 'dashboard':
        this.renderDashboard();
        break;
      case 'monthly':
        this.renderMonthlyPayments();
        break;
      case 'sahayanidhi':
        this.renderSahayaNidhi();
        break;
      case 'loans':
        this.renderLoans();
        break;
      case 'transactions':
        this.renderTransactions();
        break;
      case 'members':
        this.renderMembers();
        break;
    }
  }

  /**
   * DASHBOARD TAB RENDERING
   */
  renderDashboard() {
    const summary = calculateFundSummary(
      this.state.members,
      this.state.transactions,
      this.state.loans,
      this.state.sahayaNidhi
    );

    // Metric 1: Available Liquid Cash
    const elLiquidCash = document.getElementById('dash-liquid-cash');
    if (elLiquidCash) elLiquidCash.textContent = formatCurrency(summary.availableLiquidCash);

    // Metric 2: Total Member Savings
    const elTotalSavings = document.getElementById('dash-total-savings');
    if (elTotalSavings) elTotalSavings.textContent = formatCurrency(summary.totalMemberSavingsBalance);

    // Metric 3: SahayaNidhi Charity Pool
    const elSahayaPool = document.getElementById('dash-sahaya-pool');
    if (elSahayaPool) elSahayaPool.textContent = formatCurrency(summary.availableSahayaPool);

    // Metric 4: Active Loans Outstanding
    const elActiveLoans = document.getElementById('dash-active-loans');
    if (elActiveLoans) elActiveLoans.textContent = formatCurrency(summary.activeLoansOutstanding);

    // User's Personal Account Widget (if logged in member)
    this.renderPersonalWidget(summary.memberSummaries);

    // Dashboard Members Table
    const tbody = document.getElementById('dash-members-tbody');
    if (tbody) {
      tbody.innerHTML = '';
      summary.memberSummaries.forEach(m => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-800/50 transition-colors border-b border-slate-700/50 cursor-pointer';
        tr.addEventListener('click', () => this.openMemberStatementModal(m.name));

        const isNegativeOB = m.ob < 0;
        const isCurrentNeg = m.currentSavingsBalance < 0;

        tr.innerHTML = `
          <td class="px-4 py-3 text-sm text-slate-400">${m.srNum}</td>
          <td class="px-4 py-3">
            <div class="font-medium text-slate-100">${m.name}</div>
            <div class="text-xs text-slate-400">${m.type}</div>
          </td>
          <td class="px-4 py-3 text-sm ${isNegativeOB ? 'text-rose-400 font-semibold' : 'text-slate-300'}">
            ${formatCurrency(m.ob)}
            ${isNegativeOB ? '<span class="text-xs ml-1 text-rose-500">(Due)</span>' : ''}
          </td>
          <td class="px-4 py-3 text-sm ${isCurrentNeg ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}">
            ${formatCurrency(m.currentSavingsBalance)}
          </td>
          <td class="px-4 py-3 text-sm">
            ${m.hasActiveLoan
              ? `<span class="px-2 py-1 text-xs rounded-full bg-amber-500/20 text-amber-300 font-medium">${formatCurrency(m.outstandingLoanDebt)} Loan</span>`
              : `<span class="text-xs text-slate-500">None</span>`
            }
          </td>
          <td class="px-4 py-3 text-right">
            <button class="px-2.5 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200">
              Statement
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  }

  renderPersonalWidget(memberSummaries) {
    const container = document.getElementById('dash-personal-widget');
    if (!container) return;

    const mySummary = memberSummaries.find(m => m.name === this.currentUser.name);
    if (!mySummary) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    container.innerHTML = `
      <div class="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-slate-900 border border-emerald-500/30 shadow-xl">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span class="text-xs font-semibold uppercase tracking-wider text-emerald-400">Your Account Overview</span>
            <h3 class="text-xl font-bold text-white mt-1">${mySummary.name}</h3>
            <p class="text-xs text-slate-400 mt-0.5">Role: ${mySummary.type} • Opening Balance: ${formatCurrency(mySummary.ob)}</p>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center md:text-left">
            <div class="bg-slate-800/70 p-3 rounded-xl border border-slate-700/60">
              <div class="text-xs text-slate-400">Current Savings</div>
              <div class="text-lg font-bold ${mySummary.currentSavingsBalance < 0 ? 'text-rose-400' : 'text-emerald-400'}">
                ${formatCurrency(mySummary.currentSavingsBalance)}
              </div>
            </div>

            <div class="bg-slate-800/70 p-3 rounded-xl border border-slate-700/60">
              <div class="text-xs text-slate-400">Sahaya Contribution</div>
              <div class="text-lg font-bold text-teal-300">
                ${formatCurrency(mySummary.totalSahayaContributed)}
              </div>
            </div>

            <div class="bg-slate-800/70 p-3 rounded-xl border border-slate-700/60">
              <div class="text-xs text-slate-400">Active Loan</div>
              <div class="text-lg font-bold ${mySummary.hasActiveLoan ? 'text-amber-400' : 'text-slate-400'}">
                ${mySummary.hasActiveLoan ? formatCurrency(mySummary.outstandingLoanDebt) : '0 AED'}
              </div>
            </div>

            <div class="bg-slate-800/70 p-3 rounded-xl border border-slate-700/60">
              <div class="text-xs text-slate-400">2026/2027 Eligibility</div>
              <div class="text-xs font-medium text-slate-300 mt-1">
                <span class="${mySummary.emergencyEligible ? 'text-emerald-400' : 'text-slate-500'}">⚡ Emergency: ${mySummary.emergencyEligible ? 'Available' : 'Used'}</span><br/>
                <span class="${mySummary.vacationEligible ? 'text-emerald-400' : 'text-slate-500'}">✈️ Vacation: ${mySummary.vacationEligible ? 'Available' : 'Used'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * MONTHLY PAYMENTS TAB RENDERING
   */
  renderMonthlyPayments() {
    const listContainer = document.getElementById('monthly-payments-history');
    if (!listContainer) return;

    // Filter monthly payment transactions
    const monthlyTx = this.state.transactions.filter(t => (t.Type || t.type) === 'Monthly Payment');

    listContainer.innerHTML = '';
    if (monthlyTx.length === 0) {
      listContainer.innerHTML = `<div class="p-8 text-center text-slate-500">No monthly payments recorded yet.</div>`;
      return;
    }

    monthlyTx.slice(0, 30).forEach(t => {
      const name = t.Member_Name || t.memberName;
      const amt = Number(t.Amount || t.amount || 0);
      const date = t.Date || t.date;
      const updatedBy = t.Updated_By_UserName || t['Updated By UserName'] || t.updatedBy || 'Admin';

      const item = document.createElement('div');
      item.className = 'p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between';
      item.innerHTML = `
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
            💳
          </div>
          <div>
            <div class="font-semibold text-white">${name}</div>
            <div class="text-xs text-slate-400">${formatDate(date)} • Recorded by ${updatedBy}</div>
          </div>
        </div>
        <div class="text-right">
          <div class="text-base font-bold text-emerald-400">+${formatCurrency(amt)}</div>
          <div class="text-xs text-teal-400">+5 AED SahayaNidhi</div>
        </div>
      `;
      listContainer.appendChild(item);
    });

    // Render monthly status matrix (Dec 2026, Jan 2027, Feb 2027)
    this.renderMonthlyMatrix();
  }

  renderMonthlyMatrix() {
    const matrixContainer = document.getElementById('monthly-matrix-grid');
    if (!matrixContainer) return;

    const months = [
      { key: '2026-12', label: 'Dec 2026' },
      { key: '2027-01', label: 'Jan 2027' },
      { key: '2027-02', label: 'Feb 2027' },
      { key: '2027-03', label: 'Mar 2027' }
    ];

    let html = `
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="bg-slate-800/80 text-xs text-slate-400 border-b border-slate-700">
            <tr>
              <th class="px-4 py-3">Member</th>
              ${months.map(m => `<th class="px-4 py-3 text-center">${m.label}</th>`).join('')}
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800">
    `;

    this.state.members.forEach(m => {
      const name = m.Name || m.name;
      const memTx = this.state.transactions.filter(t => (t.Member_Name || t.memberName) === name && (t.Type || t.type) === 'Monthly Payment');

      html += `<tr class="hover:bg-slate-800/30">
        <td class="px-4 py-3 font-medium text-slate-200">${name}</td>`;

      months.forEach(month => {
        // Check if any payment in that month
        const hasPayment = memTx.some(t => {
          const d = t.Date || t.date || '';
          return d.startsWith(month.key);
        });

        if (hasPayment) {
          html += `<td class="px-4 py-3 text-center">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-400">
              ✓ Paid
            </span>
          </td>`;
        } else {
          html += `<td class="px-4 py-3 text-center">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-700/50 text-slate-400">
              Pending
            </span>
          </td>`;
        }
      });

      html += `</tr>`;
    });

    html += `</tbody></table></div>`;
    matrixContainer.innerHTML = html;
  }

  /**
   * SAHAYANIDHI TAB RENDERING
   */
  renderSahayaNidhi() {
    const summary = calculateFundSummary(
      this.state.members,
      this.state.transactions,
      this.state.loans,
      this.state.sahayaNidhi
    );

    const elSahayaTotal = document.getElementById('sahaya-tab-pool');
    if (elSahayaTotal) elSahayaTotal.textContent = formatCurrency(summary.availableSahayaPool);

    const elSahayaCollected = document.getElementById('sahaya-tab-collected');
    if (elSahayaCollected) elSahayaCollected.textContent = formatCurrency(summary.totalSahayaCollected);

    const elSahayaDisbursed = document.getElementById('sahaya-tab-disbursed');
    if (elSahayaDisbursed) elSahayaDisbursed.textContent = formatCurrency(summary.totalSahayaDisbursed);

    // Ledger records
    const tbody = document.getElementById('sahaya-ledger-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (this.state.sahayaNidhi.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-500">No SahayaNidhi records found.</td></tr>`;
      return;
    }

    this.state.sahayaNidhi.forEach(s => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-700/50 hover:bg-slate-800/40';

      const type = s.Type || s.type;
      const isDisbursement = type === 'Charity Disbursement' || type === 'Expense';
      const amt = Number(s.Amount || s.amount || 0);

      tr.innerHTML = `
        <td class="px-4 py-3 text-xs text-slate-400">${formatDate(s.Date || s.date)}</td>
        <td class="px-4 py-3">
          <span class="px-2 py-0.5 text-xs rounded-full font-medium ${isDisbursement ? 'bg-rose-500/20 text-rose-300' : 'bg-teal-500/20 text-teal-300'}">
            ${type}
          </span>
        </td>
        <td class="px-4 py-3 text-sm text-slate-200">${s.Member_Name || s.memberName || '-'}</td>
        <td class="px-4 py-3 text-sm font-semibold ${isDisbursement ? 'text-rose-400' : 'text-teal-400'}">
          ${isDisbursement ? '-' : '+'}${formatCurrency(amt)}
        </td>
        <td class="px-4 py-3 text-xs text-slate-300">${s.Beneficiary_Or_Cause || s.beneficiaryOrCause || '-'}</td>
        <td class="px-4 py-3 text-xs text-slate-400">${s.Notes || s.notes || '-'}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /**
   * LOANS TAB RENDERING
   */
  renderLoans() {
    const activeList = document.getElementById('loans-active-list');
    const pastList = document.getElementById('loans-past-list');

    if (!activeList) return;

    activeList.innerHTML = '';
    if (pastList) pastList.innerHTML = '';

    const loans = this.state.loans;
    const activeLoans = loans.filter(l => (l.Status || l.status) !== 'Repaid');
    const repaidLoans = loans.filter(l => (l.Status || l.status) === 'Repaid');

    if (activeLoans.length === 0) {
      activeList.innerHTML = `<div class="p-8 text-center text-slate-500">No active loans outstanding. All funds are clear!</div>`;
    } else {
      activeLoans.forEach(l => {
        const principal = Number(l.Amount || l.amount || 0);
        const repaid = Number(l.Repaid_Amount || l.repaidAmount || 0);
        const outstanding = principal - repaid;
        const dueDate = l.Due_Date || l.dueDate;
        const memberName = l.Member_Name || l.memberName;
        const type = l.Type || l.type;
        const loanId = l.Loan_ID || l.loanId;

        // Check if overdue
        const isOverdue = dueDate && new Date(dueDate) < new Date();

        const card = document.createElement('div');
        card.className = `p-5 rounded-2xl bg-slate-800/80 border ${isOverdue ? 'border-rose-500/60 shadow-lg shadow-rose-950/20' : 'border-slate-700/60'} flex flex-col md:flex-row justify-between gap-4`;
        card.innerHTML = `
          <div>
            <div class="flex items-center space-x-2">
              <span class="px-2 py-0.5 text-xs rounded-full font-bold ${type === 'Emergency Loan' ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'}">
                ${type === 'Emergency Loan' ? '⚡ Emergency Loan' : '✈️ Vacation Loan'}
              </span>
              <span class="text-xs text-slate-400">${loanId}</span>
              ${isOverdue ? `<span class="px-2 py-0.5 text-xs rounded-full bg-rose-500/20 text-rose-400 font-bold">⚠️ OVERDUE</span>` : ''}
            </div>
            <h4 class="text-lg font-bold text-white mt-1.5">${memberName}</h4>
            <div class="text-xs text-slate-400 mt-1 space-y-0.5">
              <div>Issued: <strong class="text-slate-300">${formatDate(l.Issue_Date || l.issueDate)}</strong></div>
              <div>Due Date: <strong class="${isOverdue ? 'text-rose-400' : 'text-amber-300'}">${formatDate(dueDate)}</strong></div>
              ${l.Notes || l.notes ? `<div>Note: ${l.Notes || l.notes}</div>` : ''}
            </div>
          </div>

          <div class="flex flex-col justify-between items-end">
            <div class="text-right">
              <div class="text-xs text-slate-400">Outstanding Balance</div>
              <div class="text-xl font-black text-rose-400">${formatCurrency(outstanding)}</div>
              <div class="text-xs text-slate-500 mt-0.5">Principal: ${formatCurrency(principal)} (Repaid: ${formatCurrency(repaid)})</div>
            </div>

            ${this.isAdmin() ? `
              <button data-repay-loan-id="${loanId}" data-repay-member="${memberName}" data-repay-outstanding="${outstanding}" class="btn-repay-trigger mt-3 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow">
                Record Repayment
              </button>
            ` : ''}
          </div>
        `;
        activeList.appendChild(card);
      });

      // Bind repay triggers
      document.querySelectorAll('.btn-repay-trigger').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const lId = e.currentTarget.getAttribute('data-repay-loan-id');
          const mName = e.currentTarget.getAttribute('data-repay-member');
          const outAmt = e.currentTarget.getAttribute('data-repay-outstanding');
          this.openLoanRepayModal(lId, mName, outAmt);
        });
      });
    }

    if (pastList) {
      if (repaidLoans.length === 0) {
        pastList.innerHTML = `<div class="p-4 text-center text-slate-500 text-xs">No completed loan history.</div>`;
      } else {
        repaidLoans.forEach(l => {
          const item = document.createElement('div');
          item.className = 'p-3 rounded-lg bg-slate-800/40 border border-slate-700/40 flex justify-between items-center text-xs';
          item.innerHTML = `
            <div>
              <div class="font-bold text-slate-200">${l.Member_Name || l.memberName} (${l.Type || l.type})</div>
              <div class="text-slate-400">Repaid on ${formatDate(l.Repaid_Date || l.repaidDate || '-')}</div>
            </div>
            <div class="text-right font-semibold text-emerald-400">
              ${formatCurrency(l.Amount || l.amount)} ✓
            </div>
          `;
          pastList.appendChild(item);
        });
      }
    }
  }

  /**
   * TRANSACTIONS TAB RENDERING
   */
  renderTransactions() {
    const tbody = document.getElementById('transactions-tbody');
    const memberSelect = document.getElementById('tx-filter-member');
    if (!tbody) return;

    // Populate filter member select once
    if (memberSelect && memberSelect.children.length <= 1) {
      memberSelect.innerHTML = '<option value="ALL">All Members</option>';
      this.state.members.forEach(m => {
        const name = m.Name || m.name;
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        memberSelect.appendChild(opt);
      });

      memberSelect.addEventListener('change', (e) => {
        this.txFilter.member = e.target.value;
        this.renderTransactions();
      });

      const typeSelect = document.getElementById('tx-filter-type');
      if (typeSelect) {
        typeSelect.addEventListener('change', (e) => {
          this.txFilter.type = e.target.value;
          this.renderTransactions();
        });
      }

      const searchInput = document.getElementById('tx-filter-search');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          this.txFilter.search = e.target.value.toLowerCase();
          this.renderTransactions();
        });
      }

      const exportBtn = document.getElementById('btn-export-csv');
      if (exportBtn) {
        exportBtn.addEventListener('click', () => this.exportTransactionsCSV());
      }

      const addManualBtn = document.getElementById('btn-add-manual-tx');
      if (addManualBtn) {
        addManualBtn.addEventListener('click', () => this.openManualTxModal());
      }
    }

    // Filter transactions
    let filtered = [...this.state.transactions];

    if (this.txFilter.member !== 'ALL') {
      filtered = filtered.filter(t => (t.Member_Name || t.memberName) === this.txFilter.member);
    }

    if (this.txFilter.type !== 'ALL') {
      filtered = filtered.filter(t => (t.Type || t.type) === this.txFilter.type);
    }

    if (this.txFilter.search) {
      filtered = filtered.filter(t => {
        const name = (t.Member_Name || t.memberName || '').toLowerCase();
        const type = (t.Type || t.type || '').toLowerCase();
        const notes = (t.Notes || t.notes || '').toLowerCase();
        return name.includes(this.txFilter.search) || type.includes(this.txFilter.search) || notes.includes(this.txFilter.search);
      });
    }

    tbody.innerHTML = '';
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-500">No transactions match your search filter.</td></tr>`;
      return;
    }

    filtered.forEach(t => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-700/50 hover:bg-slate-800/40 text-sm';

      const type = t.Type || t.type;
      const amt = Number(t.Amount || t.amount || 0);
      const isPositive = type === 'Monthly Payment' || type === 'Loan Repayment' || type === 'SahayaNidhi';

      let typeBadge = '';
      if (type === 'Monthly Payment') {
        typeBadge = `<span class="px-2 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-400 font-medium">Monthly Payment</span>`;
      } else if (type === 'SahayaNidhi') {
        typeBadge = `<span class="px-2 py-0.5 text-xs rounded-full bg-teal-500/20 text-teal-400 font-medium">SahayaNidhi</span>`;
      } else if (type === 'Loan issued' || type === 'Loan Issued') {
        typeBadge = `<span class="px-2 py-0.5 text-xs rounded-full bg-rose-500/20 text-rose-400 font-medium">Loan Issued</span>`;
      } else if (type === 'Loan Repayment') {
        typeBadge = `<span class="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400 font-medium">Loan Repayment</span>`;
      } else {
        typeBadge = `<span class="px-2 py-0.5 text-xs rounded-full bg-slate-700 text-slate-300 font-medium">${type}</span>`;
      }

      tr.innerHTML = `
        <td class="px-4 py-3 text-xs text-slate-400">${formatDate(t.Date || t.date)}</td>
        <td class="px-4 py-3 font-medium text-slate-200">${t.Member_Name || t.memberName}</td>
        <td class="px-4 py-3">${typeBadge}</td>
        <td class="px-4 py-3 font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}">
          ${isPositive ? '+' : '-'}${formatCurrency(amt)}
        </td>
        <td class="px-4 py-3 text-xs text-slate-400">${t.Updated_By_UserName || t['Updated By UserName'] || t.updatedBy || '-'}</td>
        <td class="px-4 py-3 text-xs text-slate-400">${t.Updated_By_Date || t['Updated By Date'] || t.updatedDate || '-'}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /**
   * MEMBERS TAB RENDERING
   */
  renderMembers() {
    const grid = document.getElementById('members-cards-grid');
    if (!grid) return;

    const summary = calculateFundSummary(
      this.state.members,
      this.state.transactions,
      this.state.loans,
      this.state.sahayaNidhi
    );

    grid.innerHTML = '';
    summary.memberSummaries.forEach(m => {
      const card = document.createElement('div');
      card.className = 'p-5 rounded-2xl bg-slate-800/70 border border-slate-700/60 hover:border-emerald-500/40 transition-all flex flex-col justify-between';
      card.innerHTML = `
        <div>
          <div class="flex items-center justify-between">
            <span class="w-7 h-7 rounded-full bg-slate-700 text-slate-300 flex items-center justify-center text-xs font-bold">
              ${m.srNum}
            </span>
            <span class="px-2 py-0.5 text-xs rounded-full font-semibold ${m.type === 'Admin' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}">
              ${m.type}
            </span>
          </div>

          <h4 class="text-base font-bold text-white mt-3">${m.name}</h4>
          ${m.email ? `<p class="text-xs text-slate-400 mt-0.5">✉️ ${m.email}</p>` : ''}
          ${m.phone ? `<p class="text-xs text-slate-400">📞 ${m.phone}</p>` : ''}

          <div class="mt-4 pt-3 border-t border-slate-700/60 space-y-2 text-xs">
            <div class="flex justify-between">
              <span class="text-slate-400">OB (from Dec-2026):</span>
              <span class="font-semibold ${m.ob < 0 ? 'text-rose-400' : 'text-slate-300'}">${formatCurrency(m.ob)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-400">Savings Contributed:</span>
              <span class="font-semibold text-emerald-400">+${formatCurrency(m.totalSavingsContributed)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-400">Current Savings Balance:</span>
              <span class="font-bold text-sm ${m.currentSavingsBalance < 0 ? 'text-rose-400' : 'text-emerald-400'}">
                ${formatCurrency(m.currentSavingsBalance)}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-400">Sahaya Contributed:</span>
              <span class="font-medium text-teal-400">${formatCurrency(m.totalSahayaContributed)}</span>
            </div>
            ${m.hasActiveLoan ? `
              <div class="flex justify-between text-amber-300 font-semibold bg-amber-500/10 p-1.5 rounded">
                <span>Active Loan Debt:</span>
                <span>${formatCurrency(m.outstandingLoanDebt)}</span>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="mt-5 pt-3 border-t border-slate-700/60 flex items-center justify-between">
          <button data-statement-name="${m.name}" class="btn-open-statement text-xs text-emerald-400 hover:text-emerald-300 font-semibold">
            View Statement →
          </button>
          ${this.isAdmin() ? `
            <button data-edit-member-name="${m.name}" class="btn-edit-member text-xs text-slate-400 hover:text-slate-200">
              Edit
            </button>
          ` : ''}
        </div>
      `;
      grid.appendChild(card);
    });

    // Statement buttons
    document.querySelectorAll('.btn-open-statement').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const name = e.currentTarget.getAttribute('data-statement-name');
        this.openMemberStatementModal(name);
      });
    });

    // Edit member buttons
    document.querySelectorAll('.btn-edit-member').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const name = e.currentTarget.getAttribute('data-edit-member-name');
        this.openEditMemberModal(name);
      });
    });
  }

  /**
   * MODALS & ACTIONS
   */
  openPaymentModal(prefillMember = '') {
    const modal = document.getElementById('modal-record-payment');
    const select = document.getElementById('payment-member-select');
    const amountInput = document.getElementById('payment-amount-input');
    const dateInput = document.getElementById('payment-date-input');
    const splitPreview = document.getElementById('payment-split-preview');

    if (!modal) return;

    // Fill members
    select.innerHTML = '<option value="">Select Member...</option>';
    this.state.members.forEach(m => {
      const name = m.Name || m.name;
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === prefillMember) opt.selected = true;
      select.appendChild(opt);
    });

    // Set default values
    amountInput.value = APP_CONFIG.monthlyContributionTotal; // 105
    dateInput.value = new Date().toISOString().split('T')[0];

    const updatePreview = () => {
      const val = Number(amountInput.value) || 0;
      const split = splitMonthlyPayment(val);
      splitPreview.innerHTML = `
        <div class="p-3 rounded-lg bg-slate-900/60 border border-slate-700 text-xs space-y-1">
          <div class="flex justify-between">
            <span class="text-slate-400">Total Payment:</span>
            <span class="font-bold text-white">${formatCurrency(split.total)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">→ Monthly Savings Fund (100):</span>
            <span class="font-semibold text-emerald-400">${formatCurrency(split.savings)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">→ SahayaNidhi Charity Deduction (5):</span>
            <span class="font-semibold text-teal-400">${formatCurrency(split.sahaya)}</span>
          </div>
        </div>
      `;
    };

    amountInput.oninput = updatePreview;
    updatePreview();

    modal.classList.remove('hidden');
  }

  openLoanModal() {
    const modal = document.getElementById('modal-issue-loan');
    const select = document.getElementById('loan-member-select');
    const typeSelect = document.getElementById('loan-type-select');
    const amountInput = document.getElementById('loan-amount-input');
    const reqDateInput = document.getElementById('loan-request-date');
    const issueDateInput = document.getElementById('loan-issue-date');
    const neededDateInput = document.getElementById('loan-needed-date');
    const vacationNoticeGroup = document.getElementById('loan-vacation-notice-group');
    const dueDateDisplay = document.getElementById('loan-due-date-display');
    const quotaWarning = document.getElementById('loan-quota-warning');

    if (!modal) return;

    // Fill members
    select.innerHTML = '<option value="">Select Member...</option>';
    this.state.members.forEach(m => {
      const name = m.Name || m.name;
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });

    const todayStr = new Date().toISOString().split('T')[0];
    reqDateInput.value = todayStr;
    issueDateInput.value = todayStr;
    amountInput.value = 1000;

    // Compute automatic due date for emergency loan
    const refreshLoanFields = () => {
      const member = select.value;
      const type = typeSelect.value;
      const issueDate = issueDateInput.value;
      const reqDate = reqDateInput.value;
      const needDate = neededDateInput.value;

      // Show/hide vacation specific fields
      if (type === 'Vacation Loan') {
        vacationNoticeGroup.classList.remove('hidden');
        if (needDate) {
          const noticeCheck = validateVacationLoanNotice(reqDate, needDate);
          if (!noticeCheck.isValid) {
            quotaWarning.innerHTML = `⚠️ Vacation Loan requires minimum 25 days notice! Currently: ${noticeCheck.daysNotice} days notice.`;
            quotaWarning.className = 'p-3 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40 block';
          } else {
            quotaWarning.className = 'hidden';
          }
        }
      } else {
        vacationNoticeGroup.classList.add('hidden');
      }

      // Calculate Emergency Loan Due Date
      // Duration is 1 month excluding remaining days of current month (last day of next month)
      const calculatedDueDate = calculateEmergencyLoanDueDate(issueDate);
      dueDateDisplay.textContent = `${formatDate(calculatedDueDate)} (Automatic: End of next month)`;
      modal.setAttribute('data-computed-due-date', calculatedDueDate);

      // Annual quota check
      if (member) {
        const quota = checkAnnualLoanEligibility(this.state.loans, member, type, new Date(issueDate).getFullYear());
        if (!quota.isEligible) {
          quotaWarning.innerHTML = `⚠️ ${member} has ALREADY availed 1 ${type} in ${quota.year}! Policy allows max 1 per calendar year.`;
          quotaWarning.className = 'p-3 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 block';
        } else if (type !== 'Vacation Loan') {
          quotaWarning.className = 'hidden';
        }
      }
    };

    select.onchange = refreshLoanFields;
    typeSelect.onchange = refreshLoanFields;
    issueDateInput.onchange = refreshLoanFields;
    reqDateInput.onchange = refreshLoanFields;
    neededDateInput.onchange = refreshLoanFields;

    refreshLoanFields();
    modal.classList.remove('hidden');
  }

  openLoanRepayModal(loanId, memberName, outstanding) {
    const modal = document.getElementById('modal-repay-loan');
    if (!modal) return;

    document.getElementById('repay-loan-id').value = loanId;
    document.getElementById('repay-member-name').value = memberName;
    document.getElementById('repay-member-display').textContent = `${memberName} (${loanId})`;
    document.getElementById('repay-outstanding-display').textContent = formatCurrency(outstanding);
    document.getElementById('repay-amount-input').value = outstanding;
    document.getElementById('repay-date-input').value = new Date().toISOString().split('T')[0];

    modal.classList.remove('hidden');
  }

  openSahayaExpenseModal() {
    const modal = document.getElementById('modal-sahaya-expense');
    if (!modal) return;
    document.getElementById('sahaya-expense-date').value = new Date().toISOString().split('T')[0];
    modal.classList.remove('hidden');
  }

  openTriggerSahayaModal() {
    const modal = document.getElementById('modal-trigger-sahaya');
    if (!modal) return;

    const monthInput = document.getElementById('trigger-sahaya-month');
    const now = new Date();
    const curMonth = `${now.toLocaleString('default', { month: 'short' })}-${now.getFullYear()}`;
    monthInput.value = curMonth;

    modal.classList.remove('hidden');
  }

  openManualTxModal() {
    const modal = document.getElementById('modal-manual-tx');
    const select = document.getElementById('manual-tx-member');
    if (!modal) return;

    select.innerHTML = '<option value="">Select Member...</option>';
    this.state.members.forEach(m => {
      const name = m.Name || m.name;
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });

    document.getElementById('manual-tx-date').value = new Date().toISOString().split('T')[0];
    modal.classList.remove('hidden');
  }

  openEditMemberModal(memberName) {
    const modal = document.getElementById('modal-edit-member');
    const member = this.state.members.find(m => (m.Name || m.name) === memberName);
    if (!modal || !member) return;

    document.getElementById('edit-member-sr').value = member['Sr. Num'] || member.srNum;
    document.getElementById('edit-member-name').value = member.Name || member.name;
    document.getElementById('edit-member-ob').value = member['OB from Dec-2026'] || member.ob || 0;
    document.getElementById('edit-member-phone').value = member.Phone || member.phone || '';
    document.getElementById('edit-member-email').value = member.Email || member.email || '';
    document.getElementById('edit-member-type').value = member.Type || member.type || 'Member';

    modal.classList.remove('hidden');
  }

  openMemberStatementModal(memberName) {
    const modal = document.getElementById('modal-member-statement');
    if (!modal) return;

    const summary = calculateFundSummary(
      this.state.members,
      this.state.transactions,
      this.state.loans,
      this.state.sahayaNidhi
    );

    const mem = summary.memberSummaries.find(m => m.name === memberName);
    if (!mem) return;

    document.getElementById('statement-member-name').textContent = mem.name;
    document.getElementById('statement-member-role').textContent = mem.type;
    document.getElementById('statement-ob').textContent = formatCurrency(mem.ob);
    document.getElementById('statement-savings').textContent = formatCurrency(mem.currentSavingsBalance);
    document.getElementById('statement-sahaya').textContent = formatCurrency(mem.totalSahayaContributed);
    document.getElementById('statement-loan-debt').textContent = formatCurrency(mem.outstandingLoanDebt);

    // Filter member transactions
    const tbody = document.getElementById('statement-tx-tbody');
    tbody.innerHTML = '';

    const memTx = this.state.transactions.filter(t => (t.Member_Name || t.memberName) === memberName);
    if (memTx.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-500">No transactions recorded yet.</td></tr>`;
    } else {
      memTx.forEach(t => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-700/40 text-xs';
        tr.innerHTML = `
          <td class="px-3 py-2 text-slate-400">${formatDate(t.Date || t.date)}</td>
          <td class="px-3 py-2 text-slate-200">${t.Type || t.type}</td>
          <td class="px-3 py-2 font-semibold text-emerald-400">${formatCurrency(t.Amount || t.amount)}</td>
          <td class="px-3 py-2 text-slate-400">${t.Updated_By_UserName || t['Updated By UserName'] || t.updatedBy || '-'}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    modal.classList.remove('hidden');
  }

  openSettingsModal() {
    const modal = document.getElementById('modal-settings');
    if (!modal) return;

    const urlInput = document.getElementById('settings-api-url');
    urlInput.value = sheetsService.getApiUrl();

    const statusDisplay = document.getElementById('settings-connection-status');
    statusDisplay.innerHTML = sheetsService.apiUrl
      ? `<span class="text-xs text-emerald-400">Current URL configured. Click "Test Connection" to verify.</span>`
      : `<span class="text-xs text-amber-400">No Apps Script URL configured. App is running in Local / Demo Cache mode.</span>`;

    modal.classList.remove('hidden');
  }

  /**
   * FORM SUBMISSION HANDLERS
   */
  setupFormSubmissions() {
    // 1. Record Monthly Payment Form
    const paymentForm = document.getElementById('form-record-payment');
    if (paymentForm) {
      paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const memberName = document.getElementById('payment-member-select').value;
        const amount = Number(document.getElementById('payment-amount-input').value);
        const date = document.getElementById('payment-date-input').value;

        if (!memberName || !amount) {
          this.showToast("Please select member and enter amount", "error");
          return;
        }

        document.getElementById('modal-record-payment').classList.add('hidden');
        this.showToast(`Recording payment of ${amount} AED for ${memberName}...`, "info");

        await sheetsService.recordMonthlyPayment({
          memberName,
          amount,
          date,
          updatedBy: this.currentUser.name
        });

        await this.refreshData();
        this.showToast(`Payment recorded! 100 AED savings + 5 AED SahayaNidhi credited.`, "success");
      });
    }

    // 2. Issue Loan Form
    const loanForm = document.getElementById('form-issue-loan');
    if (loanForm) {
      loanForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const memberName = document.getElementById('loan-member-select').value;
        const type = document.getElementById('loan-type-select').value;
        const amount = Number(document.getElementById('loan-amount-input').value);
        const requestDate = document.getElementById('loan-request-date').value;
        const issueDate = document.getElementById('loan-issue-date').value;
        const neededDate = document.getElementById('loan-needed-date').value;
        const notes = document.getElementById('loan-notes').value;
        const modal = document.getElementById('modal-issue-loan');
        const dueDate = modal.getAttribute('data-computed-due-date') || calculateEmergencyLoanDueDate(issueDate);

        if (!memberName || !amount) {
          this.showToast("Please fill all required loan fields", "error");
          return;
        }

        if (amount > APP_CONFIG.maxLoanAmount) {
          this.showToast(`Loan amount cannot exceed ${APP_CONFIG.maxLoanAmount} AED`, "error");
          return;
        }

        if (type === 'Vacation Loan') {
          const noticeCheck = validateVacationLoanNotice(requestDate, neededDate);
          if (!noticeCheck.isValid) {
            this.showToast(`Vacation loan requires at least 25 days advance notice!`, "error");
            return;
          }
        }

        modal.classList.add('hidden');
        this.showToast(`Issuing ${type} for ${memberName}...`, "info");

        await sheetsService.issueLoan({
          memberName,
          type,
          amount,
          requestDate,
          issueDate,
          dueDate,
          notes,
          updatedBy: this.currentUser.name
        });

        await this.refreshData();
        this.showToast(`${type} issued successfully! Due date: ${dueDate}`, "success");
      });
    }

    // 3. Repay Loan Form
    const repayForm = document.getElementById('form-repay-loan');
    if (repayForm) {
      repayForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const loanId = document.getElementById('repay-loan-id').value;
        const memberName = document.getElementById('repay-member-name').value;
        const amount = Number(document.getElementById('repay-amount-input').value);
        const date = document.getElementById('repay-date-input').value;

        if (!loanId || !amount) return;

        document.getElementById('modal-repay-loan').classList.add('hidden');
        this.showToast(`Recording repayment of ${amount} AED...`, "info");

        await sheetsService.repayLoan({
          loanId,
          memberName,
          amount,
          date,
          updatedBy: this.currentUser.name
        });

        await this.refreshData();
        this.showToast(`Loan repayment recorded!`, "success");
      });
    }

    // 4. Sahaya Expense Form
    const sahayaExpenseForm = document.getElementById('form-sahaya-expense');
    if (sahayaExpenseForm) {
      sahayaExpenseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const amount = Number(document.getElementById('sahaya-expense-amount').value);
        const beneficiaryOrCause = document.getElementById('sahaya-expense-cause').value;
        const date = document.getElementById('sahaya-expense-date').value;
        const notes = document.getElementById('sahaya-expense-notes').value;

        if (!amount || !beneficiaryOrCause) return;

        document.getElementById('modal-sahaya-expense').classList.add('hidden');
        this.showToast(`Recording SahayaNidhi charity disbursement...`, "info");

        await sheetsService.recordSahayaExpense({
          amount,
          beneficiaryOrCause,
          date,
          notes,
          updatedBy: this.currentUser.name
        });

        await this.refreshData();
        this.showToast(`Charity disbursement of ${amount} AED recorded!`, "success");
      });
    }

    // 5. Trigger Monthly Sahaya Form
    const triggerSahayaForm = document.getElementById('form-trigger-sahaya');
    if (triggerSahayaForm) {
      triggerSahayaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const monthName = document.getElementById('trigger-sahaya-month').value;
        const date = document.getElementById('trigger-sahaya-date').value || new Date().toISOString().split('T')[0];

        document.getElementById('modal-trigger-sahaya').classList.add('hidden');
        this.showToast(`Running compulsory 5 AED deduction for ${monthName}...`, "info");

        await sheetsService.triggerMonthlySahayaDeductions(monthName, date);
        await this.refreshData();
        this.showToast(`Compulsory 5 AED deduction recorded for all members!`, "success");
      });
    }

    // 6. Manual Transaction Form
    const manualTxForm = document.getElementById('form-manual-tx');
    if (manualTxForm) {
      manualTxForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const memberName = document.getElementById('manual-tx-member').value;
        const type = document.getElementById('manual-tx-type').value;
        const amount = Number(document.getElementById('manual-tx-amount').value);
        const date = document.getElementById('manual-tx-date').value;
        const notes = document.getElementById('manual-tx-notes').value;

        if (!memberName || !amount) return;

        document.getElementById('modal-manual-tx').classList.add('hidden');
        await sheetsService.addTransaction({
          memberName,
          type,
          amount,
          date,
          notes,
          updatedBy: this.currentUser.name
        });

        await this.refreshData();
        this.showToast("Transaction added to ledger!", "success");
      });
    }

    // 7. Edit Member Form
    const editMemberForm = document.getElementById('form-edit-member');
    if (editMemberForm) {
      editMemberForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const srNum = document.getElementById('edit-member-sr').value;
        const name = document.getElementById('edit-member-name').value;
        const ob = Number(document.getElementById('edit-member-ob').value);
        const phone = document.getElementById('edit-member-phone').value;
        const email = document.getElementById('edit-member-email').value;
        const type = document.getElementById('edit-member-type').value;

        document.getElementById('modal-edit-member').classList.add('hidden');
        this.showToast(`Updating ${name}...`, "info");

        await sheetsService.updateMember({
          srNum,
          name,
          ob,
          phone,
          email,
          type
        });

        await this.refreshData();
        this.showToast(`Member updated!`, "success");
      });
    }

    // 8. Settings Form
    const settingsForm = document.getElementById('form-save-settings');
    if (settingsForm) {
      settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = document.getElementById('settings-api-url').value;
        sheetsService.setApiUrl(url);

        document.getElementById('modal-settings').classList.add('hidden');
        this.showToast("Google Apps Script URL saved! Testing connection...", "info");

        await this.refreshData();
      });
    }

    // Test Connection Button in Settings
    const btnTestConnection = document.getElementById('btn-test-connection');
    if (btnTestConnection) {
      btnTestConnection.addEventListener('click', async () => {
        const testUrl = document.getElementById('settings-api-url').value;
        const statusDisplay = document.getElementById('settings-connection-status');
        statusDisplay.innerHTML = `<span class="text-xs text-amber-300">Connecting to Google Sheet...</span>`;

        const res = await sheetsService.testConnection(testUrl);
        if (res.success) {
          statusDisplay.innerHTML = `<span class="text-xs text-emerald-400 font-semibold">✓ Connection successful! Google Sheet responded with ${res.data?.members?.length || 0} members.</span>`;
        } else {
          statusDisplay.innerHTML = `<span class="text-xs text-rose-400 font-semibold">✕ Failed: ${res.message}</span>`;
        }
      });
    }

    // Reset Demo Data Button
    const btnResetData = document.getElementById('btn-reset-demo-data');
    if (btnResetData) {
      btnResetData.addEventListener('click', () => {
        if (confirm("Reset local cache to original starting state?")) {
          sheetsService.resetToDefaults();
          location.reload();
        }
      });
    }
  }

  exportTransactionsCSV() {
    if (this.state.transactions.length === 0) {
      this.showToast("No transactions to export", "error");
      return;
    }

    const headers = ["Date", "Member_Name", "Type", "Amount", "Updated By UserName", "Updated By Date", "Notes"];
    const rows = this.state.transactions.map(t => [
      `"${t.Date || t.date || ''}"`,
      `"${t.Member_Name || t.memberName || ''}"`,
      `"${t.Type || t.type || ''}"`,
      Number(t.Amount || t.amount || 0),
      `"${t.Updated_By_UserName || t['Updated By UserName'] || t.updatedBy || ''}"`,
      `"${t.Updated_By_Date || t['Updated By Date'] || t.updatedDate || ''}"`,
      `"${(t.Notes || t.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Avadhi_Nidhi_Transactions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast("Transactions CSV downloaded!", "success");
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const colorClasses = type === 'success'
      ? 'bg-emerald-600 text-white'
      : type === 'error'
      ? 'bg-rose-600 text-white'
      : 'bg-slate-800 text-slate-100 border border-slate-700';

    toast.className = `fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-2xl ${colorClasses} text-sm font-medium flex items-center space-x-2 transition-all transform duration-300 translate-y-10 opacity-0`;
    toast.innerHTML = `<span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.remove('translate-y-10', 'opacity-0');
    }, 10);

    setTimeout(() => {
      toast.classList.add('translate-y-10', 'opacity-0');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
}

// Instantiate and launch
document.addEventListener('DOMContentLoaded', () => {
  window.app = new AvadhiNidhiApp();
  window.app.init();
});
