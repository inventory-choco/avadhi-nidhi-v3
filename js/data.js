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
    notes: "Nov 2026 Sahaya Nidhi Deduction"
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
    notes: "Nov 2026 Sahaya Nidhi Deduction"
  }
];

export const INITIAL_LOANS = [];

export const INITIAL_SAHAYA_RECORDS = [
  {
    date: "2026-11-01",
    type: "Monthly Deduction",
    memberName: "Ashraf Kannur",
    amount: 5,
    beneficiaryOrCause: "Monthly Sahaya Nidhi Contribution",
    updatedBy: "Shuhaib Muhammed C.",
    notes: "November Contribution"
  },
  {
    date: "2026-11-01",
    type: "Monthly Deduction",
    memberName: "Shuhaib Muhammed C.",
    amount: 5,
    beneficiaryOrCause: "Monthly Sahaya Nidhi Contribution",
    updatedBy: "Shuhaib Muhammed C.",
    notes: "November Contribution"
  }
];

// Reference-only 2026 Monthly Payments (matches Google Sheet: 2026_monthly_Payments)
export const REFERENCE_PAYMENTS_2026 = [
  { SN: 1, Name: "Ashraf Kannur", "Total Paid": 500, OB: 1400, Jan: 100, Feb: 100, Mar: 105, Apr: 105, May: 105, Jun: 105, Jul: 105, Aug: 105, Sep: 105, Oct: 105, Nov: -1940, Dec: 0 },
  { SN: 2, Name: "Usman Ollassery", "Total Paid": 0, OB: 1400, Jan: 100, Feb: 100, Mar: 105, Apr: 105, May: 105, Jun: 105, Jul: 105, Aug: 105, Sep: 105, Oct: 105, Nov: -2440, Dec: 0 },
  { SN: 3, Name: "Kasim Tirur", "Total Paid": -315, OB: 1400, Jan: 100, Feb: 100, Mar: 105, Apr: 105, May: 105, Jun: 105, Jul: 105, Aug: 105, Sep: 0, Oct: 0, Nov: -2545, Dec: 0 },
  { SN: 4, Name: "Naseef", "Total Paid": 500, OB: 1400, Jan: 0, Feb: 200, Mar: 0, Apr: 210, May: 0, Jun: 210, Jul: 105, Aug: 105, Sep: 0, Oct: 315, Nov: -2045, Dec: 0 },
  { SN: 5, Name: "Shuhaib Muhammed C.", "Total Paid": 500, OB: 1400, Jan: 100, Feb: 100, Mar: 105, Apr: 105, May: 105, Jun: 105, Jul: 105, Aug: 105, Sep: 105, Oct: 105, Nov: -1940, Dec: 0 },
  { SN: 6, Name: "Hashim", "Total Paid": -25, OB: 1400, Jan: 100, Feb: 0, Mar: 0, Apr: 0, May: 310, Jun: 0, Jul: 0, Aug: 0, Sep: 0, Oct: 210, Nov: -2045, Dec: 0 },
  { SN: 7, Name: "Shahid (Muthu)", "Total Paid": 500, OB: 1400, Jan: 100, Feb: 100, Mar: 105, Apr: 105, May: 105, Jun: 105, Jul: 105, Aug: 0, Sep: 0, Oct: 0, Nov: -1625, Dec: 0 },
  { SN: 8, Name: "Mubarak", "Total Paid": 500, OB: 1400, Jan: 0, Feb: 200, Mar: 105, Apr: 105, May: 105, Jun: 105, Jul: 105, Aug: 105, Sep: 105, Oct: 105, Nov: -1940, Dec: 0 },
  { SN: 9, Name: "Irshad", "Total Paid": 500, OB: 1400, Jan: 0, Feb: 200, Mar: 105, Apr: 105, May: 105, Jun: 105, Jul: 105, Aug: 105, Sep: 105, Oct: 105, Nov: -1940, Dec: 0 },
  { SN: 10, Name: "Sidheeq Kv C/O Kasim", "Total Paid": -315, OB: 1400, Jan: 100, Feb: 100, Mar: 105, Apr: 105, May: 105, Jun: 105, Jul: 105, Aug: 105, Sep: 0, Oct: 0, Nov: -2545, Dec: 0 },
  { SN: 11, Name: "Shihab C/O Kasim", "Total Paid": 495, OB: 900, Jan: 600, Feb: 100, Mar: 105, Apr: 105, May: 105, Jun: 105, Jul: 105, Aug: 105, Sep: 105, Oct: 105, Nov: -1945, Dec: 0 },
  { SN: 12, Name: "Shahana Usman C/O Usman", "Total Paid": 0, OB: 1400, Jan: 100, Feb: 100, Mar: 105, Apr: 105, May: 105, Jun: 105, Jul: 105, Aug: 105, Sep: 105, Oct: 105, Nov: -2440, Dec: 0 },
  { SN: 13, Name: "Jamal Kk C/O Usman", "Total Paid": 500, OB: 1400, Jan: 100, Feb: 100, Mar: 105, Apr: 105, May: 105, Jun: 105, Jul: 105, Aug: 105, Sep: 105, Oct: 105, Nov: -1940, Dec: 0 },
  { SN: 14, Name: "Irshad Tirur C/O Kasim", "Total Paid": -630, OB: 1400, Jan: 100, Feb: 100, Mar: 105, Apr: 105, May: 105, Jun: 0, Jul: 0, Aug: 0, Sep: 0, Oct: 0, Nov: -2545, Dec: 0 }
];

// Reference-only 2026 Loan Sheet (matches Google Sheet: 2026_Loan) — NOT added to active balances
export const REFERENCE_LOANS_2026 = [
  { SN: 1, Name: "Ashraf Kannur", "LOAN ISSUE DATE": "", "LOAN AMOUNT": 0 },
  { SN: 2, Name: "Usman Ollassery", "LOAN ISSUE DATE": "01-10-2026", "LOAN AMOUNT": 2500 },
  { SN: 3, Name: "Kasim Tirur", "LOAN ISSUE DATE": "03-06-2026", "LOAN AMOUNT": 2500 },
  { SN: 4, Name: "Naseef", "LOAN ISSUE DATE": "22-07-2026", "LOAN AMOUNT": 2500, "10-26": 1000 },
  { SN: 5, Name: "Shuhaib Muhammed C.", "LOAN ISSUE DATE": "01-04-2026", "LOAN AMOUNT": 2500, "06-26": 500, "07-26": 500, "08-26": 500, "09-26": 500, "10-26": 500 },
  { SN: 6, Name: "Hashim", "LOAN ISSUE DATE": "25-12-2026", "LOAN AMOUNT": 2000 },
  { SN: 7, Name: "Shahid (Muthu)", "LOAN ISSUE DATE": "", "LOAN AMOUNT": 0 },
  { SN: 8, Name: "Mubarak", "LOAN ISSUE DATE": "07-09-2025", "LOAN AMOUNT": 2000, "10-25": 200, "11-25": 200, "12-25": 200, "02-26": 200, "04-26": 190, "05-26": 190, "06-26": 820 },
  { SN: 9, Name: "Irshad", "LOAN ISSUE DATE": "", "LOAN AMOUNT": 0 },
  { SN: 10, Name: "Sidheeq Kv C/O Kasim", "LOAN ISSUE DATE": "27-08-2026", "LOAN AMOUNT": 2500 },
  { SN: 11, Name: "Shihab C/O Kasim", "LOAN ISSUE DATE": "13-07-2025", "LOAN AMOUNT": 2000, "02-26": 500, "03-26": 500, "04-26": 500, "05-26": 500 },
  { SN: 12, Name: "Shahana Usman C/O Usman", "LOAN ISSUE DATE": "01-10-2026", "LOAN AMOUNT": 2500 },
  { SN: 13, Name: "Jamal Kk C/O Usman", "LOAN ISSUE DATE": "25-12-2025", "LOAN AMOUNT": 2000, "02-26": 400, "04-26": 400, "05-26": 400, "06-26": 400, "07-26": 400 },
  { SN: 14, Name: "Irshad Tirur C/O Kasim", "LOAN ISSUE DATE": "16-05-2026", "LOAN AMOUNT": 2500 }
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
