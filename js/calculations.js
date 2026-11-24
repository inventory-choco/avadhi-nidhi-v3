/**
 * Avadhi Nidhi V3 - Financial & Rule Engine Calculations
 * 
 * Implements:
 * 1. Smart Priority Waterfall Payment Engine (SahayaNidhi -> Monthly Share / Arrears -> Loan Repayment)
 * 2. Complete Loan Lifecycle (Emergency Loan end-of-next-month due date, Vacation Loan 7-month schedule with 2-month grace)
 * 3. Member Dues & Grand Balance Reconciliation
 * 4. Monthly Matrix Reporting Aggregator
 */

import { APP_CONFIG } from './config.js';

/**
 * Format currency in AED
 */
export function formatCurrency(amount, includeSymbol = true) {
  const num = Number(amount) || 0;
  const formatted = new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(num);

  return includeSymbol ? `${formatted} AED` : formatted;
}

/**
 * Format date YYYY-MM-DD to readable format (e.g. 24-Nov-2026)
 */
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mon = monthNames[d.getMonth()];
  const yr = d.getFullYear();
  return `${day}-${mon}-${yr}`;
}

/**
 * Calculate Emergency Loan Due Date
 * Rule: Duration is 1 month excluding remaining days of issuance month.
 * The due date is the LAST DAY of the NEXT calendar month!
 * Example: 21-Oct-2026 -> 30-Nov-2026; 15-Dec-2026 -> 31-Jan-2027.
 */
export function calculateEmergencyLoanDueDate(issueDateStr) {
  const date = issueDateStr ? new Date(issueDateStr) : new Date();
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-based

  // Next month is month + 1; month + 2 with day 0 gives last day of month + 1
  const lastDayOfNextMonth = new Date(year, month + 2, 0);

  const y = lastDayOfNextMonth.getFullYear();
  const m = String(lastDayOfNextMonth.getMonth() + 1).padStart(2, '0');
  const d = String(lastDayOfNextMonth.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Generate Vacation Loan 7-Month Schedule with 2-Month Grace Period
 * 
 * Rules:
 * - Total tenure = 7 months from Issue_Date
 * - Months 1 & 2: 2-month grace period (expected = 0 AED, early repayment permitted)
 * - Months 3 to 7: 5 equal monthly installments = (Principal / 5)
 * 
 * Example: 2,500 AED issued 24-Nov-2026:
 * - 24-Dec-2026: 0 AED (Grace Period 1)
 * - 24-Jan-2027: 0 AED (Grace Period 2)
 * - 24-Feb-2027: 500 AED (Installment 1)
 * - 24-Mar-2027: 500 AED (Installment 2)
 * - 24-Apr-2027: 500 AED (Installment 3)
 * - 24-May-2027: 500 AED (Installment 4)
 * - 24-Jun-2027: 500 AED (Installment 5)
 */
export function generateVacationLoanSchedule(principal, issueDateStr) {
  const princ = Number(principal) || 0;
  const issueDate = issueDateStr ? new Date(issueDateStr) : new Date();
  const schedule = [];
  const installmentAmount = Math.round((princ / 5) * 100) / 100;

  for (let m = 1; m <= 7; m++) {
    // Add m months keeping same day (handle month end rollover safely)
    const dueDate = new Date(issueDate.getFullYear(), issueDate.getMonth() + m, issueDate.getDate());
    const y = dueDate.getFullYear();
    const mm = String(dueDate.getMonth() + 1).padStart(2, '0');
    const dd = String(dueDate.getDate()).padStart(2, '0');
    const dueDateStr = `${y}-${mm}-${dd}`;

    const isGracePeriod = m <= 2;
    const expected = isGracePeriod ? 0 : installmentAmount;

    schedule.push({
      monthIndex: m,
      dueDate: dueDateStr,
      expectedAmount: expected,
      isGracePeriod: isGracePeriod,
      milestoneLabel: isGracePeriod ? `Grace Month ${m} (0 AED)` : `Installment ${m - 2} of 5 (${expected} AED)`
    });
  }

  return schedule;
}

/**
 * Validate Vacation Loan Advance Notice (Minimum 25 days)
 */
export function validateVacationNotice(requestDateStr, neededDateStr) {
  if (!requestDateStr || !neededDateStr) {
    return { isValid: false, daysNotice: 0, minRequired: APP_CONFIG.defaults.vacationLoanNoticeDays };
  }
  const req = new Date(requestDateStr);
  const need = new Date(neededDateStr);
  const diffTime = need.getTime() - req.getTime();
  const daysNotice = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return {
    isValid: daysNotice >= APP_CONFIG.defaults.vacationLoanNoticeDays,
    daysNotice: daysNotice,
    minRequired: APP_CONFIG.defaults.vacationLoanNoticeDays
  };
}

/**
 * Check Annual Loan Quota (Max 1 Emergency + Max 1 Vacation per calendar year per member)
 */
export function checkLoanQuota(loans, memberName, loanType, targetYear) {
  const yr = targetYear || new Date().getFullYear();
  const matching = (loans || []).filter(l => {
    const lName = l.Member_Name || l.memberName;
    const lType = l.Loan_Type || l.loanType || l.Type || l.type;
    const issueDate = l.Issue_Date || l.issueDate || l.Date || l.date;
    if (lName !== memberName || lType !== loanType || !issueDate) return false;
    return new Date(issueDate).getFullYear() === yr;
  });

  return {
    isEligible: matching.length === 0,
    usedCount: matching.length,
    year: yr,
    existingLoan: matching[0] || null
  };
}

/**
 * Compute Active Dues for a Member
 */
export function computeMemberDues(member, transactions, loans, config = APP_CONFIG.defaults) {
  const name = member.Name || member.name;
  const ob = Number(member['OB from Dec-2026'] || member.ob || 0);
  const monthlyShareAmt = Number(config.monthlyShare || 100);
  const sahayaMonthlyAmt = Number(config.sahayaNidhiMonthly || 5);

  const memTx = (transactions || []).filter(t => (t.Member_Name || t.memberName) === name);

  let totalSavingsContributed = 0;
  let totalSahayaContributed = 0;
  let totalLoanRepaid = 0;

  memTx.forEach(t => {
    const type = t.Type || t.type;
    const amt = Number(t.Amount || t.amount || 0);
    if (type === 'Monthly Payment') totalSavingsContributed += amt;
    else if (type === 'SahayaNidhi') totalSahayaContributed += amt;
    else if (type === 'Loan Repayment') totalLoanRepaid += amt;
  });

  // Calculate SahayaNidhi Dues:
  // How many months passed since fund start (2026-12)?
  const now = new Date();
  const startYear = 2026;
  const startMonth = 11; // Dec 2026
  let monthsPassed = (now.getFullYear() - startYear) * 12 + (now.getMonth() - startMonth) + 1;
  if (monthsPassed < 1) monthsPassed = 1;

  const expectedSahayaTotal = monthsPassed * sahayaMonthlyAmt;
  const sahayaDue = Math.max(0, expectedSahayaTotal - totalSahayaContributed);

  // Calculate Monthly Savings Dues:
  // Negative OB arrears + monthly shares accrued
  // If OB is negative (e.g. -315), that's an arrear of 315.
  const negativeArrears = ob < 0 ? Math.abs(ob) : 0;
  const expectedMonthlyContributed = (monthsPassed * monthlyShareAmt) + negativeArrears;
  const actualContributed = (ob > 0 ? ob : 0) + totalSavingsContributed;
  
  // Outstanding monthly payment due
  const monthlyDue = Math.max(0, expectedMonthlyContributed - actualContributed);

  // Active Loan Dues
  const memLoans = (loans || []).filter(l => (l.Member_Name || l.memberName) === name);
  let totalLoanBorrowed = 0;
  let totalLoanRepaidFromDB = 0;
  let activeLoans = [];

  memLoans.forEach(l => {
    const principal = Number(l.Principal || l.principal || l.Amount || l.amount || 0);
    const repaid = Number(l.Repaid_Amount || l.repaidAmount || 0);
    const status = l.Status || l.status;
    totalLoanBorrowed += principal;
    totalLoanRepaidFromDB += repaid;

    if (status !== 'Repaid' && repaid < principal) {
      activeLoans.push({
        ...l,
        principal,
        repaid,
        outstanding: principal - repaid
      });
    }
  });

  const totalOutstandingLoan = totalLoanBorrowed - totalLoanRepaidFromDB;

  // Current Savings Balance = OB + totalSavingsContributed
  const currentSavingsBalance = ob + totalSavingsContributed;

  // Grand Balance = Current Savings Balance - Outstanding Loan
  const grandBalance = currentSavingsBalance - totalOutstandingLoan;

  return {
    name,
    ob,
    currentSavingsBalance,
    totalSavingsContributed,
    totalSahayaContributed,
    totalOutstandingLoan,
    activeLoans,
    grandBalance,
    sahayaDue,
    monthlyDue,
    loanDue: totalOutstandingLoan,
    monthsPassed
  };
}

/**
 * SMART PRIORITY WATERFALL ALLOCATION ENGINE (Core Business Logic)
 * 
 * Priorities:
 * 1. Priority 1 — SahayaNidhi (5 AED/month compulsory charity): Clears any unpaid SahayaNidhi dues first.
 * 2. Priority 2 — Monthly Payment (100 AED/month share + negative OB arrears): Clears monthly dues and arrears.
 * 3. Priority 3 — Active Loan Repayment: Applies remaining payment toward active loan debt.
 * 4. Surplus: If any amount remains after clearing all dues, applies to Monthly Savings advance.
 * 
 * Verified against test case:
 * Member has 0 Sahaya due, 200 Monthly due, 500 Loan due, pays 500:
 * -> 200 to Monthly Payment
 * -> 300 to Loan Repayment
 * -> Total = 500 AED.
 */
export function calculateSmartAllocation(totalAmount, dues) {
  const payment = Number(totalAmount) || 0;
  const sahayaDue = Math.max(0, Number(dues?.sahayaDue || 0));
  const monthlyDue = Math.max(0, Number(dues?.monthlyDue || 0));
  const loanDue = Math.max(0, Number(dues?.loanDue || 0));

  let remaining = payment;

  // Priority 1: SahayaNidhi
  let allocSahaya = 0;
  if (sahayaDue > 0) {
    allocSahaya = Math.min(remaining, sahayaDue);
  } else if (payment >= 105 && monthlyDue <= 0 && loanDue <= 0) {
    // Normal standard monthly contribution when no past dues exist
    allocSahaya = 5;
  }
  remaining -= allocSahaya;

  // Priority 2: Monthly Payment
  let allocMonthly = 0;
  if (monthlyDue > 0) {
    allocMonthly = Math.min(remaining, monthlyDue);
  } else if (remaining > 0 && loanDue <= 0) {
    // No loan due: remaining goes to monthly savings
    allocMonthly = remaining;
  } else if (remaining > 0 && monthlyDue <= 0 && loanDue > 0 && allocSahaya === 5 && payment === 105) {
    // Standard 105 monthly payment: 100 to monthly share
    allocMonthly = Math.min(remaining, 100);
  }
  remaining -= allocMonthly;

  // Priority 3: Loan Repayment
  let allocLoan = 0;
  if (loanDue > 0 && remaining > 0) {
    allocLoan = Math.min(remaining, loanDue);
    remaining -= allocLoan;
  }

  // Any surplus leftover (all dues and loans cleared) goes to monthly savings
  if (remaining > 0) {
    allocMonthly += remaining;
    remaining = 0;
  }

  const allocations = [];
  if (allocSahaya > 0) allocations.push({ type: "SahayaNidhi", amount: allocSahaya, priority: 1, label: "SahayaNidhi Charity" });
  if (allocMonthly > 0) allocations.push({ type: "Monthly Payment", amount: allocMonthly, priority: 2, label: "Monthly Savings Share" });
  if (allocLoan > 0) allocations.push({ type: "Loan Repayment", amount: allocLoan, priority: 3, label: "Active Loan Repayment" });

  return {
    totalPayment: payment,
    allocSahaya,
    allocMonthly,
    allocLoan,
    allocations,
    isValid: (allocSahaya + allocMonthly + allocLoan) === payment
  };
}

/**
 * Global Fund Financial Summary
 */
export function calculateFundSummary(members, transactions, loans, sahayaRecords) {
  let totalOB = 0;
  let totalMonthlySavingsPaid = 0;
  let totalSahayaCollected = 0;
  let totalLoansIssued = 0;
  let totalLoansRepaid = 0;
  let totalSahayaDisbursed = 0;

  // Members OB
  (members || []).forEach(m => {
    totalOB += Number(m['OB from Dec-2026'] || m.ob || 0);
  });

  // Transactions
  (transactions || []).forEach(t => {
    const type = t.Type || t.type;
    const amt = Number(t.Amount || t.amount || 0);
    if (type === 'Monthly Payment') totalMonthlySavingsPaid += amt;
    else if (type === 'SahayaNidhi') totalSahayaCollected += amt;
    else if (type === 'Loan issued' || type === 'Loan Issued') totalLoansIssued += amt;
    else if (type === 'Loan Repayment') totalLoansRepaid += amt;
  });

  // Sahaya Disbursements
  (sahayaRecords || []).forEach(s => {
    const type = s.Type || s.type;
    const amt = Number(s.Amount || s.amount || 0);
    if (type === 'Charity Disbursement' || type === 'Expense') totalSahayaDisbursed += amt;
  });

  const activeLoansOutstanding = Math.max(0, totalLoansIssued - totalLoansRepaid);
  const availableSahayaPool = Math.max(0, totalSahayaCollected - totalSahayaDisbursed);
  const totalMemberSavingsLiability = totalOB + totalMonthlySavingsPaid;

  // Liquid Available Cash in Bank/Fund:
  // Inflow: OB + Monthly Savings + Sahaya Collected + Loan Repayments
  // Outflow: Loans Issued + Sahaya Disbursed
  const availableLiquidCash = totalOB + totalMonthlySavingsPaid + totalSahayaCollected + totalLoansRepaid - totalLoansIssued - totalSahayaDisbursed;
  const totalNetFundWorth = availableLiquidCash + activeLoansOutstanding;

  return {
    totalMembers: (members || []).length,
    totalOB,
    totalMonthlySavingsPaid,
    totalMemberSavingsLiability,
    totalSahayaCollected,
    totalSahayaDisbursed,
    availableSahayaPool,
    totalLoansIssued,
    totalLoansRepaid,
    activeLoansOutstanding,
    availableLiquidCash,
    totalNetFundWorth
  };
}

/**
 * Aggregates Monthly Payment Matrix (Year tabs: 2026, 2027)
 */
export function buildMonthlyMatrix(members, transactions, year) {
  const months = [
    { key: `${year}-01`, label: 'Jan' },
    { key: `${year}-02`, label: 'Feb' },
    { key: `${year}-03`, label: 'Mar' },
    { key: `${year}-04`, label: 'Apr' },
    { key: `${year}-05`, label: 'May' },
    { key: `${year}-06`, label: 'Jun' },
    { key: `${year}-07`, label: 'Jul' },
    { key: `${year}-08`, label: 'Aug' },
    { key: `${year}-09`, label: 'Sep' },
    { key: `${year}-10`, label: 'Oct' },
    { key: `${year}-11`, label: 'Nov' },
    { key: `${year}-12`, label: 'Dec' },
  ];

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const rows = (members || []).map(m => {
    const name = m.Name || m.name;
    const ob = Number(m['OB from Dec-2026'] || m.ob || 0);

    const memTx = (transactions || []).filter(t => (t.Member_Name || t.memberName) === name && (t.Type || t.type) === 'Monthly Payment');

    const monthValues = {};
    let rowTotal = 0;

    months.forEach(mon => {
      const txForMonth = memTx.filter(t => {
        const d = String(t.Date || t.date || '');
        return d.startsWith(mon.key);
      });
      const sum = txForMonth.reduce((acc, cur) => acc + Number(cur.Amount || cur.amount || 0), 0);
      monthValues[mon.key] = sum;
      rowTotal += sum;
    });

    return {
      srNum: m['Sr. Num'] || m.srNum,
      name,
      ob,
      monthValues,
      rowTotal,
      netTotal: ob + rowTotal
    };
  });

  // Calculate column totals
  const colTotals = {};
  let totalOB = 0;
  let grandSum = 0;

  months.forEach(mon => {
    colTotals[mon.key] = rows.reduce((acc, r) => acc + (r.monthValues[mon.key] || 0), 0);
    grandSum += colTotals[mon.key];
  });

  totalOB = rows.reduce((acc, r) => acc + r.ob, 0);

  return {
    year,
    months,
    currentMonthKey,
    rows,
    colTotals,
    totalOB,
    grandTotal: totalOB + grandSum
  };
}
