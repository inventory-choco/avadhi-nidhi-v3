/**
 * Avadhi Nidhi V3 - Flagship Application Controller
 */

import { APP_CONFIG } from './config.js';
import { authService } from './auth.js';
import { sheetsService } from './sheetsService.js';
import {
  formatCurrency,
  formatDate,
  calculateEmergencyLoanDueDate,
  generateVacationLoanSchedule,
  validateVacationNotice,
  checkLoanQuota,
  computeMemberDues,
  calculateSmartAllocation,
  calculateFundSummary,
  buildMonthlyMatrix
} from './calculations.js';
import { ReceiptGenerator } from './receiptGenerator.js';
import { ReportsService } from './reports.js';

class AvadhiNidhiApp {
  constructor() {
    this.currentTab = 'dashboard';
    this.activePaymentsYear = 2026;
    this.theme = localStorage.getItem(APP_CONFIG.storageKeys.theme) || 'light';

    this.state = {
      members: [],
      transactions: [],
      loans: [],
      config: APP_CONFIG.defaults,
      sahayaNidhi: [],
      isOnline: false,
      isLoading: true,
      lastSynced: null
    };

    this.kpiValues = {
      cash: 0,
      savings: 0,
      sahaya: 0,
      loans: 0
    };

    this.txFilter = {
      search: '',
      type: 'ALL',
      member: 'ALL'
    };
  }

  async init() {
    this.applyTheme(this.theme);
    this.setupEventListeners();
    this.setupSyncIndicator();

    // Initialize Auth Service with state callback
    authService.init((user, unregisteredAttempt) => {
      this.handleAuthStateChange(user, unregisteredAttempt);
    });

    // Load Initial Data from Google Sheets / Cache
    await this.refreshData();
  }

  applyTheme(theme) {
    this.theme = theme;
    localStorage.setItem(APP_CONFIG.storageKeys.theme, theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    const themeIcon = document.getElementById('theme-toggle-icon');
    if (themeIcon) {
      themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
  }

  toggleTheme() {
    this.applyTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  setupSyncIndicator() {
    sheetsService.onSyncStatusChange((status, text) => {
      const badge = document.getElementById('sync-status-pill');
      if (!badge) return;

      if (status === 'syncing') {
        badge.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse mr-2"></span>
          <span class="text-xs text-amber-600 dark:text-amber-300 font-medium">${text}</span>
        `;
      } else if (status === 'synced') {
        badge.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-emerald-500 mr-2"></span>
          <span class="text-xs text-emerald-600 dark:text-emerald-400 font-medium">${text}</span>
        `;
      } else {
        badge.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-slate-400 mr-2"></span>
          <span class="text-xs text-slate-500 dark:text-slate-400 font-medium">${text}</span>
        `;
      }
    });
  }

  handleAuthStateChange(user, unregisteredAttempt = null) {
    const loginGate = document.getElementById('login-gate');
    const appShell = document.getElementById('app-main-shell');
    const adminNavTab = document.getElementById('tab-btn-admin');
    const userDisplay = document.getElementById('header-user-display');
    const userRoleBadge = document.getElementById('header-user-role-badge');
    const adminOnlyButtons = document.querySelectorAll('.admin-only-action');

    if (!user) {
      // Not logged in -> Show Login Gate, Hide App Shell
      if (loginGate) loginGate.classList.remove('hidden');
      if (appShell) appShell.classList.add('hidden');
      return;
    }

    // Authenticated! Hide Login Gate, Show App Shell
    if (loginGate) loginGate.classList.add('hidden');
    if (appShell) appShell.classList.remove('hidden');

    if (userDisplay) userDisplay.textContent = user.name;
    if (userRoleBadge) {
      userRoleBadge.textContent = user.type;
      userRoleBadge.className = user.type === 'Admin'
        ? 'px-2 py-0.5 text-[11px] font-bold rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
        : 'px-2 py-0.5 text-[11px] font-bold rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30';
    }

    // Strict RBAC: Admin Tab & Action Buttons visibility
    if (authService.isAdmin()) {
      if (adminNavTab) adminNavTab.classList.remove('hidden');
      adminOnlyButtons.forEach(btn => btn.classList.remove('hidden'));
    } else {
      if (adminNavTab) adminNavTab.classList.add('hidden');
      adminOnlyButtons.forEach(btn => btn.classList.add('hidden'));
      // If member was somehow on admin tab, switch to dashboard
      if (this.currentTab === 'admin') {
        this.switchTab('dashboard');
      }
    }

    this.render();
  }

  async refreshData() {
    this.state.isLoading = true;
    try {
      const result = await sheetsService.loadAll();
      this.state.members = result.members || [];
      this.state.transactions = result.transactions || [];
      this.state.loans = result.loans || [];
      this.state.config = result.config || APP_CONFIG.defaults;
      this.state.sahayaNidhi = result.sahayaNidhi || [];
      this.state.isOnline = result.isOnline;
      this.state.lastSynced = sheetsService.lastSynced;

      // Re-verify auth with fresh members list if user logged in
      const currentUser = authService.getCurrentUser();
      if (currentUser && currentUser.email) {
        authService.verifyAndLogin(currentUser.email, currentUser.name, currentUser.picture, this.state.members);
      }
    } catch (err) {
      console.error("Refresh error:", err);
      this.showToast("Failed to load data", "error");
    } finally {
      this.state.isLoading = false;
      this.render();
    }
  }

  setupEventListeners() {
    // Tab Switching
    document.querySelectorAll('[data-tab-target]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget.getAttribute('data-tab-target');
        this.switchTab(target);
      });
    });

    // Theme Toggle
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Refresh Live Data Button
    const refreshBtn = document.getElementById('btn-refresh-live');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        this.showToast("Refreshing live from Google Sheets...", "info");
        await this.refreshData();
        this.showToast("Google Sheets data updated!", "success");
      });
    }

    // Sign Out Button
    const signOutBtn = document.getElementById('btn-sign-out');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', () => {
        authService.signOut();
      });
    }

    // Retry Login Button on Error Box
    const retryAuthBtn = document.getElementById('btn-auth-retry');
    if (retryAuthBtn) {
      retryAuthBtn.addEventListener('click', () => {
        authService.retryLogin();
      });
    }

    // Modal Close Triggers
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.currentTarget.closest('.modal-overlay');
        if (modal) modal.classList.add('hidden');
      });
    });

    // Payments Year Switchers (2026 / 2027)
    const btnPay2026 = document.getElementById('btn-pay-year-2026');
    const btnPay2027 = document.getElementById('btn-pay-year-2027');
    if (btnPay2026 && btnPay2027) {
      btnPay2026.addEventListener('click', () => this.switchPaymentsYear(2026));
      btnPay2027.addEventListener('click', () => this.switchPaymentsYear(2027));
    }

    // Quick Action: Open Smart Payment Modal
    const btnOpenSmartPay = document.getElementById('btn-open-smart-payment');
    if (btnOpenSmartPay) {
      btnOpenSmartPay.addEventListener('click', () => this.openSmartPaymentModal());
    }

    // Quick Action: Open Issue Loan Modal
    const btnOpenIssueLoan = document.getElementById('btn-open-issue-loan');
    if (btnOpenIssueLoan) {
      btnOpenIssueLoan.addEventListener('click', () => this.openIssueLoanModal());
    }

    // Reports Suite Buttons
    const btnFullWhatsApp = document.getElementById('btn-full-whatsapp-report');
    if (btnFullWhatsApp) {
      btnFullWhatsApp.addEventListener('click', () => this.handleFullWhatsAppReport());
    }

    const btnMasterCSV = document.getElementById('btn-export-master-csv');
    if (btnMasterCSV) {
      btnMasterCSV.addEventListener('click', () => this.exportMasterReportCSV());
    }

    // Admin Tools Buttons
    const btnAddNewMember = document.getElementById('btn-admin-add-member');
    if (btnAddNewMember) {
      btnAddNewMember.addEventListener('click', () => this.openEditMemberModal());
    }

    const btnTriggerSahaya = document.getElementById('btn-admin-trigger-sahaya');
    if (btnTriggerSahaya) {
      btnTriggerSahaya.addEventListener('click', () => this.handleRunMonthlySahaya());
    }

    // Forms Setup
    this.setupForms();
  }

  switchTab(tabId) {
    if (tabId === 'admin' && !authService.isAdmin()) {
      this.showToast("Admin access required", "error");
      return;
    }

    this.currentTab = tabId;

    // Update Tab Navigation Buttons
    document.querySelectorAll('[data-tab-target]').forEach(btn => {
      const active = btn.getAttribute('data-tab-target') === tabId;
      if (active) {
        btn.classList.add('bg-emerald-600', 'text-white', 'shadow-sm');
        btn.classList.remove('text-slate-600', 'dark:text-slate-400', 'hover:bg-slate-100', 'dark:hover:bg-slate-800');
      } else {
        btn.classList.remove('bg-emerald-600', 'text-white', 'shadow-sm');
        btn.classList.add('text-slate-600', 'dark:text-slate-400', 'hover:bg-slate-100', 'dark:hover:bg-slate-800');
      }
    });

    // Show Active Panel
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.add('hidden'));
    const targetPanel = document.getElementById(`panel-${tabId}`);
    if (targetPanel) targetPanel.classList.remove('hidden');

    this.renderCurrentTab();
  }

  switchPaymentsYear(year) {
    this.activePaymentsYear = year;
    const btn2026 = document.getElementById('btn-pay-year-2026');
    const btn2027 = document.getElementById('btn-pay-year-2027');
    if (year === 2026) {
      btn2026.classList.add('bg-emerald-600', 'text-white');
      btn2026.classList.remove('bg-slate-100', 'dark:bg-slate-800', 'text-slate-700', 'dark:text-slate-300');
      btn2027.classList.remove('bg-emerald-600', 'text-white');
      btn2027.classList.add('bg-slate-100', 'dark:bg-slate-800', 'text-slate-700', 'dark:text-slate-300');
    } else {
      btn2027.classList.add('bg-emerald-600', 'text-white');
      btn2027.classList.remove('bg-slate-100', 'dark:bg-slate-800', 'text-slate-700', 'dark:text-slate-300');
      btn2026.classList.remove('bg-emerald-600', 'text-white');
      btn2026.classList.add('bg-slate-100', 'dark:bg-slate-800', 'text-slate-700', 'dark:text-slate-300');
    }
    this.renderMonthlyPayments();
  }

  render() {
    this.renderDashboardKPIs();
    this.renderCurrentTab();
  }

  renderDashboardKPIs() {
    const summary = calculateFundSummary(
      this.state.members,
      this.state.transactions,
      this.state.loans,
      this.state.sahayaNidhi
    );

    this.animateNumber('dash-kpi-cash', this.kpiValues.cash, summary.availableLiquidCash);
    this.animateNumber('dash-kpi-savings', this.kpiValues.savings, summary.totalMemberSavingsLiability);
    this.animateNumber('dash-kpi-sahaya', this.kpiValues.sahaya, summary.availableSahayaPool);
    this.animateNumber('dash-kpi-loans', this.kpiValues.loans, summary.activeLoansOutstanding);

    this.kpiValues = {
      cash: summary.availableLiquidCash,
      savings: summary.totalMemberSavingsLiability,
      sahaya: summary.availableSahayaPool,
      loans: summary.activeLoansOutstanding
    };
  }

  animateNumber(elementId, startVal, endVal) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const duration = 400; // ms
    const startTime = performance.now();

    const update = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + (endVal - startVal) * ease);

      el.textContent = `${current.toLocaleString()} AED`;

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        el.textContent = `${endVal.toLocaleString()} AED`;
      }
    };

    requestAnimationFrame(update);
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
      case 'reports':
        this.renderReports();
        break;
      case 'admin':
        this.renderAdminCenter();
        break;
    }
  }

  /**
   * 1. DASHBOARD VIEW
   */
  renderDashboard() {
    const memberSummaries = this.state.members.map(m =>
      computeMemberDues(m, this.state.transactions, this.state.loans, this.state.config)
    );

    // Personal Account Card for Logged In User
    const personalContainer = document.getElementById('dash-personal-card');
    const currentUser = authService.getCurrentUser();

    if (personalContainer && currentUser) {
      const mySummary = memberSummaries.find(m => m.name === currentUser.name) || memberSummaries[0];
      if (mySummary) {
        personalContainer.innerHTML = `
          <div class="p-6 rounded-2xl bg-gradient-to-r from-emerald-600/10 via-slate-50 to-white dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900 border border-emerald-500/30 shadow-md">
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div>
                <div class="flex items-center gap-2">
                  <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">YOUR ACCOUNT</span>
                  <span class="text-xs text-slate-500">Role: <strong>${currentUser.type}</strong></span>
                </div>
                <h3 class="text-2xl font-black text-slate-900 dark:text-white mt-1">${mySummary.name}</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Opening Balance: <strong>${formatCurrency(mySummary.ob)}</strong></p>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center sm:text-left">
                <div class="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
                  <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase">Current Savings</span>
                  <div class="text-lg font-bold ${mySummary.currentSavingsBalance < 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'} tabular-nums">
                    ${formatCurrency(mySummary.currentSavingsBalance)}
                  </div>
                </div>

                <div class="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
                  <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase">Sahaya Contributed</span>
                  <div class="text-lg font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    ${formatCurrency(mySummary.totalSahayaContributed)}
                  </div>
                </div>

                <div class="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
                  <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase">Active Loan Debt</span>
                  <div class="text-lg font-bold ${mySummary.totalOutstandingLoan > 0 ? 'text-amber-500' : 'text-slate-400'} tabular-nums">
                    ${mySummary.totalOutstandingLoan > 0 ? formatCurrency(mySummary.totalOutstandingLoan) : '0 AED'}
                  </div>
                </div>

                <div class="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
                  <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase">Grand Balance</span>
                  <div class="text-lg font-black ${mySummary.grandBalance < 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'} tabular-nums">
                    ${formatCurrency(mySummary.grandBalance)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      }
    }

    // Members Standing Table
    const tbody = document.getElementById('dash-members-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    memberSummaries.forEach(m => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 dark:hover:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 transition-colors text-sm';
      const isNegOB = m.ob < 0;
      const isNegSavings = m.currentSavingsBalance < 0;

      tr.innerHTML = `
        <td class="px-4 py-3 font-semibold text-slate-900 dark:text-white">${m.name}</td>
        <td class="px-4 py-3 ${isNegOB ? 'text-rose-500 font-bold' : 'text-slate-600 dark:text-slate-300'} tabular-nums">
          ${formatCurrency(m.ob)}
        </td>
        <td class="px-4 py-3 ${isNegSavings ? 'text-rose-500 font-bold' : 'text-emerald-600 dark:text-emerald-400 font-bold'} tabular-nums">
          ${formatCurrency(m.currentSavingsBalance)}
        </td>
        <td class="px-4 py-3 text-indigo-600 dark:text-indigo-400 font-medium tabular-nums">
          ${formatCurrency(m.totalSahayaContributed)}
        </td>
        <td class="px-4 py-3 tabular-nums">
          ${m.totalOutstandingLoan > 0
            ? `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400">${formatCurrency(m.totalOutstandingLoan)}</span>`
            : `<span class="text-xs text-slate-400">—</span>`
          }
        </td>
        <td class="px-4 py-3 font-black ${m.grandBalance < 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'} tabular-nums">
          ${formatCurrency(m.grandBalance)}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  /**
   * 2. MONTHLY PAYMENTS MATRIX VIEW (Legacy-Compatible with 2026/2027 Tabs)
   */
  renderMonthlyPayments() {
    const container = document.getElementById('monthly-matrix-container');
    if (!container) return;

    const matrix = buildMonthlyMatrix(this.state.members, this.state.transactions, this.activePaymentsYear);

    let theadHtml = `
      <tr class="bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
        <th class="px-3 py-3 sticky-col text-left">Member Name</th>
        <th class="px-3 py-3 text-center">OB (Dec-26)</th>
        ${matrix.months.map(m => `
          <th class="px-3 py-3 text-center ${m.key === matrix.currentMonthKey ? 'col-current-month' : ''}">${m.label}</th>
        `).join('')}
        <th class="px-3 py-3 text-center bg-slate-200 dark:bg-slate-700 font-bold">Total Paid</th>
        <th class="px-3 py-3 text-center bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-black">Net Total</th>
      </tr>
    `;

    let tbodyHtml = '';
    matrix.rows.forEach(r => {
      tbodyHtml += `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-xs">
          <td class="px-3 py-3 font-bold sticky-col text-slate-900 dark:text-white whitespace-nowrap">${r.name}</td>
          <td class="px-3 py-3 text-center ${r.ob < 0 ? 'text-rose-500 font-bold' : 'text-slate-600 dark:text-slate-300'} tabular-nums">${r.ob}</td>
          ${matrix.months.map(m => {
            const val = r.monthValues[m.key] || 0;
            const isCurrent = m.key === matrix.currentMonthKey;
            return `
              <td class="px-2 py-3 text-center tabular-nums ${isCurrent ? 'col-current-month' : ''}">
                ${val > 0
                  ? `<span class="inline-block px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">${val}</span>`
                  : `<span class="text-slate-300 dark:text-slate-700">0</span>`
                }
              </td>
            `;
          }).join('')}
          <td class="px-3 py-3 text-center font-bold text-slate-900 dark:text-slate-100 tabular-nums">${r.rowTotal}</td>
          <td class="px-3 py-3 text-center font-black ${r.netTotal < 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'} tabular-nums">${r.netTotal}</td>
        </tr>
      `;
    });

    // Bold Group Totals Row
    let tfootHtml = `
      <tr class="bg-slate-200 dark:bg-slate-800 font-black text-xs border-t-2 border-emerald-500">
        <td class="px-3 py-3 sticky-col text-slate-900 dark:text-white">GROUP TOTALS</td>
        <td class="px-3 py-3 text-center tabular-nums">${matrix.totalOB}</td>
        ${matrix.months.map(m => `
          <td class="px-2 py-3 text-center tabular-nums ${m.key === matrix.currentMonthKey ? 'col-current-month' : ''}">${matrix.colTotals[m.key]}</td>
        `).join('')}
        <td class="px-3 py-3 text-center text-emerald-600 dark:text-emerald-400 tabular-nums">${matrix.grandTotal - matrix.totalOB}</td>
        <td class="px-3 py-3 text-center text-emerald-600 dark:text-emerald-400 font-black tabular-nums">${matrix.grandTotal}</td>
      </tr>
    `;

    container.innerHTML = `
      <div class="table-matrix-wrapper border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <table class="table-matrix w-full border-collapse">
          <thead>${theadHtml}</thead>
          <tbody>${tbodyHtml}</tbody>
          <tfoot>${tfootHtml}</tfoot>
        </table>
      </div>
    `;
  }

  /**
   * 3. SAHAYANIDHI (CHARITY) VIEW
   */
  renderSahayaNidhi() {
    const summary = calculateFundSummary(
      this.state.members,
      this.state.transactions,
      this.state.loans,
      this.state.sahayaNidhi
    );

    const poolEl = document.getElementById('sahaya-tab-pool');
    const collectedEl = document.getElementById('sahaya-tab-collected');
    const disbursedEl = document.getElementById('sahaya-tab-disbursed');

    if (poolEl) poolEl.textContent = formatCurrency(summary.availableSahayaPool);
    if (collectedEl) collectedEl.textContent = formatCurrency(summary.totalSahayaCollected);
    if (disbursedEl) disbursedEl.textContent = formatCurrency(summary.totalSahayaDisbursed);

    // Ledger table
    const tbody = document.getElementById('sahaya-ledger-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const records = this.state.sahayaNidhi || [];
    if (records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400">No SahayaNidhi ledger records yet.</td></tr>`;
      return;
    }

    records.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-xs';
      const isDisbursed = r.Type === 'Charity Disbursement' || r.type === 'Charity Disbursement';

      tr.innerHTML = `
        <td class="px-3 py-2.5 text-slate-500">${formatDate(r.Date || r.date)}</td>
        <td class="px-3 py-2.5 font-bold ${isDisbursed ? 'text-rose-500' : 'text-indigo-600 dark:text-indigo-400'}">${r.Type || r.type}</td>
        <td class="px-3 py-2.5 text-slate-900 dark:text-white font-medium">${r.Member_Name || r.memberName || '—'}</td>
        <td class="px-3 py-2.5 font-black ${isDisbursed ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'} tabular-nums">
          ${isDisbursed ? '-' : '+'}${formatCurrency(r.Amount || r.amount)}
        </td>
        <td class="px-3 py-2.5 text-slate-600 dark:text-slate-300">${r.Beneficiary_Or_Cause || r.beneficiaryOrCause || '—'}</td>
        <td class="px-3 py-2.5 text-slate-400">${r.Notes || r.notes || '—'}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /**
   * 4. LOANS (EMERGENCY & VACATION) VIEW
   */
  renderLoans() {
    const activeContainer = document.getElementById('loans-active-cards');
    if (!activeContainer) return;
    activeContainer.innerHTML = '';

    const loans = this.state.loans || [];
    const activeLoans = loans.filter(l => (l.Status || l.status) !== 'Repaid');

    if (activeLoans.length === 0) {
      activeContainer.innerHTML = `
        <div class="col-span-full p-8 text-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
          <span class="text-3xl">🎉</span>
          <h4 class="text-base font-bold text-slate-900 dark:text-white mt-2">Zero Active Loans</h4>
          <p class="text-xs text-slate-500 mt-0.5">All community fund loans have been fully repaid!</p>
        </div>
      `;
      return;
    }

    activeLoans.forEach(l => {
      const principal = Number(l.Principal || l.principal || l.Amount || l.amount || 0);
      const repaid = Number(l.Repaid_Amount || l.repaidAmount || 0);
      const outstanding = Math.max(0, principal - repaid);
      const memberName = l.Member_Name || l.memberName;
      const loanType = l.Loan_Type || l.loanType || l.Type || l.type;
      const issueDate = l.Issue_Date || l.issueDate;
      const loanId = l.Loan_ID || l.loanId;

      let schedule = [];
      try {
        const rawSched = l.Schedule_JSON || l.scheduleJson;
        schedule = typeof rawSched === 'string' ? JSON.parse(rawSched) : (rawSched || []);
      } catch (e) {
        schedule = [];
      }

      // If vacation loan and schedule missing, auto-generate for visualization
      if (loanType === 'Vacation Loan' && schedule.length === 0) {
        schedule = generateVacationLoanSchedule(principal, issueDate);
      }

      const card = document.createElement('div');
      card.className = 'p-6 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between';

      // Build vacation installment timeline if available
      let timelineHtml = '';
      if (loanType === 'Vacation Loan' && schedule.length > 0) {
        timelineHtml = `
          <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60">
            <span class="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">7-Month Installment Schedule</span>
            <div class="grid grid-cols-7 gap-1 text-center">
              ${schedule.map((s, idx) => {
                const isGrace = s.isGracePeriod;
                return `
                  <div class="p-1.5 rounded-lg border ${isGrace ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700'}">
                    <span class="block text-[9px] font-bold text-slate-400">M${idx + 1}</span>
                    <span class="block text-[10px] font-extrabold ${isGrace ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400'}">${s.expectedAmount}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      card.innerHTML = `
        <div>
          <div class="flex items-center justify-between">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${loanType === 'Emergency Loan' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-blue-500/20 text-blue-600 dark:text-blue-400'}">
              ${loanType === 'Emergency Loan' ? '⚡ Emergency Loan' : '✈️ Vacation Loan'}
            </span>
            <span class="text-xs font-mono text-slate-400">${loanId}</span>
          </div>

          <h4 class="text-lg font-bold text-slate-900 dark:text-white mt-3">${memberName}</h4>
          <p class="text-xs text-slate-500">Issued: <strong>${formatDate(issueDate)}</strong></p>

          <div class="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <div>
              <span class="text-[10px] text-slate-400 uppercase block">Outstanding Debt</span>
              <span class="text-xl font-black text-rose-500 tabular-nums">${formatCurrency(outstanding)}</span>
            </div>
            <div class="text-right">
              <span class="text-[10px] text-slate-400 uppercase block">Principal</span>
              <span class="text-sm font-bold text-slate-700 dark:text-slate-300 tabular-nums">${formatCurrency(principal)}</span>
            </div>
          </div>

          ${timelineHtml}
        </div>

        <div class="mt-5 pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-end">
          ${authService.isAdmin() ? `
            <button class="btn-repay-trigger px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm" data-loan-id="${loanId}" data-member="${memberName}" data-outstanding="${outstanding}">
              Record Repayment
            </button>
          ` : ''}
        </div>
      `;

      activeContainer.appendChild(card);
    });

    // Wire up repayment triggers
    document.querySelectorAll('.btn-repay-trigger').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const lId = e.currentTarget.getAttribute('data-loan-id');
        const mem = e.currentTarget.getAttribute('data-member');
        const out = e.currentTarget.getAttribute('data-outstanding');
        this.openLoanRepayModal(lId, mem, out);
      });
    });
  }

  /**
   * 5. TRANSACTIONS VIEW (With 3x HD PNG Receipt Generator Trigger)
   */
  renderTransactions() {
    const tbody = document.getElementById('transactions-tbody');
    const memberFilter = document.getElementById('tx-filter-member');
    if (!tbody) return;

    // Populate filter dropdown once
    if (memberFilter && memberFilter.children.length <= 1) {
      memberFilter.innerHTML = '<option value="ALL">All Members</option>';
      this.state.members.forEach(m => {
        const name = m.Name || m.name;
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        memberFilter.appendChild(opt);
      });

      memberFilter.onchange = (e) => {
        this.txFilter.member = e.target.value;
        this.renderTransactions();
      };

      const typeFilter = document.getElementById('tx-filter-type');
      if (typeFilter) {
        typeFilter.onchange = (e) => {
          this.txFilter.type = e.target.value;
          this.renderTransactions();
        };
      }

      const searchInput = document.getElementById('tx-filter-search');
      if (searchInput) {
        searchInput.oninput = (e) => {
          this.txFilter.search = e.target.value.toLowerCase();
          this.renderTransactions();
        };
      }
    }

    let list = [...this.state.transactions];

    if (this.txFilter.member !== 'ALL') {
      list = list.filter(t => (t.Member_Name || t.memberName) === this.txFilter.member);
    }
    if (this.txFilter.type !== 'ALL') {
      list = list.filter(t => (t.Type || t.type) === this.txFilter.type);
    }
    if (this.txFilter.search) {
      list = list.filter(t => {
        const str = `${t.Member_Name || ''} ${t.Type || ''} ${t.Date || ''}`.toLowerCase();
        return str.includes(this.txFilter.search);
      });
    }

    tbody.innerHTML = '';
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400">No matching transactions found.</td></tr>`;
      return;
    }

    list.forEach(t => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-xs';

      const type = t.Type || t.type;
      const amt = Number(t.Amount || t.amount || 0);
      const isPositive = type === 'Monthly Payment' || type === 'SahayaNidhi' || type === 'Loan Repayment';
      const name = t.Member_Name || t.memberName;

      tr.innerHTML = `
        <td class="px-3 py-2.5 text-slate-500">${formatDate(t.Date || t.date)}</td>
        <td class="px-3 py-2.5 font-bold text-slate-900 dark:text-white">${name}</td>
        <td class="px-3 py-2.5 font-medium">${type}</td>
        <td class="px-3 py-2.5 font-black ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'} tabular-nums">
          ${isPositive ? '+' : '-'}${formatCurrency(amt)}
        </td>
        <td class="px-3 py-2.5 text-slate-500">${t.Updated_By_UserName || t['Updated By UserName'] || t.updatedBy || '—'}</td>
        <td class="px-3 py-2.5 text-slate-400">${t.Updated_By_Date || t['Updated By Date'] || t.updatedDate || '—'}</td>
        <td class="px-3 py-2.5 text-right">
          <button class="btn-download-receipt-row px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 inline-flex transition-colors" data-member="${name}" data-amount="${amt}" data-type="${type}" data-date="${t.Date || t.date}">
            <span>🧾</span><span>Receipt</span>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Wire up receipt buttons
    document.querySelectorAll('.btn-download-receipt-row').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const mem = e.currentTarget.getAttribute('data-member');
        const amt = e.currentTarget.getAttribute('data-amount');
        const type = e.currentTarget.getAttribute('data-type');
        const date = e.currentTarget.getAttribute('data-date');

        this.showToast(`Generating Retina HD Receipt for ${mem}...`, 'info');
        const res = await ReceiptGenerator.generateReceipt({
          amount: amt,
          memberName: mem,
          date: date,
          allocations: [{ type: type, amount: amt, label: type }],
          adminName: authService.getCurrentUser()?.name || 'Admin'
        });

        if (res.success) {
          this.showToast(`Downloaded: ${res.filename}`, 'success');
        } else {
          this.showToast("Receipt generation failed", "error");
        }
      });
    });
  }

  /**
   * 6. MEMBERS DIRECTORY VIEW
   */
  renderMembers() {
    const container = document.getElementById('members-cards-container');
    if (!container) return;
    container.innerHTML = '';

    const memberSummaries = this.state.members.map(m =>
      computeMemberDues(m, this.state.transactions, this.state.loans, this.state.config)
    );

    memberSummaries.forEach(m => {
      const card = document.createElement('div');
      card.className = 'p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between';

      card.innerHTML = `
        <div>
          <div class="flex items-center justify-between">
            <span class="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 font-bold text-xs flex items-center justify-center text-slate-700 dark:text-slate-300">
              ${m.srNum || '•'}
            </span>
            <span class="px-2 py-0.5 rounded-full text-xs font-bold ${m.type === 'Admin' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}">
              ${m.type || 'Member'}
            </span>
          </div>

          <h4 class="text-base font-bold text-slate-900 dark:text-white mt-3">${m.name}</h4>
          ${m.email ? `<p class="text-xs text-slate-500 mt-0.5">✉️ ${m.email}</p>` : ''}
          ${m.phone ? `<p class="text-xs text-slate-500">📞 ${m.phone}</p>` : ''}

          <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 space-y-2 text-xs">
            <div class="flex justify-between">
              <span class="text-slate-500">Opening Balance:</span>
              <span class="font-bold ${m.ob < 0 ? 'text-rose-500' : 'text-slate-700 dark:text-slate-300'} tabular-nums">${formatCurrency(m.ob)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Net Savings:</span>
              <span class="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">${formatCurrency(m.currentSavingsBalance)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Sahaya Contributed:</span>
              <span class="font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">${formatCurrency(m.totalSahayaContributed)}</span>
            </div>
            ${m.totalOutstandingLoan > 0 ? `
              <div class="flex justify-between text-amber-600 dark:text-amber-400 font-bold">
                <span>Active Loan Debt:</span>
                <span class="tabular-nums">${formatCurrency(m.totalOutstandingLoan)}</span>
              </div>
            ` : ''}
            <div class="flex justify-between pt-1 border-t border-slate-100 dark:border-slate-700 font-black">
              <span>Grand Balance:</span>
              <span class="${m.grandBalance < 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'} tabular-nums">${formatCurrency(m.grandBalance)}</span>
            </div>
          </div>
        </div>
      `;

      container.appendChild(card);
    });
  }

  /**
   * 7. REPORTS VIEW
   */
  renderReports() {
    const summary = calculateFundSummary(
      this.state.members,
      this.state.transactions,
      this.state.loans,
      this.state.sahayaNidhi
    );
    const memberSummaries = this.state.members.map(m =>
      computeMemberDues(m, this.state.transactions, this.state.loans, this.state.config)
    );

    const reportText = ReportsService.generateWhatsAppTextReport(this.state.members, memberSummaries, summary);
    const previewArea = document.getElementById('whatsapp-report-preview');
    if (previewArea) {
      previewArea.value = reportText;
    }
  }

  async handleFullWhatsAppReport() {
    const summary = calculateFundSummary(
      this.state.members,
      this.state.transactions,
      this.state.loans,
      this.state.sahayaNidhi
    );
    const memberSummaries = this.state.members.map(m =>
      computeMemberDues(m, this.state.transactions, this.state.loans, this.state.config)
    );

    this.showToast("Generating Full Report Snapshot...", "info");
    const res = await ReportsService.generateVisualReportSnapshot(memberSummaries, summary, `${this.activePaymentsYear}`);
    if (res.success) {
      this.showToast("Finalized Report Image Downloaded!", "success");
    } else {
      this.showToast("Generation failed", "error");
    }
  }

  exportMasterReportCSV() {
    const memberSummaries = this.state.members.map(m =>
      computeMemberDues(m, this.state.transactions, this.state.loans, this.state.config)
    );
    ReportsService.exportMasterCSV(memberSummaries);
    this.showToast("Master Report CSV Downloaded!", "success");
  }

  /**
   * 8. ADMIN CONTROL CENTER VIEW (Strictly Admin Only)
   */
  renderAdminCenter() {
    if (!authService.isAdmin()) return;

    // Config inputs
    const maxLoanInput = document.getElementById('admin-cfg-max-loan');
    const monthlyShareInput = document.getElementById('admin-cfg-monthly-share');
    const sahayaMonthlyInput = document.getElementById('admin-cfg-sahaya-monthly');

    if (maxLoanInput) maxLoanInput.value = this.state.config.Max_Loan_Amount || 2500;
    if (monthlyShareInput) monthlyShareInput.value = this.state.config.Monthly_Share || 100;
    if (sahayaMonthlyInput) sahayaMonthlyInput.value = this.state.config.SahayaNidhi_Monthly || 5;

    // Admin Member Table
    const tbody = document.getElementById('admin-members-tbody');
    if (tbody) {
      tbody.innerHTML = '';
      this.state.members.forEach(m => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-200 dark:border-slate-800 text-xs';
        tr.innerHTML = `
          <td class="px-3 py-2 font-bold">${m['Sr. Num'] || m.srNum}</td>
          <td class="px-3 py-2 font-bold text-slate-900 dark:text-white">${m.Name || m.name}</td>
          <td class="px-3 py-2 tabular-nums">${m['OB from Dec-2026'] || m.ob || 0}</td>
          <td class="px-3 py-2 text-slate-500">${m.Email || m.email || '—'}</td>
          <td class="px-3 py-2 text-slate-500">${m.Phone || m.phone || '—'}</td>
          <td class="px-3 py-2 font-bold ${m.Type === 'Admin' ? 'text-emerald-500' : 'text-slate-600 dark:text-slate-400'}">${m.Type || m.type || 'Member'}</td>
          <td class="px-3 py-2 text-right">
            <button class="btn-edit-member-admin text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline" data-sr="${m['Sr. Num'] || m.srNum}">Edit</button>
          </td>
        `;
        tbody.appendChild(tr);
      });

      document.querySelectorAll('.btn-edit-member-admin').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const sr = e.currentTarget.getAttribute('data-sr');
          const found = this.state.members.find(m => (m['Sr. Num'] || m.srNum) == sr);
          if (found) this.openEditMemberModal(found);
        });
      });
    }
  }

  /**
   * MODALS & ACTIONS
   */
  openSmartPaymentModal() {
    if (!authService.isAdmin()) {
      this.showToast("Admin access required", "error");
      return;
    }

    const modal = document.getElementById('modal-smart-payment');
    const select = document.getElementById('smart-pay-member-select');
    const amountInput = document.getElementById('smart-pay-amount');
    const dateInput = document.getElementById('smart-pay-date');
    const breakdownContainer = document.getElementById('smart-pay-breakdown-card');

    if (!modal) return;

    // Fill members dropdown
    select.innerHTML = '<option value="">Select Member...</option>';
    this.state.members.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.Name || m.name;
      opt.textContent = m.Name || m.name;
      select.appendChild(opt);
    });

    amountInput.value = 105;
    dateInput.value = new Date().toISOString().split('T')[0];

    const updateBreakdown = () => {
      const memberName = select.value;
      const amt = Number(amountInput.value) || 0;

      if (!memberName) {
        breakdownContainer.innerHTML = `<div class="p-3 text-xs text-slate-400 text-center">Select a member to preview smart allocation</div>`;
        return;
      }

      const targetMember = this.state.members.find(m => (m.Name || m.name) === memberName);
      const dues = computeMemberDues(targetMember, this.state.transactions, this.state.loans, this.state.config);
      const alloc = calculateSmartAllocation(amt, dues);

      breakdownContainer.innerHTML = `
        <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <div class="flex justify-between items-center text-xs">
            <span class="text-slate-500">Member Status:</span>
            <span class="font-bold text-slate-700 dark:text-slate-300">Savings: ${formatCurrency(dues.currentSavingsBalance)} | Loan: ${formatCurrency(dues.totalOutstandingLoan)}</span>
          </div>
          <div class="waterfall-progress-bar">
            <div style="width:${(alloc.allocSahaya / amt) * 100}%; background:#818cf8;" title="SahayaNidhi"></div>
            <div style="width:${(alloc.allocMonthly / amt) * 100}%; background:#10b981;" title="Monthly Savings"></div>
            <div style="width:${(alloc.allocLoan / amt) * 100}%; background:#38bdf8;" title="Loan Repayment"></div>
          </div>
          <div class="space-y-1 pt-1 text-xs">
            <div class="flex justify-between">
              <span class="text-indigo-600 dark:text-indigo-400 font-semibold">1. SahayaNidhi Charity:</span>
              <span class="font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">+${formatCurrency(alloc.allocSahaya)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-emerald-600 dark:text-emerald-400 font-semibold">2. Monthly Savings Share:</span>
              <span class="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">+${formatCurrency(alloc.allocMonthly)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-sky-600 dark:text-sky-400 font-semibold">3. Loan Repayment:</span>
              <span class="font-bold text-sky-600 dark:text-sky-400 tabular-nums">+${formatCurrency(alloc.allocLoan)}</span>
            </div>
          </div>
        </div>
      `;
    };

    select.onchange = updateBreakdown;
    amountInput.oninput = updateBreakdown;
    updateBreakdown();

    modal.classList.remove('hidden');
  }

  openIssueLoanModal() {
    if (!authService.isAdmin()) {
      this.showToast("Admin access required", "error");
      return;
    }

    const modal = document.getElementById('modal-issue-loan');
    const select = document.getElementById('loan-issue-member-select');
    const typeSelect = document.getElementById('loan-issue-type');
    const amountInput = document.getElementById('loan-issue-amount');
    const reqDateInput = document.getElementById('loan-issue-req-date');
    const issueDateInput = document.getElementById('loan-issue-date');
    const neededDateInput = document.getElementById('loan-issue-needed-date');
    const vacationNoticeGroup = document.getElementById('loan-issue-vacation-group');
    const dueDateDisplay = document.getElementById('loan-issue-due-display');
    const quotaWarning = document.getElementById('loan-issue-quota-warning');

    if (!modal) return;

    select.innerHTML = '<option value="">Select Member...</option>';
    this.state.members.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.Name || m.name;
      opt.textContent = m.Name || m.name;
      select.appendChild(opt);
    });

    const todayStr = new Date().toISOString().split('T')[0];
    reqDateInput.value = todayStr;
    issueDateInput.value = todayStr;
    amountInput.value = 1000;

    const refreshFields = () => {
      const mem = select.value;
      const type = typeSelect.value;
      const issueDate = issueDateInput.value;
      const reqDate = reqDateInput.value;
      const needDate = neededDateInput.value;

      if (type === 'Vacation Loan') {
        vacationNoticeGroup.classList.remove('hidden');
        if (needDate) {
          const notice = validateVacationNotice(reqDate, needDate);
          if (!notice.isValid) {
            quotaWarning.innerHTML = `⚠️ Vacation Loan requires minimum 25 days notice! Currently: ${notice.daysNotice} days.`;
            quotaWarning.className = 'p-3 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-500 border border-rose-500/30 block';
          } else {
            quotaWarning.className = 'hidden';
          }
        }
        dueDateDisplay.textContent = "7-Month Schedule with 2-Month Grace Period";
      } else {
        vacationNoticeGroup.classList.add('hidden');
        const due = calculateEmergencyLoanDueDate(issueDate);
        dueDateDisplay.textContent = `${formatDate(due)} (End of Next Month)`;
      }

      if (mem) {
        const quota = checkLoanQuota(this.state.loans, mem, type, new Date(issueDate).getFullYear());
        if (!quota.isEligible) {
          quotaWarning.innerHTML = `⚠️ ${mem} has ALREADY availed 1 ${type} in ${quota.year}! Limit is 1 per calendar year.`;
          quotaWarning.className = 'p-3 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/30 block';
        } else if (type !== 'Vacation Loan') {
          quotaWarning.className = 'hidden';
        }
      }
    };

    select.onchange = refreshFields;
    typeSelect.onchange = refreshFields;
    issueDateInput.onchange = refreshFields;
    reqDateInput.onchange = refreshFields;
    neededDateInput.onchange = refreshFields;

    refreshFields();
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

  openEditMemberModal(member = null) {
    const modal = document.getElementById('modal-edit-member');
    if (!modal) return;

    document.getElementById('edit-member-sr').value = member ? (member['Sr. Num'] || member.srNum) : '';
    document.getElementById('edit-member-name').value = member ? (member.Name || member.name) : '';
    document.getElementById('edit-member-ob').value = member ? (member['OB from Dec-2026'] || member.ob || 0) : 500;
    document.getElementById('edit-member-email').value = member ? (member.Email || member.email || '') : '';
    document.getElementById('edit-member-phone').value = member ? (member.Phone || member.phone || '') : '';
    document.getElementById('edit-member-type').value = member ? (member.Type || member.type || 'Member') : 'Member';

    modal.classList.remove('hidden');
  }

  setupForms() {
    // 1. Smart Payment Form
    const payForm = document.getElementById('form-smart-payment');
    if (payForm) {
      payForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const memberName = document.getElementById('smart-pay-member-select').value;
        const totalAmount = Number(document.getElementById('smart-pay-amount').value);
        const date = document.getElementById('smart-pay-date').value;

        if (!memberName || !totalAmount) return;

        const targetMember = this.state.members.find(m => (m.Name || m.name) === memberName);
        const dues = computeMemberDues(targetMember, this.state.transactions, this.state.loans, this.state.config);
        const alloc = calculateSmartAllocation(totalAmount, dues);

        document.getElementById('modal-smart-payment').classList.add('hidden');
        this.showToast(`Recording payment for ${memberName}...`, 'info');

        const adminName = authService.getCurrentUser()?.name || 'Admin';

        // Save to Google Sheets
        await sheetsService.recordSmartPayment({
          memberName,
          totalAmount,
          date,
          updatedBy: adminName,
          allocations: alloc.allocations
        });

        // Trigger Automatic HD PNG Receipt Download
        const updatedDues = computeMemberDues(targetMember, this.state.transactions, this.state.loans, this.state.config);
        await ReceiptGenerator.generateReceipt({
          amount: totalAmount,
          memberName,
          date,
          adminName,
          allocations: alloc.allocations,
          newSavingsBalance: updatedDues.currentSavingsBalance + alloc.allocMonthly,
          remainingLoan: Math.max(0, updatedDues.totalOutstandingLoan - alloc.allocLoan)
        });

        await this.refreshData();
        this.showToast("Payment recorded & WhatsApp receipt generated!", "success");
      });
    }

    // 2. Issue Loan Form
    const loanForm = document.getElementById('form-issue-loan');
    if (loanForm) {
      loanForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const memberName = document.getElementById('loan-issue-member-select').value;
        const loanType = document.getElementById('loan-issue-type').value;
        const principal = Number(document.getElementById('loan-issue-amount').value);
        const requestDate = document.getElementById('loan-issue-req-date').value;
        const issueDate = document.getElementById('loan-issue-date').value;
        const neededDate = document.getElementById('loan-issue-needed-date').value;
        const maxLoan = Number(this.state.config.Max_Loan_Amount || 2500);

        if (principal > maxLoan) {
          this.showToast(`Max loan limit is ${maxLoan} AED`, 'error');
          return;
        }

        if (loanType === 'Vacation Loan') {
          const notice = validateVacationNotice(requestDate, neededDate);
          if (!notice.isValid) {
            this.showToast("Vacation Loan requires minimum 25 days notice!", "error");
            return;
          }
        }

        const schedule = loanType === 'Vacation Loan'
          ? generateVacationLoanSchedule(principal, issueDate)
          : [];

        document.getElementById('modal-issue-loan').classList.add('hidden');
        this.showToast(`Issuing ${loanType}...`, 'info');

        await sheetsService.issueLoan({
          memberName,
          loanType,
          principal,
          requestDate,
          issueDate,
          scheduleJson: schedule,
          updatedBy: authService.getCurrentUser()?.name || 'Admin'
        });

        await this.refreshData();
        this.showToast(`${loanType} issued successfully!`, 'success');
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

        document.getElementById('modal-repay-loan').classList.add('hidden');
        this.showToast("Recording loan repayment...", "info");

        await sheetsService.repayLoan({
          loanId,
          memberName,
          amount,
          date,
          updatedBy: authService.getCurrentUser()?.name || 'Admin'
        });

        await this.refreshData();
        this.showToast("Loan repayment recorded!", "success");
      });
    }

    // 4. Edit Member Form
    const memberForm = document.getElementById('form-edit-member');
    if (memberForm) {
      memberForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const srNum = document.getElementById('edit-member-sr').value;
        const name = document.getElementById('edit-member-name').value;
        const ob = Number(document.getElementById('edit-member-ob').value);
        const email = document.getElementById('edit-member-email').value;
        const phone = document.getElementById('edit-member-phone').value;
        const type = document.getElementById('edit-member-type').value;

        document.getElementById('modal-edit-member').classList.add('hidden');
        this.showToast(`Saving ${name}...`, 'info');

        await sheetsService.updateMember({
          srNum,
          name,
          ob,
          email,
          phone,
          type
        });

        await this.refreshData();
        this.showToast("Member updated successfully!", "success");
      });
    }

    // 5. Config Form
    const configForm = document.getElementById('form-admin-config');
    if (configForm) {
      configForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const maxLoan = document.getElementById('admin-cfg-max-loan').value;
        const monthlyShare = document.getElementById('admin-cfg-monthly-share').value;
        const sahayaMonthly = document.getElementById('admin-cfg-sahaya-monthly').value;

        this.showToast("Saving fund configuration...", "info");
        await sheetsService.updateConfig({
          Max_Loan_Amount: maxLoan,
          Monthly_Share: monthlyShare,
          SahayaNidhi_Monthly: sahayaMonthly
        });

        await this.refreshData();
        this.showToast("Config updated in Google Sheets!", "success");
      });
    }

    // 6. Copy WhatsApp Report button
    const copyReportBtn = document.getElementById('btn-copy-whatsapp-text');
    if (copyReportBtn) {
      copyReportBtn.addEventListener('click', async () => {
        const preview = document.getElementById('whatsapp-report-preview');
        if (preview && preview.value) {
          await ReportsService.copyToClipboard(preview.value);
          this.showToast("Copied WhatsApp Report to clipboard!", "success");
        }
      });
    }

    // 7. Download .txt Report button
    const downloadTxtBtn = document.getElementById('btn-download-report-txt');
    if (downloadTxtBtn) {
      downloadTxtBtn.addEventListener('click', () => {
        const preview = document.getElementById('whatsapp-report-preview');
        if (preview && preview.value) {
          ReportsService.downloadTextFile(preview.value, `AvadhiNidhi_Report_${new Date().toISOString().split('T')[0]}.txt`);
          this.showToast("Report text file downloaded!", "success");
        }
      });
    }
  }

  async handleRunMonthlySahaya() {
    if (!confirm("Run 5 AED monthly SahayaNidhi deduction check across all members?")) return;
    this.showToast("Verifying monthly 5 AED deductions...", "info");
    await sheetsService.runMonthlySahaya();
    await this.refreshData();
    this.showToast("Monthly deductions synchronized!", "success");
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const color = type === 'success' ? 'bg-emerald-600 text-white' : type === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white border border-slate-700';
    toast.className = `fixed bottom-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-xl ${color} text-xs font-bold flex items-center gap-2 transform transition-all duration-200 translate-y-8 opacity-0`;
    toast.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span><span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.remove('translate-y-8', 'opacity-0');
    }, 10);

    setTimeout(() => {
      toast.classList.add('translate-y-8', 'opacity-0');
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }
}

// Launch on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new AvadhiNidhiApp();
  window.app.init();
});
