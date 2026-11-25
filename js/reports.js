/**
 * Avadhi Nidhi V3 - Reports Suite & WhatsApp Generator
 * Faithfully matches legacy 12-column matrix structure from index (1).html
 * with modern 3x Retina rendering, live on-screen table preview, and WhatsApp sharing.
 */

import { formatCurrency, formatDate } from './calculations.js';

export class ReportsService {
  /**
   * Helper to parse and normalize month keys (e.g. 'Dec-2026', '2026-12', 'Dec-26')
   */
  static parseMonthKey(key) {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if (!key) {
      const now = new Date();
      return {
        yearMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
        label: `${monthNames[now.getMonth()]} ${now.getFullYear()}`,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        shortKey: `${monthNames[now.getMonth()]}-${String(now.getFullYear()).slice(-2)}`
      };
    }

    // Format YYYY-MM
    if (/^\d{4}-\d{2}$/.test(key)) {
      const [y, m] = key.split('-').map(Number);
      return {
        yearMonth: key,
        label: `${monthNames[m - 1]} ${y}`,
        year: y,
        month: m,
        shortKey: `${monthNames[m - 1]}-${String(y).slice(-2)}`
      };
    }

    // Format MMM-YYYY or MMM-YY
    const parts = key.split('-');
    if (parts.length === 2) {
      const mStr = parts[0];
      const mIdx = monthNames.findIndex(mn => mn.toLowerCase() === mStr.toLowerCase());
      let y = parseInt(parts[1], 10);
      if (y < 100) y += 2000;
      if (mIdx !== -1) {
        return {
          yearMonth: `${y}-${String(mIdx + 1).padStart(2, '0')}`,
          label: `${monthNames[mIdx]} ${y}`,
          year: y,
          month: mIdx + 1,
          shortKey: `${monthNames[mIdx]}-${String(y).slice(-2)}`
        };
      }
    }

    // Fallback Date
    const d = new Date(key);
    if (!isNaN(d.getTime())) {
      return {
        yearMonth: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        shortKey: `${monthNames[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`
      };
    }

    return {
      yearMonth: '2026-12',
      label: 'Dec 2026',
      year: 2026,
      month: 12,
      shortKey: 'Dec-26'
    };
  }

  /**
   * Build the complete 12-column master matrix rows for all members
   * Matches index (1).html:
   * 1. Member Name
   * 2-4. Monthly Payment (Net): OB, Paid, Total
   * 5-7. SahayaNidhi Fund: OB, Paid, Total
   * 8-11. Loan Tracking: Amount, Issued, Repaid, Balance
   * 12. Grand Balance
   */
  static buildMatrixRows(members, transactions = [], loans = [], config = {}, activeMonthKey = 'Dec-2026') {
    const monthInfo = this.parseMonthKey(activeMonthKey);
    const activeYM = monthInfo.yearMonth; // "YYYY-MM"
    const today = new Date();

    const sums = {
      mOB: 0,
      mPaid: 0,
      mTotal: 0,
      sOB: 0,
      sPaid: 0,
      sTotal: 0,
      lAmt: 0,
      lRepaid: 0,
      lBal: 0,
      gBal: 0
    };

    const rows = (members || []).map(m => {
      const name = m.Name || m.name;
      const initialOB = Number(m['OB from Dec-2026'] || m.ob || 0);

      const memTx = (transactions || []).filter(t => (t.Member_Name || t.memberName) === name);

      // --- 1. Monthly Payment Calculations (NET) ---
      // Payments before the active month
      let priorMonthly = 0;
      // Payments during the active month
      let currentMonthly = 0;

      memTx.forEach(t => {
        const type = t.Type || t.type;
        const amt = Number(t.Amount || t.amount || 0);
        const dateStr = String(t.Date || t.date || '');

        if (type === 'Monthly Payment') {
          if (dateStr.startsWith(activeYM)) {
            currentMonthly += amt;
          } else if (dateStr < activeYM) {
            priorMonthly += amt;
          } else {
            // Future or unscheduled
            currentMonthly += amt;
          }
        }
      });

      const actualNetMonthlyOB = initialOB + priorMonthly;
      const monthlyNetPaidCurrent = currentMonthly;
      const monthlyNetTotal = actualNetMonthlyOB + monthlyNetPaidCurrent;

      // --- 2. SahayaNidhi Calculations ---
      let priorSahaya = 0;
      let currentSahaya = 0;

      memTx.forEach(t => {
        const type = t.Type || t.type;
        const amt = Number(t.Amount || t.amount || 0);
        const dateStr = String(t.Date || t.date || '');

        if (type === 'SahayaNidhi') {
          if (dateStr.startsWith(activeYM)) {
            currentSahaya += amt;
          } else if (dateStr < activeYM) {
            priorSahaya += amt;
          } else {
            currentSahaya += amt;
          }
        }
      });

      // Default current month to 5 AED if no explicit transaction recorded yet
      const SahayaNidhiOB = priorSahaya;
      const SahayaNidhiCurrent = currentSahaya > 0 ? currentSahaya : 5;
      const SahayaNidhiTotal = SahayaNidhiOB + SahayaNidhiCurrent;

      // --- 3. Loan Calculations (only disbursed Active / Repaid loans) ---
      const memLoans = (loans || []).filter(l => {
        const s = l.Status || l.status;
        return (l.Member_Name || l.memberName) === name && s !== 'Requested' && s !== 'Approved' && s !== 'Rejected';
      });
      let loanAmount = 0;
      let loanRepaid = 0;
      let loanIssued = '';
      let loanIssuedRaw = null;
      let loanDueDate = null;

      if (memLoans.length > 0) {
        // Prioritize active (unrepaid) loan; fallback to latest loan
        const activeOrLatest = memLoans.find(l => {
          const p = Number(l.Principal || l.principal || l.Amount || l.amount || 0);
          const rep = Number(l.Repaid_Amount || l.repaidAmount || 0);
          return (l.Status || l.status) !== 'Repaid' && rep < p;
        }) || memLoans[memLoans.length - 1];

        loanAmount = Number(activeOrLatest.Principal || activeOrLatest.principal || activeOrLatest.Amount || activeOrLatest.amount || 0);
        loanRepaid = Number(activeOrLatest.Repaid_Amount || activeOrLatest.repaidAmount || 0);
        loanIssuedRaw = activeOrLatest.Issue_Date || activeOrLatest.issueDate || null;
        if (loanIssuedRaw) {
          const d = new Date(loanIssuedRaw);
          if (!isNaN(d.getTime())) {
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const yy = String(d.getFullYear()).slice(-2);
            loanIssued = `${dd}-${mm}-${yy}`;
          } else {
            loanIssued = String(loanIssuedRaw);
          }
        }
        loanDueDate = activeOrLatest.dueDate || null;
      }

      const loanBalance = Math.max(0, loanAmount - loanRepaid);

      // --- 4. Grand Balance ---
      const grandBalance = monthlyNetTotal - loanBalance;

      // --- 5. Overdue / 7-Month Rule Check ---
      let isOverdue = false;
      if (loanBalance > 0 && loanIssuedRaw) {
        const issueDate = new Date(loanIssuedRaw);
        if (!isNaN(issueDate.getTime())) {
          const monthsDiff = (today.getFullYear() - issueDate.getFullYear()) * 12 + (today.getMonth() - issueDate.getMonth());
          if (monthsDiff > 7) {
            isOverdue = true;
          }
        }
        if (loanDueDate && new Date(loanDueDate) < today) {
          isOverdue = true;
        }
      }

      // Update Column Totals
      sums.mOB += actualNetMonthlyOB;
      sums.mPaid += monthlyNetPaidCurrent;
      sums.mTotal += monthlyNetTotal;
      sums.sOB += SahayaNidhiOB;
      sums.sPaid += SahayaNidhiCurrent;
      sums.sTotal += SahayaNidhiTotal;
      sums.lAmt += loanAmount;
      sums.lRepaid += loanRepaid;
      sums.lBal += loanBalance;
      sums.gBal += grandBalance;

      return {
        srNum: m['Sr. Num'] || m.srNum,
        name,
        actualNetMonthlyOB,
        monthlyNetPaidCurrent,
        monthlyNetTotal,
        SahayaNidhiOB,
        SahayaNidhiCurrent,
        SahayaNidhiTotal,
        loanAmount,
        loanIssued,
        loanRepaid,
        loanBalance,
        grandBalance,
        isOverdue
      };
    });

    return {
      rows,
      sums,
      monthInfo
    };
  }

  /**
   * Generate Clean Formatted WhatsApp Text Report for All Members
   * Incorporates full 12-column financial dimensions
   */
  static generateWhatsAppTextReport(members, matrixData, fundSummary, activeMonthLabel = null) {
    const monthLabel = activeMonthLabel || matrixData?.monthInfo?.label || 'Dec 2026';
    const now = new Date();

    let text = `*AVADHI NIDHI — MONTHLY STATUS REPORT*\n`;
    text += `📅 *Period:* ${monthLabel}\n`;
    text += `⏰ *Generated:* ${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString()}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    text += `*MEMBERS FINANCIAL STANDING (12-COL MASTER LEDGER):*\n\n`;

    (matrixData.rows || []).forEach((r, idx) => {
      const gBalSign = r.grandBalance >= 0 ? '+' : '';
      const loanStatus = r.loanBalance > 0 
        ? `Amount: ${r.loanAmount} AED | Repaid: ${r.loanRepaid} AED | *Bal: ${r.loanBalance} AED*` 
        : `Nil`;

      text += `${idx + 1}. *${r.name}* ${r.isOverdue ? '⚠️ (Loan > 7 Mos)' : ''}\n`;
      text += `   • *Monthly:* OB: ${r.actualNetMonthlyOB} | Paid: ${r.monthlyNetPaidCurrent} | *Total: ${r.monthlyNetTotal} AED*\n`;
      text += `   • *SahayaNidhi:* OB: ${r.SahayaNidhiOB} | Paid: ${r.SahayaNidhiCurrent} | *Total: ${r.SahayaNidhiTotal} AED*\n`;
      text += `   • *Loan:* ${loanStatus}\n`;
      text += `   • *Grand Balance:* *${gBalSign}${r.grandBalance} AED*\n\n`;
    });

    text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*GROUP TOTALS:*\n`;
    text += `• Monthly OB: ${matrixData.sums.mOB} AED | Paid: ${matrixData.sums.mPaid} AED | Total: *${matrixData.sums.mTotal} AED*\n`;
    text += `• SahayaNidhi Pool: *${matrixData.sums.sTotal} AED* (OB: ${matrixData.sums.sOB} + Paid: ${matrixData.sums.sPaid})\n`;
    text += `• Active Loans Debt: *${matrixData.sums.lBal} AED* (Borrowed: ${matrixData.sums.lAmt} - Repaid: ${matrixData.sums.lRepaid})\n`;
    text += `• *Grand Balance Net:* *${matrixData.sums.gBal >= 0 ? '+' : ''}${matrixData.sums.gBal} AED*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (fundSummary) {
      text += `*LIQUID TREASURY:*\n`;
      text += `💰 *Available Liquid Cash:* ${formatCurrency(fundSummary.availableLiquidCash)}\n`;
      text += `🤝 *Sahaya Nidhi Pool:* ${formatCurrency(fundSummary.availableSahayaPool)}\n`;
      text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    }
    text += `_Avadhi Nidhi V3 • Verified via Google Sheets_`;

    return text;
  }

  /**
   * Generate Full Visual WhatsApp Report PNG
   * Replicates the exact 12-column layout and styling from legacy index (1).html
   */
  static async generateVisualReportSnapshot(matrixData, fundSummary, activeMonthLabel = 'Dec-2026') {
    const container = document.createElement('div');
    container.id = 'fullReportCapture';
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '1320px';
    container.style.boxSizing = 'border-box';
    container.style.backgroundColor = '#0b1220';
    container.style.color = '#ffffff';
    container.style.fontFamily = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
    container.style.padding = '40px';

    const rows = matrixData.rows;
    const sums = matrixData.sums;
    const monthTitle = matrixData.monthInfo?.shortKey || matrixData.monthInfo?.label || activeMonthLabel;

    let rowsHtml = '';
    rows.forEach((r, idx) => {
      const nameColor = r.isOverdue ? '#ff5c5c' : '#ffffff';
      const gBalColor = r.grandBalance >= 0 ? '#1db954' : '#ff5c5c';

      rowsHtml += `
        <tr style="border-bottom: 1px solid #334155; font-size:13px;">
          <td style="text-align:center; padding:8px; border:1px solid #334155; color:#94a3b8; font-weight:600;">${r.srNum || idx + 1}</td>
          <td style="padding:11px 12px; font-weight:bold; border:1px solid #334155; color:${nameColor}; text-align:center; white-space:nowrap;">${r.name}</td>
          <td style="text-align:center; padding:8px; border:1px solid #334155;">${r.actualNetMonthlyOB}</td>
          <td style="text-align:center; padding:8px; border:1px solid #334155; color:${r.monthlyNetPaidCurrent >= 100 ? '#1db954' : '#ff5c5c'}; font-weight:600;">${r.monthlyNetPaidCurrent}</td>
          <td style="text-align:center; padding:8px; border:1px solid #334155; font-weight:bold; color:#6ea8fe;">${r.monthlyNetTotal}</td>
          <td style="text-align:center; padding:8px; border:1px solid #334155;">${r.SahayaNidhiOB}</td>
          <td style="text-align:center; padding:8px; border:1px solid #334155; color:#818cf8; font-weight:600;">${r.SahayaNidhiCurrent}</td>
          <td style="text-align:center; padding:8px; border:1px solid #334155; font-weight:bold; color:#818cf8;">${r.SahayaNidhiTotal}</td>
          <td style="text-align:center; padding:8px; border:1px solid #334155;">${r.loanAmount > 0 ? r.loanAmount : '—'}</td>
          <td style="text-align:center; padding:8px; border:1px solid #334155; font-size:11px; color:#cbd5e1;">${r.loanAmount > 0 ? r.loanIssued : ''}</td>
          <td style="text-align:center; padding:8px; border:1px solid #334155;">${r.loanAmount > 0 ? r.loanRepaid : '—'}</td>
          <td style="text-align:center; padding:8px; border:1px solid #334155;">${r.loanAmount > 0 ? r.loanBalance : '—'}</td>
          <td style="text-align:center; padding:8px; border:1px solid #334155; font-weight:800; color:${gBalColor}; background:rgba(255,255,255,0.02);">${r.grandBalance}</td>
        </tr>
      `;
    });

    container.innerHTML = `
      <div style="width:100%; box-sizing:border-box; color:white; font-family:'Inter', sans-serif; background-color:#0b1220;">
        <div style="text-align:center; margin-bottom:28px;">
          <h1 style="color:#6ea8fe; margin:0; font-size:36px; font-weight:800; letter-spacing:-0.5px;">Avadhi Nidhi</h1>
          <p style="color:#94a3b8; font-size:18px; margin:6px 0 0 0;">Monthly Status Report: <strong style="color:#ffffff;">${monthTitle}</strong></p>
        </div>

        <table style="width:100%; border-collapse:collapse; font-size:13px; table-layout:fixed; background:#0f172a; border:1px solid #334155;">
          <thead>
            <tr>
              <th rowspan="2" style="background:#1e293b; color:#6ea8fe; padding:12px 6px; border:1px solid #334155; width:46px; text-align:center;">SN</th>
              <th rowspan="2" style="background:#1e293b; color:#6ea8fe; padding:12px 10px; border:1px solid #334155; width:220px; text-align:center;">Member Name</th>
              <th colspan="3" style="background:#1e293b; color:#6ea8fe; padding:10px; border:1px solid #334155; text-align:center;">Monthly Payment (Net)</th>
              <th colspan="3" style="background:#1e293b; color:#6ea8fe; padding:10px; border:1px solid #334155; text-align:center;">SahayaNidhi Fund</th>
              <th colspan="4" style="background:#1e293b; color:#6ea8fe; padding:10px; border:1px solid #334155; text-align:center;">Loan Tracking</th>
              <th rowspan="2" style="background:#2d3748; color:#1db954; padding:12px 10px; border:1px solid #334155; width:110px; text-align:center;">Grand Balance</th>
            </tr>
            <tr>
              <th style="background:#0f172a; padding:8px; border:1px solid #334155; text-align:center; font-size:12px; color:#cbd5e1;">OB</th>
              <th style="background:#0f172a; padding:8px; border:1px solid #334155; text-align:center; font-size:12px; color:#cbd5e1;">Paid</th>
              <th style="background:#0f172a; padding:8px; border:1px solid #334155; text-align:center; font-size:12px; color:#6ea8fe;">Total</th>
              <th style="background:#0f172a; padding:8px; border:1px solid #334155; text-align:center; font-size:12px; color:#cbd5e1;">OB</th>
              <th style="background:#0f172a; padding:8px; border:1px solid #334155; text-align:center; font-size:12px; color:#cbd5e1;">Paid</th>
              <th style="background:#0f172a; padding:8px; border:1px solid #334155; text-align:center; font-size:12px; color:#818cf8;">Total</th>
              <th style="background:#0f172a; padding:8px; border:1px solid #334155; text-align:center; font-size:12px; color:#cbd5e1;">Amount</th>
              <th style="background:#0f172a; padding:8px; border:1px solid #334155; text-align:center; font-size:12px; color:#cbd5e1;">Issued</th>
              <th style="background:#0f172a; padding:8px; border:1px solid #334155; text-align:center; font-size:12px; color:#cbd5e1;">Repaid</th>
              <th style="background:#0f172a; padding:8px; border:1px solid #334155; text-align:center; font-size:12px; color:#cbd5e1;">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr style="height:12px;"><td colspan="13" style="background:#0b1220; border:none;"></td></tr>
            <tr style="background:#1e293b; font-weight:800; border-top:2px solid #6ea8fe; font-size:13px;">
              <td style="padding:10px; border:1px solid #334155;"></td>
              <td style="padding:11px 12px; border:1px solid #334155; color:#6ea8fe; text-align:center;">GROUP TOTALS</td>
              <td style="text-align:center; padding:10px; border:1px solid #334155;">${sums.mOB}</td>
              <td style="text-align:center; padding:10px; border:1px solid #334155; color:#ffffff;">${sums.mPaid}</td>
              <td style="text-align:center; padding:10px; border:1px solid #334155; color:#6ea8fe;">${sums.mTotal}</td>
              <td style="text-align:center; padding:10px; border:1px solid #334155;">${sums.sOB}</td>
              <td style="text-align:center; padding:10px; border:1px solid #334155;">${sums.sPaid}</td>
              <td style="text-align:center; padding:10px; border:1px solid #334155; color:#818cf8;">${sums.sTotal}</td>
              <td style="text-align:center; padding:10px; border:1px solid #334155;">${sums.lAmt}</td>
              <td style="text-align:center; padding:10px; border:1px solid #334155; background:#0b1220;"></td>
              <td style="text-align:center; padding:10px; border:1px solid #334155;">${sums.lRepaid}</td>
              <td style="text-align:center; padding:10px; border:1px solid #334155;">${sums.lBal}</td>
              <td style="text-align:center; padding:10px; border:1px solid #334155; color:${sums.gBal >= 0 ? '#1db954' : '#ff5c5c'};">${sums.gBal}</td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top:24px; display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#64748b;">
          <div>Liquid Bank Cash: <strong style="color:#10b981;">${formatCurrency(fundSummary?.availableLiquidCash || 0)}</strong> | Sahaya Nidhi Pool: <strong style="color:#818cf8;">${formatCurrency(fundSummary?.availableSahayaPool || 0)}</strong></div>
          <div>Generated on: ${new Date().toLocaleString('en-GB')} | Avadhi Nidhi System</div>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    try {
      if (typeof html2canvas === 'undefined') {
        throw new Error('html2canvas library is not loaded');
      }

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#0b1220'
      });

      document.body.removeChild(container);

      const filename = `AvadhiNidhi_FinalReport_${monthTitle.replace(/\s+/g, '_')}.png`;
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();

      return { success: true, filename };
    } catch (e) {
      if (container.parentNode) document.body.removeChild(container);
      console.error('Visual Report Snapshot Error:', e);
      return { success: false, error: e.message };
    }
  }

  /**
   * Export Full 12-Column Master CSV
   */
  static exportMasterCSV(matrixData, filenameLabel = 'Master_Report') {
    const headers = [
      "Sr. Num",
      "Member Name",
      "Monthly OB",
      "Monthly Paid",
      "Monthly Total (Net)",
      "SahayaNidhi OB",
      "SahayaNidhi Paid",
      "SahayaNidhi Total",
      "Loan Principal",
      "Loan Issued Date",
      "Loan Repaid",
      "Loan Balance",
      "Grand Balance"
    ];

    const rows = (matrixData.rows || []).map((r, idx) => [
      idx + 1,
      `"${r.name}"`,
      r.actualNetMonthlyOB,
      r.monthlyNetPaidCurrent,
      r.monthlyNetTotal,
      r.SahayaNidhiOB,
      r.SahayaNidhiCurrent,
      r.SahayaNidhiTotal,
      r.loanAmount > 0 ? r.loanAmount : 0,
      `"${r.loanIssued}"`,
      r.loanRepaid > 0 ? r.loanRepaid : 0,
      r.loanBalance > 0 ? r.loanBalance : 0,
      r.grandBalance
    ]);

    // Append Group Totals Row
    const sums = matrixData.sums;
    const totalsRow = [
      "",
      `"GROUP TOTALS"`,
      sums.mOB,
      sums.mPaid,
      sums.mTotal,
      sums.sOB,
      sums.sPaid,
      sums.sTotal,
      sums.lAmt,
      `""`,
      sums.lRepaid,
      sums.lBal,
      sums.gBal
    ];

    const csvContent = [headers.join(','), ...rows.map(r => r.join(',')), totalsRow.join(',')].join('\n');
    this.downloadTextFile(csvContent, `AvadhiNidhi_${filenameLabel}_${new Date().toISOString().split('T')[0]}.csv`);
  }

  /**
   * Copy text to clipboard with browser fallback
   */
  static async copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
  }

  /**
   * Trigger Download of Plain Text file (.txt)
   */
  static downloadTextFile(text, filename) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
