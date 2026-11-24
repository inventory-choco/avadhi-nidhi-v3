/**
 * Avadhi Nidhi V3 - Initial Data & Configuration
 */

// Default members based on Google Sheet "Member_Details"
export const INITIAL_MEMBERS = [
  { srNum: 1, name: "Ashraf Kannur", ob: 500, phone: "", email: "", type: "Member" },
  { srNum: 2, name: "Usman Ollassery", ob: 0, phone: "", email: "", type: "Member" },
  { srNum: 3, name: "Kasim Tirur", ob: -315, phone: "", email: "", type: "Member" },
  { srNum: 4, name: "Naseef", ob: 500, phone: "", email: "", type: "Member" },
  { srNum: 5, name: "Shuhaib Muhammed C.", ob: 500, phone: "", email: "shuhaibonly@gmail.com", type: "Admin" },
  { srNum: 6, name: "Hashim", ob: -25, phone: "", email: "", type: "Member" },
  { srNum: 7, name: "Shahid (Muthu)", ob: 500, phone: "", email: "", type: "Member" },
  { srNum: 8, name: "Abdul Rasheed", ob: 500, phone: "", email: "", type: "Member" },
  { srNum: 9, name: "Musthafa", ob: 500, phone: "", email: "", type: "Member" },
  { srNum: 10, name: "Jamsheer", ob: 500, phone: "", email: "", type: "Member" },
  { srNum: 11, name: "Noushad", ob: 500, phone: "", email: "", type: "Member" },
  { srNum: 12, name: "Riyas", ob: 500, phone: "", email: "", type: "Member" },
  { srNum: 13, name: "Faisal", ob: 500, phone: "", email: "", type: "Member" },
  { srNum: 14, name: "Suhail", ob: 500, phone: "", email: "", type: "Member" },
];

// Sample Initial Transactions for demonstration & testing
export const INITIAL_TRANSACTIONS = [
  {
    date: "2026-11-01",
    memberName: "Ashraf Kannur",
    type: "Monthly Payment",
    amount: 100,
    updatedBy: "Shuhaib Muhammed C.",
    updatedDate: "2026-11-01 10:00:00",
    notes: "Nov 2026 Savings Contribution"
  },
  {
    date: "2026-11-01",
    memberName: "Ashraf Kannur",
    type: "SahayaNidhi",
    amount: 5,
    updatedBy: "Shuhaib Muhammed C.",
    updatedDate: "2026-11-01 10:00:00",
    notes: "Nov 2026 SahayaNidhi Charity Deduction"
  },
  {
    date: "2026-11-01",
    memberName: "Shuhaib Muhammed C.",
    type: "Monthly Payment",
    amount: 100,
    updatedBy: "Shuhaib Muhammed C.",
    updatedDate: "2026-11-01 10:15:00",
    notes: "Nov 2026 Savings Contribution"
  },
  {
    date: "2026-11-01",
    memberName: "Shuhaib Muhammed C.",
    type: "SahayaNidhi",
    amount: 5,
    updatedBy: "Shuhaib Muhammed C.",
    updatedDate: "2026-11-01 10:15:00",
    notes: "Nov 2026 SahayaNidhi Charity Deduction"
  }
];

export const INITIAL_LOANS = [];

export const INITIAL_SAHAYA_RECORDS = [
  {
    date: "2026-11-01",
    type: "Monthly Deduction",
    memberName: "Ashraf Kannur",
    amount: 5,
    beneficiaryOrCause: "Monthly Charity Contribution",
    updatedBy: "Shuhaib Muhammed C.",
    notes: "November Contribution"
  },
  {
    date: "2026-11-01",
    type: "Monthly Deduction",
    memberName: "Shuhaib Muhammed C.",
    amount: 5,
    beneficiaryOrCause: "Monthly Charity Contribution",
    updatedBy: "Shuhaib Muhammed C.",
    notes: "November Contribution"
  }
];

export const APP_CONFIG = {
  appName: "Avadhi Nidhi V3",
  currency: "AED",
  monthlyContributionTotal: 105,
  monthlySavingsAmount: 100,
  monthlySahayaAmount: 5,
  maxLoanAmount: 2500,
  vacationLoanNoticeDays: 25,
  currentAdminEmail: "shuhaibonly@gmail.com",
  currentAdminName: "Shuhaib Muhammed C.",
  sheetUrl: "https://docs.google.com/spreadsheets/d/1nM27j5h8wQNhElx0GkGSez44SFFt0WD8hemEfPV9te8/edit?gid=0#gid=0",
  storageKeys: {
    apiUrl: "avadhi_nidhi_gas_api_url",
    currentUser: "avadhi_nidhi_current_user",
    members: "avadhi_nidhi_members_cache",
    transactions: "avadhi_nidhi_transactions_cache",
    loans: "avadhi_nidhi_loans_cache",
    sahaya: "avadhi_nidhi_sahaya_cache",
    lastSynced: "avadhi_nidhi_last_synced"
  }
};
