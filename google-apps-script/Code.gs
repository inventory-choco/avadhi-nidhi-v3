/**
 * Avadhi Nidhi V3 - Google Apps Script Backend
 * 
 * Spreadsheet: https://docs.google.com/spreadsheets/d/1nM27j5h8wQNhElx0GkGSez44SFFt0WD8hemEfPV9te8/edit
 * 
 * Sheets used:
 * 1. Member_Details
 *    Headers: Sr. Num | Name | OB from Dec-2026 | Phone | Email | Type
 * 2. TransactionsDB
 *    Headers: Date | Member_Name | Type | Amount | Updated By UserName | Updated By Date
 * 3. LoansDB (optional/created automatically if missing)
 *    Headers: Loan_ID | Member_Name | Type | Amount | Request_Date | Issue_Date | Due_Date | Status | Repaid_Amount | Repaid_Date | Notes
 * 4. SahayaNidhiDB (optional/created automatically if missing)
 *    Headers: Date | Type | Member_Name | Amount | Beneficiary_Or_Cause | Updated_By | Notes
 *
 * HOW TO DEPLOY:
 * 1. Open your Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Replace all code in Code.gs with this file
 * 4. Click "Deploy" > "New deployment"
 * 5. Select type: "Web app"
 * 6. Set Description: "Avadhi Nidhi V3 API"
 * 7. Set "Execute as": "Me"
 * 8. Set "Who has access": "Anyone" (allows the GitHub Pages web app to read/write)
 * 9. Click "Deploy", authorize permissions, and copy the Web App URL.
 * 10. Paste the Web App URL in Avadhi Nidhi V3 App Settings.
 */

const SHEET_MEMBERS = "Member_Details";
const SHEET_TRANSACTIONS = "TransactionsDB";
const SHEET_LOANS = "LoansDB";
const SHEET_SAHAYA = "SahayaNidhiDB";

/**
 * Handle GET requests - Read all data from Google Sheets
 */
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureRequiredSheets(ss);

    const members = getSheetData(ss.getSheetByName(SHEET_MEMBERS));
    const transactions = getSheetData(ss.getSheetByName(SHEET_TRANSACTIONS));
    const loans = getSheetData(ss.getSheetByName(SHEET_LOANS));
    const sahaya = getSheetData(ss.getSheetByName(SHEET_SAHAYA));

    const response = {
      status: "success",
      timestamp: new Date().toISOString(),
      data: {
        members: members,
        transactions: transactions,
        loans: loans,
        sahayaNidhi: sahaya
      }
    };

    return ContentService
      .createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({
        status: "error",
        message: err.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle POST requests - Add transactions, loans, update members
 */
function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureRequiredSheets(ss);

    let payload;
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e.parameter && e.parameter.payload) {
      payload = JSON.parse(e.parameter.payload);
    } else {
      payload = e.parameter;
    }

    const action = payload.action;
    let result = { status: "success" };

    switch (action) {
      case "ADD_TRANSACTION":
        result = addTransaction(ss, payload.data);
        break;

      case "ADD_BATCH_TRANSACTIONS":
        result = addBatchTransactions(ss, payload.data);
        break;

      case "RECORD_MONTHLY_PAYMENT":
        // Records split: 100 to Monthly Payment, 5 to SahayaNidhi
        result = recordMonthlyPayment(ss, payload.data);
        break;

      case "ISSUE_LOAN":
        result = issueLoan(ss, payload.data);
        break;

      case "REPAY_LOAN":
        result = repayLoan(ss, payload.data);
        break;

      case "RECORD_SAHAYA_EXPENSE":
        result = recordSahayaExpense(ss, payload.data);
        break;

      case "UPDATE_MEMBER":
        result = updateMember(ss, payload.data);
        break;

      case "TRIGGER_MONTHLY_SAHAYA_DEDUCTION":
        result = triggerMonthlySahayaDeductions(ss, payload.data);
        break;

      default:
        throw new Error("Unknown action: " + action);
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({
        status: "error",
        message: err.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Ensure all required sheets and headers exist
 */
function ensureRequiredSheets(ss) {
  // Member_Details
  let memSheet = ss.getSheetByName(SHEET_MEMBERS);
  if (!memSheet) {
    memSheet = ss.insertSheet(SHEET_MEMBERS);
    memSheet.appendRow(["Sr. Num", "Name", "OB from Dec-2026", "Phone", "Email", "Type"]);
  }

  // TransactionsDB
  let txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  if (!txSheet) {
    txSheet = ss.insertSheet(SHEET_TRANSACTIONS);
    txSheet.appendRow(["Date", "Member_Name", "Type", "Amount", "Updated By UserName", "Updated By Date"]);
  }

  // LoansDB
  let loanSheet = ss.getSheetByName(SHEET_LOANS);
  if (!loanSheet) {
    loanSheet = ss.insertSheet(SHEET_LOANS);
    loanSheet.appendRow(["Loan_ID", "Member_Name", "Type", "Amount", "Request_Date", "Issue_Date", "Due_Date", "Status", "Repaid_Amount", "Repaid_Date", "Notes"]);
  }

  // SahayaNidhiDB
  let sahSheet = ss.getSheetByName(SHEET_SAHAYA);
  if (!sahSheet) {
    sahSheet = ss.insertSheet(SHEET_SAHAYA);
    sahSheet.appendRow(["Date", "Type", "Member_Name", "Amount", "Beneficiary_Or_Cause", "Updated_By", "Notes"]);
  }
}

/**
 * Convert a sheet's rows to an array of objects
 */
function getSheetData(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0].map(h => String(h).trim());
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // Skip completely empty rows
    if (row.every(cell => cell === "" || cell === null)) continue;

    const rowObj = {};
    headers.forEach((header, colIdx) => {
      let val = row[colIdx];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
      }
      rowObj[header] = val;
    });
    rows.push(rowObj);
  }
  return rows;
}

/**
 * Add single transaction to TransactionsDB
 */
function addTransaction(ss, data) {
  const sheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  const dateStr = data.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const updatedDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  sheet.appendRow([
    dateStr,
    data.memberName,
    data.type,
    Number(data.amount),
    data.updatedBy || "Admin",
    updatedDate
  ]);

  return { status: "success", message: "Transaction added successfully" };
}

/**
 * Add batch transactions
 */
function addBatchTransactions(ss, list) {
  const sheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  const updatedDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  const rows = list.map(item => [
    item.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"),
    item.memberName,
    item.type,
    Number(item.amount),
    item.updatedBy || "Admin",
    updatedDate
  ]);

  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  return { status: "success", count: rows.length };
}

/**
 * Record Monthly Payment with the 100/5 breakdown
 */
function recordMonthlyPayment(ss, data) {
  const totalPaid = Number(data.totalAmount || 105);
  const dateStr = data.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const updatedBy = data.updatedBy || "Admin";
  const memberName = data.memberName;

  // Split: 5 goes to SahayaNidhi, remaining goes to Monthly Payment
  const sahayaPart = 5;
  const savingsPart = totalPaid - sahayaPart;

  const txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  const rowsToAdd = [];

  if (savingsPart > 0) {
    rowsToAdd.push([dateStr, memberName, "Monthly Payment", savingsPart, updatedBy, now]);
  }
  rowsToAdd.push([dateStr, memberName, "SahayaNidhi", sahayaPart, updatedBy, now]);

  txSheet.getRange(txSheet.getLastRow() + 1, 1, rowsToAdd.length, 6).setValues(rowsToAdd);

  // Also record in SahayaNidhiDB
  const sahSheet = ss.getSheetByName(SHEET_SAHAYA);
  sahSheet.appendRow([dateStr, "Monthly Deduction", memberName, sahayaPart, "Monthly Fund Deduction", updatedBy, "Automatic split from monthly payment"]);

  return {
    status: "success",
    savingsAmount: savingsPart,
    sahayaAmount: sahayaPart
  };
}

/**
 * Trigger monthly 5 AED deduction for all members for a specified month
 */
function triggerMonthlySahayaDeductions(ss, data) {
  const monthName = data.monthName; // e.g., "Jan-2027"
  const dateStr = data.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const updatedBy = data.updatedBy || "Admin";

  const memSheet = ss.getSheetByName(SHEET_MEMBERS);
  const members = getSheetData(memSheet);

  const txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  const sahSheet = ss.getSheetByName(SHEET_SAHAYA);
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  const txRows = [];
  const sahRows = [];

  members.forEach(m => {
    const name = m["Name"];
    if (name) {
      txRows.push([dateStr, name, "SahayaNidhi", 5, updatedBy, now]);
      sahRows.push([dateStr, "Compulsory Monthly Deduction", name, 5, "Monthly Charity Contribution (" + monthName + ")", updatedBy, "Deduction for " + monthName]);
    }
  });

  if (txRows.length > 0) {
    txSheet.getRange(txSheet.getLastRow() + 1, 1, txRows.length, 6).setValues(txRows);
    sahSheet.getRange(sahSheet.getLastRow() + 1, 1, sahRows.length, 7).setValues(sahRows);
  }

  return { status: "success", membersCount: members.length };
}

/**
 * Issue Loan (Emergency or Vacation)
 */
function issueLoan(ss, data) {
  const loanId = "LN-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
  const dateStr = data.issueDate || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const updatedBy = data.updatedBy || "Admin";
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  const loanSheet = ss.getSheetByName(SHEET_LOANS);
  loanSheet.appendRow([
    loanId,
    data.memberName,
    data.type, // "Emergency Loan" or "Vacation Loan"
    Number(data.amount),
    data.requestDate || dateStr,
    dateStr,
    data.dueDate,
    "Active",
    0,
    "",
    data.notes || ""
  ]);

  // Record in TransactionsDB as "Loan issued" (amount disbursed reduces fund cash)
  const txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  txSheet.appendRow([
    dateStr,
    data.memberName,
    "Loan issued",
    Number(data.amount),
    updatedBy,
    now
  ]);

  return { status: "success", loanId: loanId };
}

/**
 * Repay Loan
 */
function repayLoan(ss, data) {
  const loanId = data.loanId;
  const repayAmount = Number(data.amount);
  const dateStr = data.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const updatedBy = data.updatedBy || "Admin";
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  const loanSheet = ss.getSheetByName(SHEET_LOANS);
  const values = loanSheet.getDataRange().getValues();
  let found = false;

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(loanId)) {
      found = true;
      const currentPrincipal = Number(values[i][3]);
      const prevRepaid = Number(values[i][8] || 0);
      const newRepaid = prevRepaid + repayAmount;
      const isFullyPaid = newRepaid >= currentPrincipal;

      loanSheet.getRange(i + 1, 9).setValue(newRepaid); // Repaid_Amount
      loanSheet.getRange(i + 1, 8).setValue(isFullyPaid ? "Repaid" : "Partially Repaid"); // Status
      if (isFullyPaid) {
        loanSheet.getRange(i + 1, 10).setValue(dateStr); // Repaid_Date
      }
      break;
    }
  }

  // Record in TransactionsDB as "Loan Repayment"
  const txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  txSheet.appendRow([
    dateStr,
    data.memberName,
    "Loan Repayment",
    repayAmount,
    updatedBy,
    now
  ]);

  return { status: "success", loanId: loanId, fullyPaid: found };
}

/**
 * Record SahayaNidhi Expense / Charity Disbursement
 */
function recordSahayaExpense(ss, data) {
  const dateStr = data.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const updatedBy = data.updatedBy || "Admin";
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  const sahSheet = ss.getSheetByName(SHEET_SAHAYA);
  sahSheet.appendRow([
    dateStr,
    "Charity Disbursement",
    "-",
    Number(data.amount),
    data.beneficiaryOrCause,
    updatedBy,
    data.notes || ""
  ]);

  return { status: "success" };
}

/**
 * Update Member Details
 */
function updateMember(ss, data) {
  const sheet = ss.getSheetByName(SHEET_MEMBERS);
  const values = sheet.getDataRange().getValues();
  const srNum = data.srNum;
  const name = data.name;

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(srNum) || String(values[i][1]) === String(name)) {
      if (data.ob !== undefined) sheet.getRange(i + 1, 3).setValue(Number(data.ob));
      if (data.phone !== undefined) sheet.getRange(i + 1, 4).setValue(data.phone);
      if (data.email !== undefined) sheet.getRange(i + 1, 5).setValue(data.email);
      if (data.type !== undefined) sheet.getRange(i + 1, 6).setValue(data.type);
      return { status: "success", message: "Member updated" };
    }
  }

  // If not found, append
  sheet.appendRow([
    data.srNum || values.length,
    data.name,
    Number(data.ob || 0),
    data.phone || "",
    data.email || "",
    data.type || "Member"
  ]);

  return { status: "success", message: "Member created" };
}
