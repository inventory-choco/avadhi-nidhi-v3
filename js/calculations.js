/**
 * Avadhi Nidhi V3 - Financial & Rule Engine Calculations
 */

import { APP_CONFIG } from './data.js';

/**
 * Format currency in AED
 */
export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: 'AED',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(num).replace('AED', '').trim() + ' AED';
}

/**
 * Format simple date YYYY-MM-DD to readable (e.g. 21 Oct 2026)
 */
export function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Calculate Emergency Loan Due Date
 * Rule: Duration is 1 month excluding remaining days of current month.
 * Example: Issued on 21 OCT 2026 -> Due on or before 30 NOV 2026.
 * It is due on the LAST DAY of the NEXT month!
 */
export function calculateEmergencyLoanDueDate(issueDateStr) {
  const date = issueDateStr ? new Date(issueDateStr) : new Date();
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed: 0 = Jan, 9 = Oct

  // Month M + 2 with day 0 gives the last day of month M + 1
  const dueDate = new Date(year, month + 2, 0);
  
  const y = dueDate.getFullYear();
  const m = String(dueDate.getMonth() + 1).padStart(2, '0');
  const d = String(dueDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Validate Vacation Loan Notice Requirement
 * Rule: Must request at least 25 days prior to the needed date.
 */
export function validateVacationLoanNotice(requestDateStr, neededDateStr) {
  if (!requestDateStr || !neededDateStr) {
    return { isValid: false, daysNotice: 0, minRequired: APP_CONFIG.vacationLoanNoticeDays };
  }

  const req = new Date(requestDateStr);
  const need = new Date(neededDateStr);
  const diffTime = need.getTime() - req.getTime();
  const daysNotice = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return {
    isValid: daysNotice >= APP_CONFIG.vacationLoanNoticeDays,
    daysNotice: daysNotice,
    minRequired: APP_CONFIG.vacationLoanNoticeDays
  };
}

/**
 * Check Annual Loan Quota Eligibility
 * Rule: 1 Emergency Loan and 1 Vacation Loan per calendar year per member.
 */
export function checkAnnualLoanEligibility(loans, memberName, loanType, targetYear) {
  const year = targetYear || new Date().getFullYear();
  
  const matchingLoans = loans.filter(l => {
    if (l.Member_Name !== memberName && l.memberName !== memberName) return false;
    const type = l.Type || l.type;
    if (type !== loanType) return false;

    const issueDate = l.Issue_Date || l.issueDate || l.Date || l.date;
    if (!issueDate) return false;
    const loanYear = new Date(issueDate).getFullYear();
    return loanYear === year;
  });

  const isEligible = matchingLoans.length === 0;
  return {
    isEligible: isEligible,
    usedCount: matchingLoans.length,
    year: year,
    existingLoan: matchingLoans[0] || null
  };
}

/**
 * Split monthly payment into Savings (100) and SahayaNidhi (5)
 * Standard is 105 AED (100 savings + 5 charity).
 * If less than 5 is paid, all goes to charity.
 * If 100 is paid, 95 to savings and 5 to charity.
 */
export function splitMonthlyPayment(totalAmount) {
  const total = Number(totalAmount) || 0;
  if (total <= 0) {
    return { savings: 0, sahaya: 0, total: 0 };
  }
  const sahaya = Math.min(5, total);
  const savings = total - sahaya;
  return {
    savings,
    sahaya,
    total
  };
}

/**
 * Calculate per-member account summaries
 */
export function calculateMemberSummaries(members, transactions, loans) {
  return members.map(m => {
    const name = m.Name || m.name;
    const ob = Number(m['OB from Dec-2026'] || m.ob || 0);

    // Sum monthly savings payments
    const memberTx = transactions.filter(t => (t.Member_Name || t.memberName) === name);
    
    let totalSavingsContributed = 0;
    let totalSahayaContributed = 0;
    let totalLoanRepaymentsMade = 0;

    memberTx.forEach(t => {
      const type = t.Type || t.type;
      const amt = Number(t.Amount || t.amount || 0);
      if (type === 'Monthly Payment') {
        totalSavingsContributed += amt;
      } else if (type === 'SahayaNidhi') {
        totalSahayaContributed += amt;
      } else if (type === 'Loan Repayment') {
        totalLoanRepaymentsMade += amt;
      }
    });

    // Net Savings Balance (OB + monthly payments)
    const currentSavingsBalance = ob + totalSavingsContributed;

    // Check loans
    const memberLoans = loans.filter(l => (l.Member_Name || l.memberName) === name);
    let totalBorrowed = 0;
    let totalRepaid = 0;
    let activeLoan = null;

    memberLoans.forEach(l => {
      const principal = Number(l.Amount || l.amount || 0);
      const repaid = Number(l.Repaid_Amount || l.repaidAmount || 0);
      totalBorrowed += principal;
      totalRepaid += repaid;

      const status = l.Status || l.status || (repaid >= principal ? 'Repaid' : 'Active');
      if (status !== 'Repaid' && repaid < principal) {
        activeLoan = {
          ...l,
          principal,
          repaid,
          outstanding: principal - repaid
        };
      }
    });

    const outstandingLoanDebt = totalBorrowed - totalRepaid;

    // Quotas for current year
    const currentYear = new Date().getFullYear();
    const emergencyQuota = checkAnnualLoanEligibility(loans, name, 'Emergency Loan', currentYear);
    const vacationQuota = checkAnnualLoanEligibility(loans, name, 'Vacation Loan', currentYear);

    return {
      srNum: m['Sr. Num'] || m.srNum,
      name: name,
      ob: ob,
      phone: m.Phone || m.phone || '',
      email: m.Email || m.email || '',
      type: m.Type || m.type || 'Member',
      currentSavingsBalance,
      totalSavingsContributed,
      totalSahayaContributed,
      totalBorrowed,
      totalRepaid,
      outstandingLoanDebt,
      activeLoan,
      hasActiveLoan: outstandingLoanDebt > 0,
      emergencyEligible: emergencyQuota.isEligible,
      vacationEligible: vacationQuota.isEligible,
      hasNegativeOB: ob < 0
    };
  });
}

/**
 * Calculate Global Fund Summary Metrics
 */
export function calculateFundSummary(members, transactions, loans, sahayaRecords) {
  const memberSummaries = calculateMemberSummaries(members, transactions, loans);

  // 1. Opening Balance Total
  const totalOpeningBalance = memberSummaries.reduce((sum, m) => sum + m.ob, 0);

  // 2. Total Monthly Savings Contributions
  const totalSavingsContributed = memberSummaries.reduce((sum, m) => sum + m.totalSavingsContributed, 0);

  // 3. Total Member Savings Liability (Total funds belonging to members)
  const totalMemberSavingsBalance = totalOpeningBalance + totalSavingsContributed;

  // 4. SahayaNidhi Charity Pool
  let totalSahayaCollected = 0;
  transactions.forEach(t => {
    const type = t.Type || t.type;
    const amt = Number(t.Amount || t.amount || 0);
    if (type === 'SahayaNidhi') {
      totalSahayaCollected += amt;
    }
  });

  // Calculate Sahaya disbursements / expenses
  let totalSahayaDisbursed = 0;
  sahayaRecords.forEach(s => {
    const type = s.Type || s.type;
    const amt = Number(s.Amount || s.amount || 0);
    if (type === 'Charity Disbursement' || type === 'Expense') {
      totalSahayaDisbursed += amt;
    }
  });

  const availableSahayaPool = totalSahayaCollected - totalSahayaDisbursed;

  // 5. Loans
  let totalLoansIssued = 0;
  let totalLoansRepaid = 0;
  transactions.forEach(t => {
    const type = t.Type || t.type;
    const amt = Number(t.Amount || t.amount || 0);
    if (type === 'Loan issued' || type === 'Loan Issued') {
      totalLoansIssued += amt;
    } else if (type === 'Loan Repayment') {
      totalLoansRepaid += amt;
    }
  });

  const activeLoansOutstanding = totalLoansIssued - totalLoansRepaid;

  // 6. Liquid Cash Available in Fund (in bank or cash box)
  // Cash In: Opening balances + Savings Paid + Sahaya Collected + Loan Repayments
  // Cash Out: Loans Issued + Sahaya Disbursed
  const availableLiquidCash = totalOpeningBalance + totalSavingsContributed + totalSahayaCollected + totalLoansRepaid - totalLoansIssued - totalSahayaDisbursed;

  // Total Net Fund Worth
  const totalFundWorth = availableLiquidCash + activeLoansOutstanding;

  return {
    totalMembers: members.length,
    totalOpeningBalance,
    totalSavingsContributed,
    totalMemberSavingsBalance,
    totalSahayaCollected,
    totalSahayaDisbursed,
    availableSahayaPool,
    totalLoansIssued,
    totalLoansRepaid,
    activeLoansOutstanding,
    availableLiquidCash,
    totalFundWorth,
    memberSummaries
  };
}
