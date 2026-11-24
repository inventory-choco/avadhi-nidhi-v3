# Avadhi Nidhi V3 💰

A modern, transparent fund management and community welfare portal for **Avadhi Nidhi**, hosted on GitHub Pages with real-time Google Sheets backend database synchronization.

## 🌟 Key Features

1. **Member Accounts & Opening Balances**:
   - Manages all 14 members with their respective baseline `OB from Dec-2026`.
   - Handles negative opening balances (e.g. from Nov-2026 dues adjustment) that automatically offset as monthly contributions arrive.
   - Dual-tier access control: **Admin Access** (full edit & ledger entries) and **Member Access** (transparent view-only access).

2. **Monthly Payments (105 AED Model)**:
   - Every month, each member pays **105 AED**.
   - **Automatic Split**:
     - **100 AED** goes to the member's personal fund savings balance.
     - **5 AED** goes directly to the **SahayaNidhi Charity Fund**.
   - If a member pays a different amount (e.g., 100 AED), 5 AED is reserved for SahayaNidhi and 95 AED for savings.
   - Month-by-month status matrix tracking payment progress across months (Dec-2026, Jan-2027, etc.).

3. **SahayaNidhi (Charity Fund)**:
   - Dedicated community charity pool funded by the compulsory 5 AED monthly deduction.
   - **Compulsory Monthly Deduction Engine**: Even if a member misses a monthly payment, the 5 AED deduction is tracked and accrued.
   - Charity disbursement logging with beneficiary/cause details and audit trail.

4. **Loan Facility**:
   - **Emergency Loan**:
     - Urgent financial support issued quickly within days.
     - Max amount: **2,500 AED**.
     - **Repayment Duration**: 1 month excluding remaining days of the current month.
       - *Example*: Issued on `21 Oct 2026` → Due on or before `30 Nov 2026` (last day of the next month).
     - Limit: **1 Emergency Loan per calendar year per member**.
   - **Vacation Loan**:
     - Loan provided to members traveling on vacation.
     - Max amount: **2,500 AED**.
     - **Advance Notice**: Must request at least **25 days prior** to the date needed.
     - Limit: **1 Vacation Loan per calendar year per member**.
   - Built-in automatic due date calculation, quota validation warnings, and repayment tracking.

5. **TransactionsDB**:
   - Master ledger matching Google Sheets:
     `Date | Member_Name | Type | Amount | Updated By UserName | Updated By Date`
   - One-click CSV export and instant search/filtering.

6. **GitHub Pages Ready (Zero Build Required)**:
   - Pure client-side modern JavaScript modules, Tailwind CSS, and responsive UI.
   - No sensitive passwords or secret keys stored on GitHub; all data operations route to your authorized Google Sheet.

---

## 🚀 Setup & Google Sheet Connection Guide

The live database is maintained in your Google Spreadsheet:
`https://docs.google.com/spreadsheets/d/1nM27j5h8wQNhElx0GkGSez44SFFt0WD8hemEfPV9te8/edit?gid=0#gid=0`

### Step 1: Deploy Google Apps Script Web App
1. Open your Google Sheet in a web browser.
2. In the top menu, click **Extensions** → **Apps Script**.
3. Delete any default code in `Code.gs`.
4. Copy the entire contents of the file [`google-apps-script/Code.gs`](google-apps-script/Code.gs) in this repository and paste it into the editor.
5. In Apps Script, click **Deploy** (top right) → **New deployment**.
6. Click the gear icon ⚙️ next to "Select type" and choose **Web app**.
7. Fill in:
   - **Description**: `Avadhi Nidhi V3 API`
   - **Execute as**: `Me (your Google email)`
   - **Who has access**: `Anyone` *(Note: This allows your GitHub Pages web app to read and write without exposing private service account keys)*.
8. Click **Deploy**, review and grant Google permissions.
9. Copy the **Web App URL** (looks like: `https://script.google.com/macros/s/.../exec`).

### Step 2: Connect the Web App
1. Open the Avadhi Nidhi V3 app (locally or on GitHub Pages).
2. Click the ⚙️ (Settings) button in the top right.
3. Paste the **Web App URL** into the field.
4. Click **Test Connection** to verify live communication with your Google Sheet.
5. Click **Save Web App URL**.

---

## 🌐 Deploy to GitHub Pages

1. Commit and push the code to your repository:
   ```bash
   git add .
   git commit -m "Build Avadhi Nidhi V3 app with Google Sheet sync"
   git push origin main
   ```
2. Go to your GitHub repository on `github.com`.
3. Click **Settings** → **Pages** (under "Code and automation").
4. Under **Source**, choose:
   - Branch: `main`
   - Folder: `/ (root)`
5. Click **Save**.
6. In 1–2 minutes, your website will be live at:
   `https://inventory-choco.github.io/avadhi-nidhi-v3/`

---

## 👥 Members List Reference

| Sr. Num | Name | OB from Dec-2026 | Role | Note |
|---|---|---|---|---|
| 1 | Ashraf Kannur | 500 AED | Member | Standard opening balance |
| 2 | Usman Ollassery | 0 AED | Member | Balanced |
| 3 | Kasim Tirur | -315 AED | Member | Negative balance (dues from 2026) |
| 4 | Naseef | 500 AED | Member | Standard opening balance |
| 5 | Shuhaib Muhammed C. | 500 AED | Admin | `shuhaibonly@gmail.com` |
| 6 | Hashim | -25 AED | Member | Dues from 2026 return |
| 7 | Shahid (Muthu) | 500 AED | Member | Standard opening balance |
| 8–14 | Members 8–14 | 500 AED | Member | Configurable in `Member_Details` |
