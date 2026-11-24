# Avadhi Nidhi V3 💰

A flagship, transparent community fund and welfare platform for **Avadhi Nidhi**, hosted on GitHub Pages with real-time Google Sheets backend synchronization and Google Identity Services (GIS) Sign-In.

---

## 🌟 Key Upgrades & Architecture

### 1. Permanent & Secure Backend (Zero Manual Setup for Members)
- The production Google Apps Script Web App URL is hardcoded in [`js/config.js`](js/config.js):
  `https://script.google.com/macros/s/AKfycbzlT1vFxdv-xNYWh-AeFE869IY35odzGIz-kzwpk_tN51MDQgR1hIFdOahO0a7Zt_DXIw/exec`
- No member ever has to configure URLs or settings. Every read and write operates live against your Google Spreadsheet (`1nM27j5h8wQNhElx0GkGSez44SFFt0WD8hemEfPV9te8`).

### 2. Google Identity Services (GIS) & Strict RBAC
- Authenticates members using Google One-Tap / Google Sign-In button (`accounts.google.com/gsi/client`).
- Matches the verified Gmail address case-insensitively against the `Email` column in the `Member_Details` sheet:
  - **Unregistered Email:** Access blocked with a friendly "Access Restricted" screen and Sign Out option.
  - **Member (`Type === "Member"`):** Complete read-only transparency across Dashboard, Monthly Payments, SahayaNidhi, Loans, TransactionsDB, and Reports. All admin editing tools and the **Admin** tab are strictly hidden.
  - **Admin (`Type === "Admin"`):** Full access including the **Admin Control Center**. Automatically logs the Admin's name in `Updated By UserName` and timestamp in `Updated By Date`.

#### Google OAuth 2.0 Client ID:
- Already configured with your Google OAuth Web Client ID:
  `188969693421-8ebob1ei8ks5j4dnq2j92la9mo1kqgfi.apps.googleusercontent.com`
- In [Google Cloud Console](https://console.cloud.google.com/) $\rightarrow$ **APIs & Services** $\rightarrow$ **Credentials**, ensure under **Authorized JavaScript origins**:
  - `https://inventory-choco.github.io` (for GitHub Pages production)
  - `http://localhost:3000` / `http://127.0.0.1:5500` (for local development)
- When a user signs in, their Gmail address is strictly validated against `Member_Details`. Only users with registered Gmail addresses in `Member_Details` can access the portal. Unregistered users are blocked with an "Access Denied" message. There are no mock or bypass buttons.

---

### 3. Smart Priority Waterfall Payment Engine
When a member makes a payment, the smart waterfall engine automatically splits the amount:
1. **Priority 1 — SahayaNidhi (5 AED/month compulsory charity):**
   - On the 1st of every month, 5 AED is automatically accrued/deducted for all members.
   - Any unpaid SahayaNidhi deduction is cleared first when money arrives.
   - If a member pays 100 AED in a month instead of 105 AED, 5 AED goes to SahayaNidhi and 95 AED goes to monthly savings.
2. **Priority 2 — Monthly Payment (100 AED/month share + negative OB arrears):**
   - Clears negative opening balances (e.g. Kasim Tirur `-315 AED`, Hashim `-25 AED`) and monthly share dues.
3. **Priority 3 — Active Loan Repayment:**
   - Remaining funds automatically apply toward pending/upcoming loan installments.
4. **Surplus:**
   - Any remaining balance after clearing all dues credits to the member's monthly savings balance.

---

### 4. Complete Loan Lifecycle
- **Emergency Loan:**
  - Max 2,500 AED • Limit: 1 per calendar year.
  - Repayment Due Date: **Last day of the next calendar month** excluding remaining days of the issuance month (e.g. issued 21-Oct-2026 $\rightarrow$ due 30-Nov-2026).
- **Vacation Loan:**
  - Max 2,500 AED • Limit: 1 per calendar year.
  - Minimum **25 days advance notice** before desired travel date (enforced with a real-time validator).
  - **7-Month Schedule with 2-Month Grace Period:**
    - Months 1 & 2: Grace period (`0 AED` expected, early payment allowed).
    - Months 3 to 7: 5 equal monthly installments (`Principal / 5`, e.g. 500 AED/mo for 2,500 AED principal).
    - Interactive 7-month visual milestone timeline rendered on active loan cards.

---

### 5. Automatic HD PNG Payment Receipt Generator (WhatsApp-Ready)
- Every time a payment is recorded (and via the "Receipt" button on any row in `TransactionsDB`), a **3x Retina HD PNG receipt** is generated and downloaded automatically.
- **Exact Filename Format:**
  `{Total Amount paid}_{username}_{ddmmyy hhmmss}.png`
  *(Example: `500_Kasim Tirur_241126 154510.png`)*
- Visual layout formatted specifically for sharing in the Avadhi Nidhi WhatsApp group.

---

### 6. Legacy-Compatible Matrix Views & Reports
- **Monthly Payments Matrix:** Year tabs (`Payments 2026`, `Payments 2027`), sticky Member Name column, Opening Balance (`OB from Dec-2026`), current active month highlighted, row totals, and bold totals row.
- **Full WhatsApp Report Suite:** One-click **📥 Download Full WhatsApp Report (All Members)**, **📋 Copy to WhatsApp**, and **💾 Download .txt**.

---

### 7. Google Apps Script Setup (`Code.gs`)
1. Open your Google Spreadsheet:
   `https://docs.google.com/spreadsheets/d/1nM27j5h8wQNhElx0GkGSez44SFFt0WD8hemEfPV9te8/edit`
2. Go to **Extensions** $\rightarrow$ **Apps Script**.
3. Replace `Code.gs` with the updated contents of [`google-apps-script/Code.gs`](google-apps-script/Code.gs).
4. Run `setupMonthlyTrigger()` once inside Apps Script to create the automatic 1st-of-month 5 AED trigger (an idempotent check also runs automatically on every app sync).
5. Deploy as **Web app** (*Execute as: Me*, *Who has access: Anyone*).
