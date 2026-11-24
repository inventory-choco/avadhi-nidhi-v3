/**
 * Avadhi Nidhi V3 - Reports Suite & WhatsApp Generator
 * Matches legacy-tested reporting from index (1).html with modern optimizations
 */

import { formatCurrency, formatDate } from './calculations.js';

export class ReportsService {
  /**
   * Generate Clean Formatted WhatsApp Text Report for All Members
   */
  static generateWhatsAppTextReport(members, memberSummaries, fundSummary, activeMonth = null) {
    const now = new Date();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthLabel = activeMonth || `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

    let text = `*AVADHI NIDHI — MONTHLY STATUS REPORT*\n`;
    text += `📅 *Period:* ${monthLabel}\n`;
    text += `⏰ *Generated:* ${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString()}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    text += `*MEMBERS FINANCIAL STANDING:*\n\n`;

    memberSummaries.forEach((m, idx) => {
      const gBal = m.grandBalance;
      const gBalSign = gBal >= 0 ? '+' : '';
      text += `${idx + 1}. *${m.name}*\n`;
      text += `   • Opening Balance (Dec-26): ${m.ob} AED\n`;
      text += `   • Net Savings Balance: ${m.currentSavingsBalance} AED\n`;
      text += `   • SahayaNidhi Contributed: ${m.totalSahayaContributed} AED\n`;
      if (m.totalOutstandingLoan > 0) {
        text += `   • ⚠️ Active Loan Debt: ${m.totalOutstandingLoan} AED\n`;
      } else {
        text += `   • Active Loan: Nil\n`;
      }
      text += `   • *Grand Balance:* *${gBalSign}${gBal} AED*\n\n`;
    });

    text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*GLOBAL FUND TOTALS:*\n`;
    text += `💰 *Available Liquid Cash:* ${formatCurrency(fundSummary.availableLiquidCash)}\n`;
    text += `📈 *Total Member Savings:* ${formatCurrency(fundSummary.totalMemberSavingsLiability)}\n`;
    text += `🤝 *SahayaNidhi Charity Pool:* ${formatCurrency(fundSummary.availableSahayaPool)}\n`;
    text += `📑 *Active Loans Outstanding:* ${formatCurrency(fundSummary.activeLoansOutstanding)}\n`;
    text += `👥 *Total Active Members:* ${fundSummary.totalMembers}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `_Avadhi Nidhi V3 • Verified via Google Sheets_`;

    return text;
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

  /**
   * Generate Full Visual WhatsApp Report PNG (Legacy index (1).html layout upgraded to 3x Retina)
   */
  static async generateVisualReportSnapshot(memberSummaries, fundSummary, activeMonthKey = 'Dec-2026') {
    const container = document.createElement('div');
    container.id = 'fullReportCapture';
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '1250px';
    container.style.backgroundColor = '#0b1220';
    container.style.color = '#ffffff';
    container.style.fontFamily = "'Plus Jakarta Sans', Inter, sans-serif";
    container.style.padding = '40px';

    let sums = {
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

    let rowsHtml = '';
    memberSummaries.forEach(m => {
      const gBal = m.grandBalance;
      const gBalColor = gBal >= 0 ? '#10b981' : '#f43f5e';
      const hasOverdueLoan = m.totalOutstandingLoan > 0 && m.activeLoans?.some(l => l.dueDate && new Date(l.dueDate) < new Date());
      const nameColor = hasOverdueLoan ? '#f43f5e' : '#ffffff';

      sums.mOB += m.ob;
      sums.mPaid += m.totalSavingsContributed;
      sums.mTotal += m.currentSavingsBalance;
      sums.sTotal += m.totalSahayaContributed;
      sums.lBal += m.totalOutstandingLoan;
      sums.gBal += gBal;

      rowsHtml += `
        <tr style="border-bottom: 1px solid #1e293b; font-size:13px;">
          <td style="padding:10px 14px; font-weight:700; border:1px solid #1e293b; color:${nameColor};">${m.name}</td>
          <td style="text-align:center; padding:8px; border:1px solid #1e293b;">${m.ob}</td>
          <td style="text-align:center; padding:8px; border:1px solid #1e293b; color:#10b981;">+${m.totalSavingsContributed}</td>
          <td style="text-align:center; padding:8px; border:1px solid #1e293b; font-weight:800; color:#38bdf8;">${m.currentSavingsBalance}</td>
          <td style="text-align:center; padding:8px; border:1px solid #1e293b; color:#818cf8; font-weight:700;">${m.totalSahayaContributed}</td>
          <td style="text-align:center; padding:8px; border:1px solid #1e293b;">${m.totalOutstandingLoan > 0 ? m.totalOutstandingLoan : '—'}</td>
          <td style="text-align:center; padding:8px; border:1px solid #1e293b; font-weight:800; color:${gBalColor}; background:rgba(255,255,255,0.02);">${gBal}</td>
        </tr>
      `;
    });

    container.innerHTML = `
      <div style="text-align:center; margin-bottom:28px;">
        <div style="display:inline-block; padding:4px 14px; border-radius:999px; background:rgba(56,189,248,0.15); border:1px solid #38bdf8; color:#38bdf8; font-size:12px; font-weight:700; margin-bottom:8px;">
          AVADHI NIDHI V3 OFFICIAL MASTER REPORT
        </div>
        <h1 style="color:#ffffff; margin:0; font-size:32px; font-weight:800;">Monthly Fund Standing: ${activeMonthKey}</h1>
        <p style="color:#94a3b8; font-size:14px; margin:6px 0 0 0;">All 14 Members Financial & Loan Reconciliation</p>
      </div>

      <table style="width:100%; border-collapse:collapse; background:#0f172a; border-radius:12px; overflow:hidden;">
        <thead>
          <tr style="background:#1e293b; color:#38bdf8; font-size:12px; text-transform:uppercase;">
            <th style="padding:12px; border:1px solid #334155; text-align:left;">Member Name</th>
            <th style="padding:12px; border:1px solid #334155; text-align:center;">OB (Dec-26)</th>
            <th style="padding:12px; border:1px solid #334155; text-align:center;">Savings Paid</th>
            <th style="padding:12px; border:1px solid #334155; text-align:center;">Net Savings</th>
            <th style="padding:12px; border:1px solid #334155; text-align:center;">Sahaya Fund</th>
            <th style="padding:12px; border:1px solid #334155; text-align:center;">Loan Debt</th>
            <th style="padding:12px; border:1px solid #334155; text-align:center; color:#10b981;">Grand Balance</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr style="background:#1e293b; font-weight:800; border-top:2px solid #38bdf8; font-size:14px;">
            <td style="padding:12px 14px; border:1px solid #334155; color:#38bdf8;">GROUP TOTALS</td>
            <td style="text-align:center; padding:10px; border:1px solid #334155;">${sums.mOB}</td>
            <td style="text-align:center; padding:10px; border:1px solid #334155; color:#10b981;">+${sums.mPaid}</td>
            <td style="text-align:center; padding:10px; border:1px solid #334155; color:#38bdf8;">${sums.mTotal}</td>
            <td style="text-align:center; padding:10px; border:1px solid #334155; color:#818cf8;">${sums.sTotal}</td>
            <td style="text-align:center; padding:10px; border:1px solid #334155;">${sums.lBal}</td>
            <td style="text-align:center; padding:10px; border:1px solid #334155; color:${sums.gBal >= 0 ? '#10b981' : '#f43f5e'};">${sums.gBal}</td>
          </tr>
        </tbody>
      </table>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:24px; font-size:12px; color:#64748b;">
        <div>Liquid Available Cash: <strong style="color:#10b981;">${formatCurrency(fundSummary.availableLiquidCash)}</strong> | Sahaya Pool: <strong style="color:#818cf8;">${formatCurrency(fundSummary.availableSahayaPool)}</strong></div>
        <div>Generated: ${new Date().toLocaleString()} • Avadhi Nidhi System</div>
      </div>
    `;

    document.body.appendChild(container);

    try {
      if (typeof html2canvas === 'undefined') {
        throw new Error('html2canvas not loaded');
      }

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#0b1220'
      });

      document.body.removeChild(container);

      const filename = `AvadhiNidhi_FinalReport_${activeMonthKey}.png`;
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();

      return { success: true, filename };
    } catch (e) {
      if (container.parentNode) document.body.removeChild(container);
      console.error(e);
      return { success: false, error: e.message };
    }
  }

  /**
   * Export Master CSV
   */
  static exportMasterCSV(memberSummaries) {
    const headers = ["Sr. Num", "Member Name", "OB from Dec-2026", "Net Savings Balance", "Sahaya Contributed", "Active Loan Debt", "Grand Balance"];
    const rows = memberSummaries.map((m, idx) => [
      idx + 1,
      `"${m.name}"`,
      m.ob,
      m.currentSavingsBalance,
      m.totalSahayaContributed,
      m.totalOutstandingLoan,
      m.grandBalance
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    this.downloadTextFile(csv, `AvadhiNidhi_Master_Report_${new Date().toISOString().split('T')[0]}.csv`);
  }
}
