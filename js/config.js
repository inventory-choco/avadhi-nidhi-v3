/**
 * Avadhi Nidhi V3 - Production Configuration
 * 
 * Central configuration module with hardcoded production Google Apps Script Web App URL
 * and Google OAuth 2.0 Web Client ID (matching Staff Attendance App).
 */

export const APP_CONFIG = {
  appName: "Avadhi Nidhi V3",
  fundTitle: "Avadhi Nidhi Community Fund & SahayaNidhi Welfare",
  currency: "AED",

  // Permanent Production Google Apps Script Web App Endpoint
  gasApiUrl: "https://script.google.com/macros/s/AKfycbzlT1vFxdv-xNYWh-AeFE869IY35odzGIz-kzwpk_tN51MDQgR1hIFdOahO0a7Zt_DXIw/exec",

  // Google OAuth 2.0 Client ID (Production Web Client ID from Staff Attendance App)
  googleClientId: "188969693421-8ebob1ei8ks5j4dnq2j92la9mo1kqgfi.apps.googleusercontent.com",

  // Core Financial Defaults
  defaults: {
    monthlyShare: 100,
    sahayaNidhiMonthly: 5,
    monthlyTotal: 105,
    maxLoanAmount: 2500,
    fundStartMonth: "2026-12",
    vacationLoanNoticeDays: 25,
    vacationLoanTenureMonths: 7,
    vacationLoanGraceMonths: 2,
    vacationLoanInstallmentMonths: 5
  },

  // Google Sheet Link
  sheetUrl: "https://docs.google.com/spreadsheets/d/1nM27j5h8wQNhElx0GkGSez44SFFt0WD8hemEfPV9te8/edit?gid=0#gid=0",

  // Local Storage Cache Keys
  storageKeys: {
    sessionUser: "an_session_user",
    cachedMembers: "an_cached_members",
    cachedTransactions: "an_cached_transactions",
    cachedLoans: "an_cached_loans",
    cachedConfig: "an_cached_config",
    cachedSahaya: "an_cached_sahaya",
    cachedPayments2026: "an_cached_payments_2026",
    cachedLoans2026: "an_cached_loans_2026",
    theme: "an_theme_preference",
    lastSynced: "an_last_synced_timestamp"
  }
};
