/**
 * Avadhi Nidhi V3 - Automatic HD PNG Payment Receipt Generator
 * Generates crystal-clear 3x Retina HD PNG receipts optimized for WhatsApp sharing.
 * Filename format: {Total Amount paid}_{username}_{ddmmyy hhmmss}.png
 */

import { formatCurrency, formatDate } from './calculations.js';

export class ReceiptGenerator {
  /**
   * Format timestamp as ddmmyy hhmmss
   */
  static getTimestampStamp(dateObj = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    const dd = pad(dateObj.getDate());
    const mm = pad(dateObj.getMonth() + 1);
    const yy = String(dateObj.getFullYear()).slice(-2);
    const hh = pad(dateObj.getHours());
    const min = pad(dateObj.getMinutes());
    const ss = pad(dateObj.getSeconds());
    return `${dd}${mm}${yy} ${hh}${min}${ss}`;
  }

  /**
   * Sanitize username for filename while preserving spaces
   */
  static sanitizeFilename(name) {
    return String(name || 'Member')
      .replace(/[\\/:*?"<>|]/g, '')
      .trim();
  }

  /**
   * Generate crystal-clear 3x HD PNG receipt
   */
  static async generateReceipt(receiptData, autoDownload = true) {
    const amount = Number(receiptData.amount || receiptData.totalPayment || 0);
    const memberName = receiptData.memberName || 'Member';
    const adminName = receiptData.adminName || receiptData.updatedBy || 'Shuhaib Muhammed C.';
    const dateStr = receiptData.date || new Date().toISOString().split('T')[0];
    const receiptId = receiptData.receiptId || `AN-REC-${Date.now().toString().slice(-8)}`;
    const now = new Date();
    const stamp = this.getTimestampStamp(now);

    const allocations = receiptData.allocations || [
      { type: 'Monthly Payment', amount: amount, label: 'Monthly Payment' }
    ];

    const newSavingsBalance = receiptData.newSavingsBalance !== undefined ? receiptData.newSavingsBalance : null;
    const remainingLoan = receiptData.remainingLoan !== undefined ? receiptData.remainingLoan : null;

    // Create offscreen receipt DOM element
    const container = document.createElement('div');
    container.id = 'hd-receipt-offscreen';
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '640px';
    container.style.backgroundColor = '#0b1324';
    container.style.color = '#ffffff';
    container.style.fontFamily = "'Plus Jakarta Sans', -apple-system, sans-serif";
    container.style.padding = '0';
    container.style.borderRadius = '24px';
    container.style.overflow = 'hidden';

    // Build allocation rows HTML
    const allocRowsHtml = allocations.map(a => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:12px; margin-bottom:8px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${a.type === 'SahayaNidhi' ? '#818cf8' : a.type === 'Loan Repayment' ? '#38bdf8' : '#10b981'};"></span>
          <span style="font-size:14px; font-weight:600; color:#e2e8f0;">${a.label || a.type}</span>
        </div>
        <span style="font-size:15px; font-weight:700; color:#10b981; font-family:'JetBrains Mono', monospace;">+${formatCurrency(a.amount)}</span>
      </div>
    `).join('');

    container.innerHTML = `
      <div style="background: linear-gradient(135deg, #064e3b 0%, #0b1324 70%); padding: 36px 36px 28px 36px; border-bottom: 1px solid rgba(16,185,129,0.2);">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:14px;">
            <div style="width:52px; height:52px; border-radius:16px; background:linear-gradient(135deg, #10b981, #059669); display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:800; color:#ffffff; box-shadow:0 10px 25px rgba(16,185,129,0.4);">
              AN
            </div>
            <div>
              <div style="display:flex; align-items:center; gap:8px;">
                <h2 style="margin:0; font-size:22px; font-weight:800; letter-spacing:-0.5px; color:#ffffff;">Avadhi Nidhi</h2>
                <span style="background:rgba(16,185,129,0.2); color:#34d399; font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; border:1px solid rgba(16,185,129,0.4);">V3 OFFICIAL RECEIPT</span>
              </div>
              <p style="margin:4px 0 0 0; font-size:12px; color:#94a3b8;">Community Fund & SahayaNidhi Welfare System</p>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px; color:#64748b; font-family:'JetBrains Mono', monospace;">RECEIPT ID</div>
            <div style="font-size:13px; font-weight:700; color:#cbd5e1; font-family:'JetBrains Mono', monospace;">${receiptId}</div>
          </div>
        </div>
      </div>

      <div style="padding: 32px 36px;">
        <!-- Member & Amount Highlight Box -->
        <div style="background: rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:20px; padding:24px; text-align:center; margin-bottom:24px;">
          <div style="font-size:13px; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; font-weight:600;">Payment Received From</div>
          <div style="font-size:24px; font-weight:800; color:#ffffff; margin:6px 0 16px 0;">${memberName}</div>

          <div style="display:inline-block; padding:10px 28px; background:rgba(16,185,129,0.12); border:1.5px solid #10b981; border-radius:999px;">
            <span style="font-size:14px; font-weight:600; color:#a7f3d0; margin-right:4px;">AED</span>
            <span style="font-size:36px; font-weight:900; color:#ffffff; font-family:'JetBrains Mono', monospace; letter-spacing:-1px;">${amount}</span>
          </div>
          <div style="font-size:12px; color:#64748b; margin-top:8px;">Transaction Date: <strong style="color:#cbd5e1;">${formatDate(dateStr)}</strong></div>
        </div>

        <!-- Smart Allocation Breakdown -->
        <div style="margin-bottom:24px;">
          <div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#38bdf8; margin-bottom:12px; display:flex; align-items:center; gap:6px;">
            <span>⚡</span><span>Smart Priority Waterfall Allocation</span>
          </div>
          ${allocRowsHtml}
        </div>

        <!-- Account Balance Status Snapshot -->
        ${(newSavingsBalance !== null || remainingLoan !== null) ? `
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:24px;">
            ${newSavingsBalance !== null ? `
              <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:14px; text-align:center;">
                <div style="font-size:11px; color:#94a3b8;">Updated Savings Balance</div>
                <div style="font-size:18px; font-weight:800; color:#10b981; font-family:'JetBrains Mono', monospace; margin-top:4px;">${formatCurrency(newSavingsBalance)}</div>
              </div>
            ` : ''}
            ${remainingLoan !== null ? `
              <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:14px; text-align:center;">
                <div style="font-size:11px; color:#94a3b8;">Remaining Loan Debt</div>
                <div style="font-size:18px; font-weight:800; color:#f59e0b; font-family:'JetBrains Mono', monospace; margin-top:4px;">${formatCurrency(remainingLoan)}</div>
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- Verification Watermark Footer -->
        <div style="border-top: 1px dashed rgba(255,255,255,0.12); padding-top:20px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:11px; color:#64748b;">Recorded By: <strong style="color:#cbd5e1;">${adminName}</strong></div>
            <div style="font-size:10px; color:#475569; margin-top:2px;">Generated: ${now.toLocaleString()}</div>
          </div>
          <div style="display:flex; align-items:center; gap:6px; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:8px; padding:6px 12px;">
            <span style="color:#10b981; font-size:12px;">✓</span>
            <span style="font-size:11px; font-weight:700; color:#34d399;">Verified via Google Sheets</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    try {
      if (typeof html2canvas === 'undefined') {
        throw new Error('html2canvas library is not loaded');
      }

      // Render at 3x scale for crystal clear Retina rendering
      const canvas = await html2canvas(container, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#0b1324',
        logging: false
      });

      document.body.removeChild(container);

      // Exact Filename Format: {Total Amount paid}_{username}_{ddmmyy hhmmss}.png
      const cleanMember = this.sanitizeFilename(memberName);
      const filename = `${amount}_${cleanMember}_${stamp}.png`;

      const dataUrl = canvas.toDataURL('image/png');

      if (autoDownload) {
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      return {
        success: true,
        filename,
        dataUrl
      };

    } catch (err) {
      if (container.parentNode) document.body.removeChild(container);
      console.error('Receipt generation error:', err);
      return { success: false, error: err.message };
    }
  }
}
