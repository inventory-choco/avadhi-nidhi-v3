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
  buildMonthlyMatrix,
  computeLoanPriorityList,
  getMonthColValue
} from './calculations.js';
import { REFERENCE_PAYMENTS_2026, REFERENCE_LOANS_2026 } from './data.js';
import { ReceiptGenerator } from './receiptGenerator.js';
import { ReportsService } from './reports.js';

class AvadhiNidhiApp {
  constructor() {
    this.currentTab = 'dashboard';
    this.activePaymentsYear = 2026;
    this.activeReportsMonth = 'Dec-2026';
    this.theme = localStorage.getItem(APP_CONFIG.storageKeys.theme) || 'light';

    this.state = {
      members: [],
      transactions: [],
      loans: [],
      config: APP_CONFIG.defaults,
      sahayaNidhi: [],
      payments2026: REFERENCE_PAYMENTS_2026,
      loans2026: REFERENCE_LOANS_2026,
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

    // Hydrate instantly from cache for 0ms startup
    const cached = sheetsService.getCachedState();
    if (cached.members && cached.members.length > 0) {
      this.state.members = cached.members;
      this.state.transactions = cached.transactions || [];
      this.state.loans = cached.loans || [];
      this.state.config = cached.config || APP_CONFIG.defaults;
      this.state.sahayaNidhi = cached.sahayaNidhi || [];
      if (cached.payments2026?.length) this.state.payments2026 = cached.payments2026;
      if (cached.loans2026?.length) this.state.loans2026 = cached.loans2026;
    }

    // Initialize Auth Service with state callback
    authService.init((user, unregisteredAttempt) => {
      this.handleAuthStateChange(user, unregisteredAttempt);
    });

    // Background live sync from Google Sheets
    await this.refreshData();
  }

  isCurrentUser(name) {
    const u = authService.getCurrentUser();
    if (!u || !u.name || !name) return false;
    return String(u.name).trim().toLowerCase() === String(name).trim().toLowerCase();
  }

  youBadge(name) {
    return this.isCurrentUser(name)
      ? `<span class="ml-1.5 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 text-[9px] font-extrabold uppercase tracking-wider border border-emerald-500/30">You</span>`
      : '';
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
          <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse mr-1.5 sm:mr-2 shrink-0"></span>
          <span class="text-[11px] sm:text-xs text-amber-600 dark:text-amber-300 font-medium whitespace-nowrap"><span class="sm:hidden">Syncing</span><span class="hidden sm:inline">${text}</span></span>
        `;
      } else if (status === 'synced') {
        badge.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 sm:mr-2 shrink-0"></span>
          <span class="text-[11px] sm:text-xs text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap"><span class="sm:hidden">Synced</span><span class="hidden sm:inline">${text}</span></span>
        `;
      } else {
        badge.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-slate-400 mr-1.5 sm:mr-2 shrink-0"></span>
          <span class="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap"><span class="sm:hidden">Offline</span><span class="hidden sm:inline">${text}</span></span>
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
      this.state.payments2026 = (result.payments2026 && result.payments2026.length > 0) ? result.payments2026 : REFERENCE_PAYMENTS_2026;
      this.state.loans2026 = (result.loans2026 && result.loans2026.length > 0) ? result.loans2026 : REFERENCE_LOANS_2026;
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

    // Member & Admin: Open Loan Request Modal
    const btnReqLoan = document.getElementById('btn-open-request-loan');
    if (btnReqLoan) {
      btnReqLoan.addEventListener('click', () => this.openRequestLoanModal());
    }
    const btnReqLoanDash = document.getElementById('btn-open-request-loan-dash');
    if (btnReqLoanDash) {
      btnReqLoanDash.addEventListener('click', () => this.openRequestLoanModal());
    }

    // Reports Suite Controls
    const reportMonthSelect = document.getElementById('report-month-select');
    if (reportMonthSelect) {
      reportMonthSelect.addEventListener('change', (e) => {
        this.activeReportsMonth = e.target.value;
        this.renderReports();
      });
    }

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

    // Forms Setup
    this.setupForms();
  }

  switchTab(tabId) {
    if (tabId === 'admin' && !authService.isAdmin()) {
      this.showToast("Admin access required", "error");
      return;
    }

    this.currentTab = tabId;

    // Update Tab Navigation Buttons (desktop top tabs + mobile bottom bar)
    document.querySelectorAll('[data-tab-target]').forEach(btn => {
      const active = btn.getAttribute('data-tab-target') === tabId;
      if (btn.classList.contains('mobile-nav-btn')) {
        if (active) {
          btn.classList.add('text-emerald-600', 'dark:text-emerald-400');
          btn.classList.remove('text-slate-500', 'dark:text-slate-400');
        } else {
          btn.classList.remove('text-emerald-600', 'dark:text-emerald-400');
          btn.classList.add('text-slate-500', 'dark:text-slate-400');
        }
      } else {
        if (active) {
          btn.classList.add('bg-emerald-600', 'text-white', 'shadow-sm');
          btn.classList.remove('text-slate-600', 'dark:text-slate-400', 'hover:bg-slate-100', 'dark:hover:bg-slate-800');
        } else {
          btn.classList.remove('bg-emerald-600', 'text-white', 'shadow-sm');
          btn.classList.add('text-slate-600', 'dark:text-slate-400', 'hover:bg-slate-100', 'dark:hover:bg-slate-800');
        }
      }
    });

    // Show Active Panel
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.add('hidden'));
    const targetPanel = document.getElementById(`panel-${tabId}`);
    if (targetPanel) targetPanel.classList.remove('hidden');

    if (window.innerWidth < 640) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

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
      const isMe = this.isCurrentUser(m.name);
      tr.className = `${isMe ? 'bg-emerald-50/90 dark:bg-emerald-950/35 ring-1 ring-inset ring-emerald-500/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'} border-b border-slate-200 dark:border-slate-800 transition-colors text-xs sm:text-sm whitespace-nowrap`;
      const isNegOB = m.ob < 0;
      const isNegSavings = m.currentSavingsBalance < 0;

      tr.innerHTML = `
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 font-semibold sticky left-0 z-10 ${isMe ? 'bg-emerald-50 dark:bg-emerald-950/95 text-emerald-700 dark:text-emerald-300' : 'bg-white dark:bg-[#111a2e] text-slate-900 dark:text-white'} shadow-[2px_0_5px_rgba(0,0,0,0.05)]">${m.name}${this.youBadge(m.name)}</td>
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 ${isNegOB ? 'text-rose-500 font-bold' : 'text-slate-600 dark:text-slate-300'} tabular-nums">
          ${formatCurrency(m.ob)}
        </td>
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 ${isNegSavings ? 'text-rose-500 font-bold' : 'text-emerald-600 dark:text-emerald-400 font-bold'} tabular-nums">
          ${formatCurrency(m.currentSavingsBalance)}
        </td>
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 text-indigo-600 dark:text-indigo-400 font-medium tabular-nums">
          ${formatCurrency(m.totalSahayaContributed)}
        </td>
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 tabular-nums">
          ${m.totalOutstandingLoan > 0
            ? `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400">${formatCurrency(m.totalOutstandingLoan)}</span>`
            : `<span class="text-xs text-slate-400">—</span>`
          }
        </td>
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 font-black ${m.grandBalance < 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'} tabular-nums">
          ${formatCurrency(m.grandBalance)}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  /**
   * 2. MONTHLY PAYMENTS MATRIX VIEW (2026 Historical Sheet + 2027 Live Matrix)
   */
  renderMonthlyPayments() {
    const container = document.getElementById('monthly-matrix-container');
    if (!container) return;

    // For 2026, display the 2026_monthly_Payments sheet (with Nov settlement adjustments -> OB Nov-26)
    if (this.activePaymentsYear === 2026 && this.state.payments2026 && this.state.payments2026.length > 0) {
      const rows = this.state.payments2026;
      const monthCols = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const colTotals = { OB: 0, TotalPaid: 0 };
      monthCols.forEach(m => { colTotals[m] = 0; });

      const tbodyHtml = rows.map(r => {
        const name = r.Name || r.name || '';
        const ob = Number(r.OB || 0);
        const totalPaid = Number(r['Total Paid'] ?? r.totalPaid ?? 0);
        colTotals.OB += ob;
        colTotals.TotalPaid += totalPaid;

        const cellsHtml = monthCols.map(m => {
          const val = Number(r[m] || 0);
          colTotals[m] += val;
          if (val < 0) {
            return `<td class="px-2 py-3 text-center tabular-nums"><span class="inline-block px-1.5 py-0.5 rounded text-[11px] font-bold bg-rose-500/15 text-rose-500">${val}</span></td>`;
          }
          if (val > 0) {
            return `<td class="px-2 py-3 text-center tabular-nums"><span class="inline-block px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">${val}</span></td>`;
          }
          return `<td class="px-2 py-3 text-center tabular-nums"><span class="text-slate-300 dark:text-slate-700">—</span></td>`;
        }).join('');

        const isMe = this.isCurrentUser(name);
        return `
          <tr class="${isMe ? 'bg-emerald-50/90 dark:bg-emerald-950/35' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'} border-b border-slate-200 dark:border-slate-800 text-xs">
            <td class="px-3 py-3 font-bold sticky-col ${isMe ? '!bg-emerald-50 dark:!bg-emerald-950 text-emerald-700 dark:text-emerald-300' : 'text-slate-900 dark:text-white'} whitespace-nowrap">${name}${this.youBadge(name)}</td>
            <td class="px-3 py-3 text-center font-semibold text-slate-600 dark:text-slate-300 tabular-nums">${ob}</td>
            ${cellsHtml}
            <td class="px-3 py-3 text-center font-black ${totalPaid < 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'} tabular-nums">${totalPaid}</td>
          </tr>
        `;
      }).join('');

      container.innerHTML = `
        <div class="mb-3 px-4 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-300 flex items-center gap-2">
          <span>ℹ️</span>
          <span><strong>2026 Historical Ledger (2026_monthly_Payments):</strong> Negative Nov figures reflect cash payouts or loan balance settlements carried into <strong>OB (Nov-26)</strong>.</span>
        </div>
        <div class="table-matrix-wrapper border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <table class="table-matrix w-full border-collapse">
            <thead>
              <tr class="bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                <th class="px-3 py-3 sticky-col text-left">Member Name</th>
                <th class="px-3 py-3 text-center">OB (2026)</th>
                ${monthCols.map(m => `<th class="px-3 py-3 text-center ${m === 'Nov' ? 'text-rose-500 font-bold' : ''}">${m}</th>`).join('')}
                <th class="px-3 py-3 text-center bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-black">OB (Nov-26) / Total Paid</th>
              </tr>
            </thead>
            <tbody>${tbodyHtml}</tbody>
            <tfoot>
              <tr class="bg-slate-200 dark:bg-slate-800 font-black text-xs border-t-2 border-emerald-500">
                <td class="px-3 py-3 sticky-col text-slate-900 dark:text-white">GROUP TOTALS</td>
                <td class="px-3 py-3 text-center tabular-nums">${colTotals.OB}</td>
                ${monthCols.map(m => `<td class="px-2 py-3 text-center tabular-nums ${colTotals[m] < 0 ? 'text-rose-500' : ''}">${colTotals[m]}</td>`).join('')}
                <td class="px-3 py-3 text-center text-emerald-600 dark:text-emerald-400 font-black tabular-nums">${colTotals.TotalPaid}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;
      return;
    }

    const matrix = buildMonthlyMatrix(this.state.members, this.state.transactions, this.activePaymentsYear);

    let theadHtml = `
      <tr class="bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
        <th class="px-3 py-3 sticky-col text-left">Member Name</th>
        <th class="px-3 py-3 text-center">OB (Nov-26)</th>
        ${matrix.months.map(m => `
          <th class="px-3 py-3 text-center ${m.key === matrix.currentMonthKey ? 'col-current-month' : ''}">${m.label}</th>
        `).join('')}
        <th class="px-3 py-3 text-center bg-slate-200 dark:bg-slate-700 font-bold">Total Paid</th>
        <th class="px-3 py-3 text-center bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-black">Net Total</th>
      </tr>
    `;

    let tbodyHtml = '';
    matrix.rows.forEach(r => {
      const isMe = this.isCurrentUser(r.name);
      tbodyHtml += `
        <tr class="${isMe ? 'bg-emerald-50/90 dark:bg-emerald-950/35' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'} border-b border-slate-200 dark:border-slate-800 text-xs">
          <td class="px-3 py-3 font-bold sticky-col ${isMe ? '!bg-emerald-50 dark:!bg-emerald-950 text-emerald-700 dark:text-emerald-300' : 'text-slate-900 dark:text-white'} whitespace-nowrap">${r.name}${this.youBadge(r.name)}</td>
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
   * 3. SAHAYA NIDHI VIEW
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
      tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400">No Sahaya Nidhi ledger records yet.</td></tr>`;
      return;
    }

    records.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-xs';
      const rType = r.Type || r.type || '';
      const isDisbursed = rType === 'Charity Disbursement' || rType === 'Sahaya Nidhi Disbursement' || rType === 'Expense';

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
   * 4. LOANS (EMERGENCY & VACATION) VIEW + SMART PRIORITY LIST
   */
  renderLoans() {
    this.renderLoanRequests();
    this.renderLoanPriorityList();
    this.render2026LoanReference();

    const activeContainer = document.getElementById('loans-active-cards');
    if (!activeContainer) return;
    activeContainer.innerHTML = '';

    const loans = this.state.loans || [];
    const activeLoans = loans.filter(l => {
      const s = l.Status || l.status;
      return s !== 'Repaid' && s !== 'Requested' && s !== 'Approved' && s !== 'Rejected';
    });

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

  renderLoanRequests() {
    const container = document.getElementById('loans-requests-cards');
    if (!container) return;

    const loans = this.state.loans || [];
    const requests = loans.filter(l => {
      const s = l.Status || l.status;
      return s === 'Requested' || s === 'Approved';
    });

    if (requests.length === 0) {
      container.innerHTML = `
        <div class="col-span-full p-6 text-center bg-white dark:bg-slate-800/70 rounded-2xl border border-slate-200 dark:border-slate-800">
          <p class="text-xs text-slate-500">No pending loan requests. Members can click <strong>"New Loan Request"</strong> above to submit one.</p>
        </div>
      `;
      return;
    }

    const isAdmin = authService.isAdmin();

    container.innerHTML = requests.map(l => {
      const status = l.Status || l.status;
      const loanId = l.Loan_ID || l.loanId;
      const memberName = l.Member_Name || l.memberName;
      const loanType = l.Loan_Type || l.loanType || l.Type || l.type;
      const principal = Number(l.Principal || l.principal || l.Amount || l.amount || 0);
      const reqDate = l.Request_Date || l.requestDate;
      const reqByDate = l.Issue_Date || l.issueDate;

      let meta = {};
      try {
        const raw = l.Schedule_JSON || l.scheduleJson;
        meta = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
      } catch (e) {
        meta = {};
      }
      const requiredDate = meta.requiredDate || reqByDate || '';
      const reason = meta.reason || '—';
      const contactUAE = meta.contactUAE ? `+971 ${meta.contactUAE}` : '';

      const isApproved = status === 'Approved';
      const currentUser = authService.getCurrentUser();
      const isRequester = currentUser && String(currentUser.name || '').toLowerCase() === String(memberName || '').toLowerCase();
      const canEdit = !isApproved && (isRequester || isAdmin);

      const statusBadge = isApproved
        ? `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">✅ Approved (Awaiting Payout)</span>`
        : `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">⏳ Requested</span>`;

      const actionControls = (canEdit || isAdmin) ? `
        <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex flex-wrap justify-end gap-2">
          ${canEdit ? `
            <button class="btn-edit-loan-req px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold" data-loan-id="${loanId}">
              ✏️ Edit Request
            </button>
          ` : ''}
          ${isAdmin && !isApproved ? `
            <button class="btn-loan-status px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold" data-loan-id="${loanId}" data-status="Rejected">
              ❌ Reject
            </button>
            <button class="btn-loan-status px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm" data-loan-id="${loanId}" data-status="Approved">
              ✅ Approve Request
            </button>
          ` : ''}
          ${isAdmin && isApproved ? `
            <button class="btn-loan-status px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm" data-loan-id="${loanId}" data-status="Active">
              💸 Mark Paid & Issue Loan
            </button>
          ` : ''}
        </div>
      ` : '';

      return `
        <div class="p-5 rounded-2xl bg-white dark:bg-slate-800 border ${isApproved ? 'border-blue-300 dark:border-blue-800' : 'border-amber-300 dark:border-amber-800/70'} shadow-sm flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between gap-2 flex-wrap">
              ${statusBadge}
              <span class="text-[11px] font-mono text-slate-400">${loanId}</span>
            </div>

            <div class="flex items-baseline justify-between mt-3">
              <h4 class="text-base font-bold text-slate-900 dark:text-white">${memberName}</h4>
              <span class="text-lg font-black text-indigo-600 dark:text-indigo-400 tabular-nums">${formatCurrency(principal)}</span>
            </div>

            <div class="mt-2 grid grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-900/70 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
              <div><span class="text-slate-400 block text-[10px]">Type</span><strong class="text-slate-700 dark:text-slate-200">${loanType}</strong></div>
              <div><span class="text-slate-400 block text-[10px]">Required By</span><strong class="text-amber-600 dark:text-amber-400">${formatDate(requiredDate)}</strong></div>
              <div><span class="text-slate-400 block text-[10px]">Requested On</span><span class="text-slate-600 dark:text-slate-300">${formatDate(reqDate)}</span></div>
              <div><span class="text-slate-400 block text-[10px]">Reason</span><span class="text-slate-600 dark:text-slate-300">${reason}</span></div>
            </div>
            ${contactUAE ? `<p class="text-[11px] text-slate-400 mt-2">📞 ${contactUAE}${meta.repaymentMonths ? ` • ${meta.repaymentMonths} mo(s) plan` : ''}</p>` : ''}
          </div>
          ${actionControls}
        </div>
      `;
    }).join('');

    container.querySelectorAll('.btn-edit-loan-req').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const loanId = e.currentTarget.getAttribute('data-loan-id');
        const found = (this.state.loans || []).find(l => (l.Loan_ID || l.loanId) === loanId);
        if (found) this.openRequestLoanModal(found);
      });
    });

    container.querySelectorAll('.btn-loan-status').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const loanId = e.currentTarget.getAttribute('data-loan-id');
        const newStatus = e.currentTarget.getAttribute('data-status');
        this.handleLoanStatusUpdate(loanId, newStatus);
      });
    });
  }

  async handleLoanStatusUpdate(loanId, newStatus) {
    if (!authService.isAdmin()) {
      this.showToast("Admin access required", "error");
      return;
    }

    const loan = (this.state.loans || []).find(l => (l.Loan_ID || l.loanId) === loanId);
    if (!loan) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const principal = Number(loan.Principal || loan.principal || loan.Amount || loan.amount || 0);
    const loanType = loan.Loan_Type || loan.loanType || loan.Type || loan.type;

    let scheduleJson = null;
    if (newStatus === 'Active') {
      if (loanType === 'Vacation Loan') {
        scheduleJson = generateVacationLoanSchedule(principal, todayStr);
      } else {
        scheduleJson = [{
          dueDate: calculateEmergencyLoanDueDate(todayStr),
          expectedAmount: principal,
          milestoneLabel: 'Full Emergency Loan Repayment'
        }];
      }
    }

    const label = newStatus === 'Approved' ? 'Approving loan request...' : newStatus === 'Active' ? 'Marking paid & issuing loan...' : 'Updating request...';
    this.showToast(label, "info");

    const res = await sheetsService.updateLoanStatus({
      loanId,
      status: newStatus,
      issueDate: todayStr,
      scheduleJson,
      updatedBy: authService.getCurrentUser().name
    });

    if (res.status === 'success') {
      this.showToast(
        newStatus === 'Approved' ? 'Loan Request Approved!' : newStatus === 'Active' ? 'Loan Marked Paid & Issued!' : 'Loan Request Updated',
        'success'
      );
      await this.refreshData();
    } else {
      this.showToast(res.message || 'Failed to update loan status', 'error');
    }
  }

  renderLoanPriorityList() {
    const container = document.getElementById('loans-priority-list');
    if (!container) return;

    const list = computeLoanPriorityList(
      this.state.members,
      this.state.transactions,
      this.state.loans,
      this.state.payments2026,
      this.state.loans2026
    );

    if (list.length === 0) {
      container.innerHTML = `<div class="p-6 text-center text-xs text-slate-400">No members loaded yet.</div>`;
      return;
    }

    const tierStyles = {
      TOP_PRIORITY: {
        badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
        rankBg: 'bg-emerald-600 text-white'
      },
      ELIGIBLE: {
        badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
        rankBg: 'bg-blue-600 text-white'
      },
      COOLDOWN: {
        badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
        rankBg: 'bg-amber-500 text-white'
      },
      ACTIVE_DUE: {
        badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
        rankBg: 'bg-rose-600 text-white'
      }
    };

    container.innerHTML = list.map(item => {
      const st = tierStyles[item.tier] || tierStyles.ELIGIBLE;
      const reasonChips = item.reasons.map(r => `
        <span class="inline-block px-2 py-0.5 rounded-md text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">${r}</span>
      `).join('');

      const isMe = this.isCurrentUser(item.name);
      return `
        <div class="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isMe ? 'bg-emerald-50/80 dark:bg-emerald-950/30 ring-1 ring-inset ring-emerald-500/30' : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'} transition-colors">
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-xl ${st.rankBg} flex items-center justify-center text-xs font-black shrink-0 shadow-sm">
              #${item.rank}
            </div>
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-bold ${isMe ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-900 dark:text-white'}">${item.name}${this.youBadge(item.name)}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${st.badge}">${item.tierLabel}</span>
              </div>
              <div class="flex flex-wrap gap-1.5 mt-1.5">${reasonChips}</div>
            </div>
          </div>
          <div class="flex items-center gap-3 self-end sm:self-center shrink-0">
            <div class="text-right">
              <span class="text-[10px] uppercase tracking-wider text-slate-400 block">Priority Score</span>
              <span class="text-sm font-black tabular-nums ${item.score >= 600 ? 'text-emerald-600 dark:text-emerald-400' : item.score >= 200 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-500'}">${item.score}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  render2026LoanReference() {
    const container = document.getElementById('loans-2026-reference');
    if (!container) return;

    const rawRows = this.state.loans2026 || [];
    const rows = rawRows.filter(r => {
      const n = String(r.Name || r.name || '').trim();
      return n !== '' && n.toUpperCase() !== 'TOTAL';
    });
    if (rows.length === 0) {
      container.innerHTML = `<div class="p-6 text-center text-xs text-slate-400">No 2026_Loan reference rows found.</div>`;
      return;
    }

    const cols = ['10-25', '11-25', '12-25', '01-26', '02-26', '03-26', '04-26', '05-26', '06-26', '07-26', '08-26', '09-26', '10-26'];
    let totalLoan = 0;

    const bodyHtml = rows.map(r => {
      const amt = Number(r['LOAN AMOUNT'] || 0);
      totalLoan += amt;
      const iss = r['LOAN ISSUE DATE'] || '—';
      const repayCells = cols.map(c => {
        const v = getMonthColValue(r, c);
        return `<td class="px-2 py-2 text-center tabular-nums ${v > 0 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-300 dark:text-slate-700'}">${v > 0 ? v : '—'}</td>`;
      }).join('');

      const mName = r.Name || r.name;
      const isMe = this.isCurrentUser(mName);
      return `
        <tr class="border-b border-slate-100 dark:border-slate-800 text-[11px] ${isMe ? 'bg-emerald-50/90 dark:bg-emerald-950/35' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}">
          <td class="px-3 py-2 font-bold whitespace-nowrap sticky left-0 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.06)] ${isMe ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' : 'bg-white dark:bg-[#111a2e] text-slate-900 dark:text-white'}">${mName}${this.youBadge(mName)}</td>
          <td class="px-2 py-2 text-center text-slate-500 whitespace-nowrap">${iss || '—'}</td>
          <td class="px-2 py-2 text-center font-bold tabular-nums ${amt > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}">${amt > 0 ? amt : '—'}</td>
          ${repayCells}
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <table class="w-full text-left border-collapse whitespace-nowrap">
        <thead class="bg-slate-50 dark:bg-slate-900/60 text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800">
          <tr>
            <th class="px-3 py-2.5 sticky left-0 bg-slate-50 dark:bg-slate-900">Name</th>
            <th class="px-2 py-2.5 text-center">Issue Date</th>
            <th class="px-2 py-2.5 text-center">Loan Amt</th>
            ${cols.map(c => `<th class="px-2 py-2.5 text-center">${c}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${bodyHtml}</tbody>
        <tfoot class="bg-slate-100 dark:bg-slate-800/80 text-[11px] font-bold">
          <tr>
            <td class="px-3 py-2 sticky left-0 bg-slate-100 dark:bg-slate-800">TOTAL (Reference Only)</td>
            <td class="px-2 py-2"></td>
            <td class="px-2 py-2 text-center tabular-nums">${totalLoan}</td>
            ${cols.map(c => {
              const sum = rows.reduce((a, r) => a + getMonthColValue(r, c), 0);
              return `<td class="px-2 py-2 text-center tabular-nums">${sum > 0 ? sum : '—'}</td>`;
            }).join('')}
          </tr>
        </tfoot>
      </table>
    `;
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
      const isMe = this.isCurrentUser(m.name);
      card.className = `p-5 rounded-2xl ${isMe ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-500/50 ring-1 ring-emerald-500/30' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'} border shadow-sm flex flex-col justify-between`;

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

          <h4 class="text-base font-bold ${isMe ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-900 dark:text-white'} mt-3">${m.name}${this.youBadge(m.name)}</h4>
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
   * 7. REPORTS VIEW (Full 12-Column Master Matrix Suite)
   */
  renderReports() {
    const summary = calculateFundSummary(
      this.state.members,
      this.state.transactions,
      this.state.loans,
      this.state.sahayaNidhi
    );

    const reportMonthSelect = document.getElementById('report-month-select');
    if (reportMonthSelect && this.activeReportsMonth) {
      reportMonthSelect.value = this.activeReportsMonth;
    }

    const matrixData = ReportsService.buildMatrixRows(
      this.state.members,
      this.state.transactions,
      this.state.loans,
      this.state.config,
      this.activeReportsMonth
    );

    // 1. Render Live 13-Column Table Body (with SN + Frozen Name + Current User Highlight)
    const tbody = document.getElementById('reports-matrix-tbody');
    if (tbody) {
      tbody.innerHTML = matrixData.rows.map((r, idx) => {
        const isMe = this.isCurrentUser(r.name);
        const nameColor = isMe ? 'text-emerald-300 font-extrabold' : r.isOverdue ? 'text-rose-400 font-bold' : 'text-white font-medium';
        const gBalColor = r.grandBalance >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold';
        const mPaidColor = r.monthlyNetPaidCurrent >= 100 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold';
        const stickyBg = isMe ? 'bg-emerald-950' : 'bg-slate-900';

        return `
          <tr class="${isMe ? 'bg-emerald-950/60 ring-1 ring-inset ring-emerald-500/40' : 'hover:bg-slate-800/50'} transition-colors">
            <td class="p-2 border border-slate-800 sticky left-0 z-10 ${stickyBg} text-center text-slate-400 font-semibold w-[44px] min-w-[44px]">${r.srNum || idx + 1}</td>
            <td class="p-2.5 border border-slate-800 sticky left-[44px] z-10 ${stickyBg} shadow-[2px_0_6px_rgba(0,0,0,0.35)] ${nameColor}">${r.name}${this.youBadge(r.name)} ${r.isOverdue ? '<span class="text-[10px] text-rose-500 font-normal">⚠️</span>' : ''}</td>
            <td class="p-2 border border-slate-800 text-center text-slate-300">${r.actualNetMonthlyOB}</td>
            <td class="p-2 border border-slate-800 text-center ${mPaidColor}">${r.monthlyNetPaidCurrent}</td>
            <td class="p-2 border border-slate-800 text-center text-blue-400 font-bold">${r.monthlyNetTotal}</td>
            <td class="p-2 border border-slate-800 text-center text-slate-300">${r.SahayaNidhiOB}</td>
            <td class="p-2 border border-slate-800 text-center text-indigo-400 font-medium">${r.SahayaNidhiCurrent}</td>
            <td class="p-2 border border-slate-800 text-center text-indigo-400 font-bold">${r.SahayaNidhiTotal}</td>
            <td class="p-2 border border-slate-800 text-center text-slate-300">${r.loanAmount > 0 ? r.loanAmount : '—'}</td>
            <td class="p-2 border border-slate-800 text-center text-[11px] text-slate-400">${r.loanAmount > 0 ? r.loanIssued : ''}</td>
            <td class="p-2 border border-slate-800 text-center text-slate-300">${r.loanAmount > 0 ? r.loanRepaid : '—'}</td>
            <td class="p-2 border border-slate-800 text-center text-slate-300">${r.loanAmount > 0 ? r.loanBalance : '—'}</td>
            <td class="p-2 border border-slate-800 text-center ${gBalColor} bg-slate-950/40">${r.grandBalance}</td>
          </tr>
        `;
      }).join('');
    }

    // 2. Render Live 12-Column Table Footer (Group Totals)
    const tfoot = document.getElementById('reports-matrix-tfoot');
    if (tfoot) {
      const sums = matrixData.sums;
      const gBalColor = sums.gBal >= 0 ? 'text-emerald-400' : 'text-rose-400';
      tfoot.innerHTML = `
        <tr>
          <td class="p-2 border border-slate-700 sticky left-0 bg-slate-800 z-10 w-[44px] min-w-[44px]"></td>
          <td class="p-2.5 border border-slate-700 sticky left-[44px] bg-slate-800 z-10 text-blue-400 shadow-[2px_0_6px_rgba(0,0,0,0.35)]">GROUP TOTALS</td>
          <td class="p-2 border border-slate-700 text-center">${sums.mOB}</td>
          <td class="p-2 border border-slate-700 text-center text-emerald-400">${sums.mPaid}</td>
          <td class="p-2 border border-slate-700 text-center text-blue-400 font-bold">${sums.mTotal}</td>
          <td class="p-2 border border-slate-700 text-center">${sums.sOB}</td>
          <td class="p-2 border border-slate-700 text-center text-indigo-400">${sums.sPaid}</td>
          <td class="p-2 border border-slate-700 text-center text-indigo-400 font-bold">${sums.sTotal}</td>
          <td class="p-2 border border-slate-700 text-center">${sums.lAmt}</td>
          <td class="p-2 border border-slate-700 text-center bg-slate-900"></td>
          <td class="p-2 border border-slate-700 text-center">${sums.lRepaid}</td>
          <td class="p-2 border border-slate-700 text-center">${sums.lBal}</td>
          <td class="p-2 border border-slate-700 text-center font-extrabold ${gBalColor}">${sums.gBal}</td>
        </tr>
      `;
    }

    // 3. Render WhatsApp Text Preview
    const reportText = ReportsService.generateWhatsAppTextReport(
      this.state.members,
      matrixData,
      summary,
      this.activeReportsMonth
    );
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
    const matrixData = ReportsService.buildMatrixRows(
      this.state.members,
      this.state.transactions,
      this.state.loans,
      this.state.config,
      this.activeReportsMonth
    );

    const btn = document.getElementById('btn-full-whatsapp-report');
    const btnText = document.getElementById('btn-report-image-text');
    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = "Generating 12-Col PNG...";

    this.showToast("Generating 12-Column Report Image...", "info");
    const res = await ReportsService.generateVisualReportSnapshot(matrixData, summary, this.activeReportsMonth);
    
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = "Download Full 12-Col Report (PNG)";

    if (res.success) {
      this.showToast("Finalized 12-Column Report Image Downloaded!", "success");
    } else {
      this.showToast("Snapshot generation failed: " + (res.error || "Unknown"), "error");
    }
  }

  exportMasterReportCSV() {
    const matrixData = ReportsService.buildMatrixRows(
      this.state.members,
      this.state.transactions,
      this.state.loans,
      this.state.config,
      this.activeReportsMonth
    );
    ReportsService.exportMasterCSV(matrixData, `Master_12Col_${this.activeReportsMonth}`);
    this.showToast("12-Column Master CSV Downloaded!", "success");
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
              <span class="text-indigo-600 dark:text-indigo-400 font-semibold">1. Sahaya Nidhi:</span>
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

  openRequestLoanModal(existingLoan = null) {
    const modal = document.getElementById('modal-request-loan');
    if (!modal) return;

    const formEl = document.getElementById('form-request-loan');
    const successEl = document.getElementById('req-loan-success-panel');
    const titleEl = document.getElementById('req-modal-title');
    const idInput = document.getElementById('req-loan-id');

    if (formEl) formEl.classList.remove('hidden');
    if (successEl) successEl.classList.add('hidden');

    const user = authService.getCurrentUser();
    const isAdmin = authService.isAdmin();
    const todayStr = new Date().toISOString().split('T')[0];

    const dateInput = document.getElementById('req-loan-date');
    const memberSelect = document.getElementById('req-loan-member');
    const typeSelect = document.getElementById('req-loan-type');
    const reqByInput = document.getElementById('req-loan-required-date');
    const amountInput = document.getElementById('req-loan-amount');
    const monthsInput = document.getElementById('req-loan-months');
    const repayStartInput = document.getElementById('req-loan-repay-start');
    const phoneUaeInput = document.getElementById('req-loan-phone-uae');
    const phoneIndiaInput = document.getElementById('req-loan-phone-india');
    const reasonSel = document.getElementById('req-loan-reason');
    const otherReasonEl = document.getElementById('req-loan-other-reason');

    let meta = {};
    if (existingLoan) {
      try {
        const raw = existingLoan.Schedule_JSON || existingLoan.scheduleJson;
        meta = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
      } catch (e) { meta = {}; }
    }

    const editLoanId = existingLoan ? (existingLoan.Loan_ID || existingLoan.loanId || '') : '';
    if (idInput) idInput.value = editLoanId;
    if (titleEl) {
      titleEl.innerHTML = editLoanId
        ? `<span>✏️</span><span>Edit Pending Loan Request (${editLoanId})</span>`
        : `<span>📝</span><span>Avadhi Nidhi — Loan Request Form</span>`;
    }

    if (dateInput) {
      dateInput.value = existingLoan ? (existingLoan.Request_Date || existingLoan.requestDate || todayStr) : todayStr;
    }

    const targetMemberName = existingLoan ? (existingLoan.Member_Name || existingLoan.memberName) : (user?.name || '');
    if (memberSelect) {
      memberSelect.innerHTML = '';
      this.state.members.forEach(m => {
        const name = m.Name || m.name;
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        if (targetMemberName && name.toLowerCase() === targetMemberName.toLowerCase()) opt.selected = true;
        memberSelect.appendChild(opt);
      });
      memberSelect.disabled = Boolean(editLoanId) || (!isAdmin && Boolean(user?.name));
    }

    if (phoneUaeInput) {
      if (meta.contactUAE) {
        phoneUaeInput.value = meta.contactUAE;
      } else {
        const selectedMember = this.state.members.find(m => (m.Name || m.name) === memberSelect?.value);
        const digits = selectedMember ? String(selectedMember.Phone || selectedMember.phone || '').replace(/\D/g, '') : '';
        phoneUaeInput.value = digits.length >= 9 ? digits.slice(-9) : '';
      }
    }
    if (phoneIndiaInput) phoneIndiaInput.value = meta.contactIndia || '';

    if (reqByInput) {
      if (existingLoan && (meta.requiredDate || existingLoan.Issue_Date)) {
        reqByInput.value = meta.requiredDate || existingLoan.Issue_Date;
      } else {
        const d = new Date();
        d.setDate(d.getDate() + 26);
        reqByInput.value = d.toISOString().split('T')[0];
      }
    }

    if (typeSelect) typeSelect.value = existingLoan ? (existingLoan.Loan_Type || existingLoan.loanType || 'Vacation Loan') : 'Vacation Loan';
    if (amountInput) amountInput.value = existingLoan ? Number(existingLoan.Principal || existingLoan.principal || 2500) : 2500;
    if (monthsInput) monthsInput.value = meta.repaymentMonths || 5;
    if (repayStartInput) {
      if (meta.repayStart) {
        repayStartInput.value = meta.repayStart;
        repayStartInput.dataset.manual = '1';
      } else {
        delete repayStartInput.dataset.manual;
      }
    }

    if (reasonSel && otherReasonEl) {
      const rVal = meta.reason || '';
      const standardOpts = ['Annual Leave', 'Emergency Leave', 'Medical Emergency', 'Family Emergency'];
      if (!rVal) {
        reasonSel.value = '';
        otherReasonEl.classList.add('hidden');
        otherReasonEl.value = '';
      } else if (standardOpts.includes(rVal)) {
        reasonSel.value = rVal;
        otherReasonEl.classList.add('hidden');
        otherReasonEl.value = '';
      } else {
        reasonSel.value = 'Other';
        otherReasonEl.classList.remove('hidden');
        otherReasonEl.value = rVal;
      }
    }

    // Initialize Signature Pad
    this.initReqSignaturePad();
    this.updateRequestLoanCalculations();

    modal.classList.remove('hidden');
  }

  initReqSignaturePad() {
    const canvas = document.getElementById('req-signature-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(300, Math.floor((rect.width || 500) * dpr));
    canvas.height = Math.max(120, Math.floor((rect.height || 128) * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#0f172a';
    this.reqHasSignature = false;

    if (canvas.dataset.bound === '1') return;
    canvas.dataset.bound = '1';

    let drawing = false;
    const getPos = (e) => {
      const r = canvas.getBoundingClientRect();
      const pt = e.touches && e.touches[0] ? e.touches[0] : e;
      return { x: pt.clientX - r.left, y: pt.clientY - r.top };
    };
    const start = (e) => {
      if (e.cancelable) e.preventDefault();
      drawing = true;
      const p = getPos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const move = (e) => {
      if (!drawing) return;
      if (e.cancelable) e.preventDefault();
      const p = getPos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      this.reqHasSignature = true;
    };
    const stop = () => { drawing = false; };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', stop);

    const clearBtn = document.getElementById('btn-clear-req-signature');
    if (clearBtn) {
      clearBtn.onclick = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.reqHasSignature = false;
      };
    }
  }

  updateRequestLoanCalculations() {
    const reqDate = document.getElementById('req-loan-date')?.value || new Date().toISOString().split('T')[0];
    const memberName = document.getElementById('req-loan-member')?.value || '';
    const loanType = document.getElementById('req-loan-type')?.value || 'Vacation Loan';
    const requiredDate = document.getElementById('req-loan-required-date')?.value || '';
    const amount = Number(document.getElementById('req-loan-amount')?.value || 0);
    const monthsInput = document.getElementById('req-loan-months');
    const repayStartInput = document.getElementById('req-loan-repay-start');
    const repayEndInput = document.getElementById('req-loan-repay-end');
    const emiDisplay = document.getElementById('req-loan-emi-display');
    const policyAlert = document.getElementById('req-loan-policy-alert');
    const summaryEl = document.getElementById('req-loan-summary');

    const reasonSel = document.getElementById('req-loan-reason')?.value || '';
    const otherReason = document.getElementById('req-loan-other-reason')?.value?.trim() || '';
    const reasonText = reasonSel === 'Other' ? (otherReason || 'Other') : (reasonSel || 'Not selected');

    // Policy & Quota checks
    const alerts = [];
    const targetYear = requiredDate ? new Date(requiredDate).getFullYear() : new Date().getFullYear();
    const quota = checkLoanQuota(this.state.loans, memberName, loanType, targetYear);
    if (!quota.isEligible) {
      alerts.push(`⚠️ ${memberName} already used their ${loanType} quota for ${targetYear}.`);
    }

    if (loanType === 'Vacation Loan' && requiredDate) {
      const notice = validateVacationNotice(reqDate, requiredDate);
      if (!notice.isValid) {
        alerts.push(`⚠️ Vacation Loan requires at least ${notice.minRequired} days advance notice (currently ${notice.daysNotice} days).`);
      }
      if (monthsInput) {
        monthsInput.disabled = false;
        const m = Math.min(5, Math.max(1, Number(monthsInput.value || 5)));
        monthsInput.value = m;
        if (repayStartInput && !repayStartInput.dataset.manual) {
          const d = new Date(requiredDate + 'T00:00:00');
          d.setMonth(d.getMonth() + 2);
          repayStartInput.value = d.toISOString().split('T')[0];
        }
        const endD = repayStartInput?.value ? new Date(repayStartInput.value + 'T00:00:00') : null;
        if (endD && repayEndInput) {
          endD.setMonth(endD.getMonth() + m);
          repayEndInput.value = endD.toISOString().split('T')[0];
        }
        const emi = amount > 0 ? (amount / m).toFixed(2) : '0';
        if (emiDisplay) emiDisplay.textContent = `${emi} AED / mo (${m} mos)`;
      }
    } else if (loanType === 'Emergency Loan') {
      if (monthsInput) {
        monthsInput.value = 1;
        monthsInput.disabled = true;
      }
      const due = calculateEmergencyLoanDueDate(requiredDate || reqDate);
      if (repayStartInput) repayStartInput.value = due;
      if (repayEndInput) repayEndInput.value = due;
      if (emiDisplay) emiDisplay.textContent = `Due ${formatDate(due)} (Full)`;
    }

    if (policyAlert) {
      if (alerts.length > 0) {
        policyAlert.className = 'p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-semibold space-y-1';
        policyAlert.innerHTML = alerts.join('<br>');
      } else {
        policyAlert.className = 'hidden';
        policyAlert.innerHTML = '';
      }
    }

    if (summaryEl) {
      summaryEl.textContent = [
        `Avadhi Nidhi — Loan Request`,
        `Applicant: ${memberName || '—'} | Type: ${loanType}`,
        `Amount: ${formatCurrency(amount)} | Required By: ${formatDate(requiredDate)}`,
        `Reason: ${reasonText}`,
        `Repayment: ${emiDisplay ? emiDisplay.textContent : '—'}`
      ].join('\n');
    }
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

    // 7. Member Loan Request Form
    const reqForm = document.getElementById('form-request-loan');
    if (reqForm) {
      const recalcIds = ['req-loan-member', 'req-loan-type', 'req-loan-required-date', 'req-loan-amount', 'req-loan-months', 'req-loan-reason', 'req-loan-other-reason', 'req-loan-repay-start'];
      recalcIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => this.updateRequestLoanCalculations());
        el.addEventListener('change', () => {
          if (id === 'req-loan-repay-start') el.dataset.manual = '1';
          if (id === 'req-loan-required-date') {
            const rs = document.getElementById('req-loan-repay-start');
            if (rs) delete rs.dataset.manual;
          }
          if (id === 'req-loan-reason') {
            const other = document.getElementById('req-loan-other-reason');
            if (other) other.classList.toggle('hidden', el.value !== 'Other');
          }
          this.updateRequestLoanCalculations();
        });
      });

      document.querySelectorAll('.req-amt-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
          const amtEl = document.getElementById('req-loan-amount');
          if (amtEl) {
            amtEl.value = e.currentTarget.getAttribute('data-amt');
            this.updateRequestLoanCalculations();
          }
        });
      });

      const pdfBtn = document.getElementById('btn-req-download-pdf');
      if (pdfBtn) {
        pdfBtn.addEventListener('click', () => this.exportLoanRequestPDF());
      }

      const waBtn = document.getElementById('btn-req-whatsapp-share');
      if (waBtn) {
        waBtn.addEventListener('click', () => {
          const summaryText = document.getElementById('req-loan-summary')?.textContent || '';
          window.open(`https://wa.me/?text=${encodeURIComponent(summaryText)}`, '_blank', 'noopener');
        });
      }

      reqForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const memberName = document.getElementById('req-loan-member').value;
        const loanType = document.getElementById('req-loan-type').value;
        const requestDate = document.getElementById('req-loan-date').value;
        const requiredDate = document.getElementById('req-loan-required-date').value;
        const principal = Number(document.getElementById('req-loan-amount').value);
        const phoneUAE = document.getElementById('req-loan-phone-uae').value.replace(/\D/g, '');
        const phoneIndia = document.getElementById('req-loan-phone-india').value.replace(/\D/g, '');
        const reasonSel = document.getElementById('req-loan-reason').value;
        const otherReason = document.getElementById('req-loan-other-reason').value.trim();
        const reason = reasonSel === 'Other' ? otherReason : reasonSel;
        const repaymentMonths = Number(document.getElementById('req-loan-months').value || 1);
        const repayStart = document.getElementById('req-loan-repay-start').value;
        const repayEnd = document.getElementById('req-loan-repay-end').value;

        if (!memberName || !requiredDate || !principal || principal < 100 || principal > 2500) {
          this.showToast("Please check applicant, required date, and amount (100–2500 AED).", "error");
          return;
        }
        if (!/^5\d{8}$/.test(phoneUAE)) {
          this.showToast("Enter a valid 9-digit UAE mobile number starting with 5.", "error");
          return;
        }
        if (!reason) {
          this.showToast("Please select or specify a reason.", "error");
          return;
        }
        if (!this.reqHasSignature) {
          this.showToast("Please provide your digital signature.", "error");
          return;
        }

        if (loanType === 'Vacation Loan') {
          const notice = validateVacationNotice(requestDate, requiredDate);
          if (!notice.isValid) {
            this.showToast(`Vacation Loan requires ${notice.minRequired} days advance notice (currently ${notice.daysNotice} days).`, "error");
            return;
          }
        }

        const editLoanId = document.getElementById('req-loan-id')?.value || '';
        const summaryText = document.getElementById('req-loan-summary')?.textContent || '';
        this.showToast(editLoanId ? `Updating loan request ${editLoanId}...` : `Submitting loan request for ${memberName}...`, "info");

        const payload = {
          loanId: editLoanId,
          memberName,
          loanType,
          requestDate,
          requiredDate,
          principal,
          metaJson: {
            requiredDate,
            reason,
            contactUAE: phoneUAE,
            contactIndia: phoneIndia,
            repaymentMonths,
            repayStart,
            repayEnd
          }
        };

        const res = editLoanId
          ? await sheetsService.updateLoanRequest(payload)
          : await sheetsService.requestLoan(payload);

        if (res.status === 'success') {
          this.showToast(editLoanId ? "Loan request updated!" : "Loan request submitted!", "success");

          // Show post-submission Share WhatsApp & PDF panel inside the same modal window
          const formEl = document.getElementById('form-request-loan');
          const successEl = document.getElementById('req-loan-success-panel');
          const headingEl = document.getElementById('req-success-heading');
          const summaryBox = document.getElementById('req-success-summary');
          if (formEl) formEl.classList.add('hidden');
          if (successEl) successEl.classList.remove('hidden');
          if (headingEl) headingEl.textContent = editLoanId ? 'Loan Request Updated!' : 'Loan Request Submitted!';
          if (summaryBox) summaryBox.textContent = summaryText;

          const postWaBtn = document.getElementById('btn-req-post-whatsapp');
          if (postWaBtn) {
            postWaBtn.onclick = () => {
              window.open(`https://wa.me/?text=${encodeURIComponent(summaryText)}`, '_blank', 'noopener');
            };
          }
          const postPdfBtn = document.getElementById('btn-req-post-pdf');
          if (postPdfBtn) {
            postPdfBtn.onclick = () => this.exportLoanRequestPDF();
          }
          const postDoneBtn = document.getElementById('btn-req-post-done');
          if (postDoneBtn) {
            postDoneBtn.onclick = () => {
              document.getElementById('modal-request-loan')?.classList.add('hidden');
              this.switchTab('loans');
            };
          }

          await this.refreshData();
        } else {
          this.showToast(res.message || "Failed to submit loan request", "error");
        }
      });
    }
  }

  exportLoanRequestPDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      this.showToast("PDF library still loading, please try again.", "error");
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const summaryText = document.getElementById('req-loan-summary')?.textContent || '';
    const memberName = document.getElementById('req-loan-member')?.value || 'Member';
    const canvas = document.getElementById('req-signature-canvas');

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 595, 70, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text('AVADHI NIDHI — LOAN REQUEST FORM', 40, 42);

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(summaryText, 515);
    doc.text(lines, 40, 110);

    if (canvas && this.reqHasSignature) {
      doc.text('Applicant Signature:', 40, 260);
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', 40, 275, 220, 70);
    }

    doc.save(`AvadhiNidhi_LoanRequest_${memberName.replace(/\s+/g, '_')}.pdf`);
    this.showToast("Loan Request PDF downloaded!", "success");
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
