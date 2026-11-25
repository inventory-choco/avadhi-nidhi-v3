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
    const status = l.Status || l.status;
    const issueDate = l.Issue_Date || l.issueDate || l.Date || l.date;
    if (status === 'Rejected' || status === 'Requested' || status === 'Approved') return false;
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
    const status = l.Status || l.status;
    if (status === 'Requested' || status === 'Approved' || status === 'Rejected') return;

    const principal = Number(l.Principal || l.principal || l.Amount || l.amount || 0);
    const repaid = Number(l.Repaid_Amount || l.repaidAmount || 0);
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
 * 1. Priority 1 — Sahaya Nidhi (5 AED/month compulsory): Clears any unpaid Sahaya Nidhi dues first.
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
  if (allocSahaya > 0) allocations.push({ type: "SahayaNidhi", amount: allocSahaya, priority: 1, label: "Sahaya Nidhi" });
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
    if (type === 'Charity Disbursement' || type === 'Sahaya Nidhi Disbursement' || type === 'Expense') totalSahayaDisbursed += amt;
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

/**
 * Parse DD-MM-YYYY or YYYY-MM-DD date string safely
 */
function parseFlexibleDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  const ddmmyyyy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (ddmmyyyy) {
    const day = Number(ddmmyyyy[1]);
    const mon = Number(ddmmyyyy[2]) - 1;
    let yr = Number(ddmmyyyy[3]);
    if (yr < 100) yr += 2000;
    const d = new Date(yr, mon, day);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Convert MM-YY (e.g. "10-25", "06-26") to end-of-month Date
 */
function parseMMYYToEndDate(mmYY) {
  const m = String(mmYY).match(/^(\d{2})-(\d{2})$/);
  if (!m) return null;
  const mon = Number(m[1]); // 1-12
  const yr = 2000 + Number(m[2]);
  return new Date(yr, mon, 0);
}

/**
 * SMART LOAN PRIORITY LIST ENGINE
 *
 * Criteria (from highest to lowest priority):
 * 1. Never took a loan (2025, 2026, until now) -> First Priority
 * 2. Farther from last complete loan closure -> Higher Priority
 * 3. Farther from last loan request/issue date -> Next Priority
 * 4. Regular monthly payments -> Boosts priority
 * 5. Regular loan repayments -> Boosts priority
 * 6. Closed a loan within the last 3 months -> Cooldown (Least Priority)
 * 7. Currently has an active loan or unsettled negative balance due -> Least Priority
 */
/**
 * Resolve MM-YY column value (e.g. "10-25", "06-26") even if Google Sheets
 * auto-formatted the header as a Date string (e.g. "Wed Oct 01 2025..." or "2025-10-01")
 */
export function getMonthColValue(row, mmYY) {
  if (!row) return 0;
  if (row[mmYY] !== undefined && row[mmYY] !== '') return Number(row[mmYY]) || 0;

  const [mmStr, yyStr] = String(mmYY).split('-');
  const targetMonth = Number(mmStr) - 1;
  const targetYear = 2000 + Number(yyStr);
  const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monAbbr = monthNames[targetMonth];

  for (const key of Object.keys(row)) {
    const low = key.toLowerCase();
    // Match "2025-10-01" or "oct-25" or "wed oct 01 2025..."
    if (low.includes(`${targetYear}-${mmStr}`) || (low.includes(monAbbr) && low.includes(String(targetYear)))) {
      return Number(row[key]) || 0;
    }
    const parsed = new Date(key);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() === targetYear && parsed.getMonth() === targetMonth) {
      return Number(row[key]) || 0;
    }
  }
  return 0;
}

export function computeLoanPriorityList(members, transactions = [], loans = [], payments2026 = [], loans2026 = []) {
  const now = new Date();
  const loanRepayCols2026 = ['10-25', '11-25', '12-25', '01-26', '02-26', '03-26', '04-26', '05-26', '06-26', '07-26', '08-26', '09-26', '10-26'];
  const payMonths2026 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];

  const results = (members || []).map(member => {
    const name = member.Name || member.name;
    const ob = Number(member['OB from Dec-2026'] ?? member.ob ?? 0);

    // 1. Historical 2026_Loan record (reference only)
    const histLoan = (loans2026 || []).find(l => (l.Name || l.name) === name) || null;
    const histAmt = histLoan ? Number(histLoan['LOAN AMOUNT'] || 0) : 0;
    const histIssueDate = histLoan ? parseFlexibleDate(histLoan['LOAN ISSUE DATE']) : null;

    let histRepaid = 0;
    let histRepayMonths = 0;
    let lastHistRepayCol = null;
    if (histLoan && histAmt > 0) {
      loanRepayCols2026.forEach(col => {
        const val = getMonthColValue(histLoan, col);
        if (val > 0) {
          histRepaid += val;
          histRepayMonths++;
          lastHistRepayCol = col;
        }
      });
    }
    const histClosed = histAmt > 0 && histRepaid >= histAmt;
    const histClosureDate = histClosed && lastHistRepayCol ? parseMMYYToEndDate(lastHistRepayCol) : null;

    // 2. Live LoansDB records (only disbursed Active/Repaid loans count toward loan history)
    const dbLoans = (loans || []).filter(l => {
      const s = l.Status || l.status;
      return (l.Member_Name || l.memberName) === name && s !== 'Requested' && s !== 'Approved' && s !== 'Rejected';
    });
    let activeDbLoan = null;
    let latestClosedDbLoan = null;
    let latestDbIssueDate = null;

    dbLoans.forEach(l => {
      const p = Number(l.Principal || l.principal || l.Amount || l.amount || 0);
      const rep = Number(l.Repaid_Amount || l.repaidAmount || 0);
      const status = l.Status || l.status;
      const iss = parseFlexibleDate(l.Issue_Date || l.issueDate);
      if (iss && (!latestDbIssueDate || iss > latestDbIssueDate)) {
        latestDbIssueDate = iss;
      }
      if (status !== 'Repaid' && rep < p) {
        activeDbLoan = { principal: p, repaid: rep, outstanding: p - rep, issueDate: iss };
      } else if (p > 0) {
        latestClosedDbLoan = l;
      }
    });

    // 3. Monthly payment regularity (2026_monthly_Payments + live TransactionsDB)
    const histPayRow = (payments2026 || []).find(p => (p.Name || p.name) === name) || null;
    let paidMonthsCount = 0;
    let totalExpectedMonths = 0;
    if (histPayRow) {
      payMonths2026.forEach(m => {
        totalExpectedMonths++;
        if (Number(histPayRow[m] || 0) > 0) paidMonthsCount++;
      });
    }
    const liveMonthlyTx = (transactions || []).filter(
      t => (t.Member_Name || t.memberName) === name && (t.Type || t.type) === 'Monthly Payment' && Number(t.Amount || t.amount || 0) > 0
    );
    const liveMonthsSet = new Set(liveMonthlyTx.map(t => String(t.Date || t.date || '').slice(0, 7)));
    if (liveMonthsSet.size > 0) {
      paidMonthsCount += liveMonthsSet.size;
      totalExpectedMonths += liveMonthsSet.size;
    }
    const monthlyRegularityPct = totalExpectedMonths > 0 ? Math.round((paidMonthsCount / totalExpectedMonths) * 100) : 100;

    // 4. Determine Loan Status, Closure Date & Issue Date across 2025-Present
    const everTookLoan = histAmt > 0 || dbLoans.length > 0;
    const latestIssueDate = latestDbIssueDate && (!histIssueDate || latestDbIssueDate > histIssueDate)
      ? latestDbIssueDate
      : histIssueDate;

    const latestClosureDate = latestClosedDbLoan
      ? (parseFlexibleDate(latestClosedDbLoan.Closed_Date || latestClosedDbLoan.Issue_Date) || histClosureDate)
      : histClosureDate;

    const monthsDiff = (d1, d2) => (d1.getFullYear() - d2.getFullYear()) * 12 + (d1.getMonth() - d2.getMonth());
    const monthsSinceIssue = latestIssueDate ? Math.max(0, monthsDiff(now, latestIssueDate)) : null;
    const monthsSinceClosure = latestClosureDate ? Math.max(0, monthsDiff(now, latestClosureDate)) : null;

    // Check if member currently has an active loan or unsettled balance due
    const hasUnsettled2026Due = histAmt > 0 && !histClosed && ob <= 0;
    const hasActiveDue = Boolean(activeDbLoan) || ob < 0 || hasUnsettled2026Due;

    // Loan repayment regularity score
    let loanRepayRegularity = 0;
    if (histAmt > 0) {
      if (histClosed && histRepayMonths >= 4) loanRepayRegularity = 50;
      else if (histClosed && histRepayMonths >= 2) loanRepayRegularity = 35;
      else if (histClosed) loanRepayRegularity = 20;
      else if (histRepaid > 0) loanRepayRegularity = 15;
    }

    // 5. Tier Classification & Smart Score
    let tier = 'ELIGIBLE';
    let tierRank = 3;
    let tierLabel = 'Eligible';
    let score = 0;
    const reasons = [];

    if (!everTookLoan && !hasActiveDue) {
      tier = 'TOP_PRIORITY';
      tierRank = 4;
      tierLabel = '1st Priority • Never Took a Loan';
      score = 1000 + monthlyRegularityPct + (ob >= 500 ? 20 : 0);
      reasons.push('Never took a loan (2025–2026)');
      reasons.push(`Monthly regularity: ${monthlyRegularityPct}% (${paidMonthsCount}/${totalExpectedMonths || 1} mos)`);
      reasons.push(`Current OB: ${ob} AED`);
    } else if (hasActiveDue) {
      tier = 'ACTIVE_DUE';
      tierRank = 1;
      tierLabel = 'Least Priority • Active Loan / Dues Pending';
      score = -500 + ob + monthlyRegularityPct * 0.5;
      if (activeDbLoan) {
        reasons.push(`Active loan balance: ${activeDbLoan.outstanding} AED`);
      }
      if (ob < 0) {
        reasons.push(`Negative OB arrears: ${ob} AED`);
      } else if (hasUnsettled2026Due) {
        const remainingHist = Math.max(0, histAmt - histRepaid);
        reasons.push(`Unclosed 2026 loan (${remainingHist} AED) / 0 OB`);
      }
      reasons.push(`Monthly regularity: ${monthlyRegularityPct}%`);
    } else if (monthsSinceClosure !== null && monthsSinceClosure <= 3) {
      tier = 'COOLDOWN';
      tierRank = 2;
      tierLabel = `Cooldown • Closed ${monthsSinceClosure} mo${monthsSinceClosure === 1 ? '' : 's'} ago (< 3 mos)`;
      score = 200 + monthsSinceClosure * 10 + monthlyRegularityPct * 0.5 + loanRepayRegularity;
      reasons.push(`Closed loan ${monthsSinceClosure} mo${monthsSinceClosure === 1 ? '' : 's'} ago (3-mo cooldown)`);
      if (histRepayMonths > 0) {
        reasons.push(`Regular loan repayments (${histRepayMonths} installments)`);
      }
      reasons.push(`Monthly regularity: ${monthlyRegularityPct}%`);
    } else {
      tier = 'ELIGIBLE';
      tierRank = 3;
      const closureMos = monthsSinceClosure !== null ? monthsSinceClosure : (monthsSinceIssue || 0);
      const issueMos = monthsSinceIssue !== null ? monthsSinceIssue : 0;
      tierLabel = monthsSinceClosure !== null
        ? `Eligible • Closed ${monthsSinceClosure} mos ago`
        : `Eligible • Last request ${issueMos} mos ago`;
      score = 600 + closureMos * 15 + issueMos * 5 + monthlyRegularityPct * 0.8 + loanRepayRegularity;
      if (monthsSinceClosure !== null) {
        reasons.push(`Loan closed ${monthsSinceClosure} mos ago`);
      }
      if (monthsSinceIssue !== null) {
        reasons.push(`Last loan issued ${issueMos} mos ago`);
      }
      if (histRepayMonths > 0) {
        reasons.push(`Repaid regularly (${histRepayMonths} installments)`);
      }
      reasons.push(`Monthly regularity: ${monthlyRegularityPct}%`);
    }

    return {
      name,
      ob,
      tier,
      tierRank,
      tierLabel,
      score: Math.round(score),
      monthlyRegularityPct,
      everTookLoan,
      hasActiveDue,
      monthsSinceClosure,
      monthsSinceIssue,
      reasons
    };
  });

  // Sort highest priority first
  results.sort((a, b) => {
    if (b.tierRank !== a.tierRank) return b.tierRank - a.tierRank;
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });

  return results.map((item, idx) => ({
    rank: idx + 1,
    ...item
  }));
}
