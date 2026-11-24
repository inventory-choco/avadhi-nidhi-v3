/**
 * Avadhi Nidhi V3 - Google Apps Script Production Backend API
 * 
 * Spreadsheet: https://docs.google.com/spreadsheets/d/1nM27j5h8wQNhElx0GkGSez44SFFt0WD8hemEfPV9te8/edit
 * 
 * Main Sheets:
 * 1. Member_Details
 *    Headers: Sr. Num | Name | OB from Dec-2026 | Phone | Email | Type
 * 2. TransactionsDB
 *    Headers: Date | Member_Name | Type | Amount | Updated By UserName | Updated By Date
 * 3. LoansDB
 *    Headers: Loan_ID | Member_Name | Loan_Type | Request_Date | Issue_Date | Principal | Repaid_Amount | Status | Schedule_JSON
 * 4. ConfigDB
 *    Headers: Key | Value | Description | Updated_At
 * 5. SahayaNidhiDB
 *    Headers: Date | Type | Member_Name | Amount | Beneficiary_Or_Cause | Updated_By | Notes
 */

const SHEET_MEMBERS = "Member_Details";
const SHEET_TRANSACTIONS = "TransactionsDB";
const SHEET_LOANS = "LoansDB";
const SHEET_CONFIG = "ConfigDB";
const SHEET_SAHAYA = "SahayaNidhiDB";

// Default Configuration
const DEFAULT_CONFIG = {
  Max_Loan_Amount: "2500",
  Monthly_Share: "100",
  SahayaNidhi_Monthly: "5",
  Fund_Start_Month: "2026-12"
};

/**
 * Handle GET requests - Read all data & run idempotent checks
 */
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureRequiredSheets(ss);

    // Run idempotent monthly SahayaNidhi deduction check (deducts 5 AED per member on 1st of each month if not yet recorded)
    ensureMonthlySahayaNidhiDeductions(ss);

    const members = getSheetData(ss.getSheetByName(SHEET_MEMBERS));
    const transactions = getSheetData(ss.getSheetByName(SHEET_TRANSACTIONS));
    const loans = getSheetData(ss.getSheetByName(SHEET_LOANS));
    const config = getConfigData(ss.getSheetByName(SHEET_CONFIG));
    const sahaya = getSheetData(ss.getSheetByName(SHEET_SAHAYA));

    const response = {
      status: "success",
      timestamp: new Date().toISOString(),
      data: {
        members: members,
        transactions: transactions,
        loans: loans,
        config: config,
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
 * Handle POST requests - Smart payments, loans, updates, and configuration
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
      case "RECORD_SMART_PAYMENT":
        result = recordSmartPayment(ss, payload.data);
        break;

      case "ADD_TRANSACTION":
        result = addTransaction(ss, payload.data);
        break;

      case "EDIT_TRANSACTION":
        result = editTransaction(ss, payload.data);
        break;

      case "VOID_TRANSACTION":
        result = voidTransaction(ss, payload.data);
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

      case "UPDATE_CONFIG":
        result = updateConfig(ss, payload.data);
        break;

      case "RUN_MONTHLY_SAHAYA":
        result = runMonthlySahayaDeductions(ss, payload.data);
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
  // 1. Member_Details
  let memSheet = ss.getSheetByName(SHEET_MEMBERS);
  if (!memSheet) {
    memSheet = ss.insertSheet(SHEET_MEMBERS);
    memSheet.appendRow(["Sr. Num", "Name", "OB from Dec-2026", "Phone", "Email", "Type"]);
  }

  // 2. TransactionsDB
  let txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  if (!txSheet) {
    txSheet = ss.insertSheet(SHEET_TRANSACTIONS);
    txSheet.appendRow(["Date", "Member_Name", "Type", "Amount", "Updated By UserName", "Updated By Date"]);
  }

  // 3. LoansDB
  let loanSheet = ss.getSheetByName(SHEET_LOANS);
  if (!loanSheet) {
    loanSheet = ss.insertSheet(SHEET_LOANS);
    loanSheet.appendRow(["Loan_ID", "Member_Name", "Loan_Type", "Request_Date", "Issue_Date", "Principal", "Repaid_Amount", "Status", "Schedule_JSON"]);
  }

  // 4. ConfigDB
  let configSheet = ss.getSheetByName(SHEET_CONFIG);
  if (!configSheet) {
    configSheet = ss.insertSheet(SHEET_CONFIG);
    configSheet.appendRow(["Key", "Value", "Description", "Updated_At"]);
    const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    Object.keys(DEFAULT_CONFIG).forEach(k => {
      configSheet.appendRow([k, DEFAULT_CONFIG[k], "Fund Parameter", now]);
    });
  }

  // 5. SahayaNidhiDB
  let sahSheet = ss.getSheetByName(SHEET_SAHAYA);
  if (!sahSheet) {
    sahSheet = ss.insertSheet(SHEET_SAHAYA);
    sahSheet.appendRow(["Date", "Type", "Member_Name", "Amount", "Beneficiary_Or_Cause", "Updated_By", "Notes"]);
  }
}

/**
 * Get Key-Value Config from ConfigDB
 */
function getConfigData(sheet) {
  if (!sheet) return { ...DEFAULT_CONFIG };
  const rows = getSheetData(sheet);
  const cfg = { ...DEFAULT_CONFIG };
  rows.forEach(r => {
    const k = r["Key"] || r["key"];
    const v = r["Value"] !== undefined ? String(r["Value"]) : (r["value"] !== undefined ? String(r["value"]) : null);
    if (k && v !== null) {
      cfg[k] = v;
    }
  });
  return cfg;
}

/**
 * Read structured rows from sheet
 */
function getSheetData(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0].map(h => String(h).trim());
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row.every(cell => cell === "" || cell === null)) continue;

    const rowObj = { _rowIndex: i + 1 };
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
 * Idempotent Check: Automatically deduct 5 AED SahayaNidhi per member on 1st of each month
 */
function ensureMonthlySahayaNidhiDeductions(ss) {
  const txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  const memSheet = ss.getSheetByName(SHEET_MEMBERS);
  const sahSheet = ss.getSheetByName(SHEET_SAHAYA);
  if (!txSheet || !memSheet) return;

  const members = getSheetData(memSheet);
  if (members.length === 0) return;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-based

  // Fund starts December 2026 (2026-12)
  const startYear = 2026;
  const startMonth = 11; // December is 11

  const existingTx = getSheetData(txSheet);
  const tz = Session.getScriptTimeZone();
  const nowStr = Utilities.formatDate(now, tz, "yyyy-MM-dd HH:mm:ss");

  const newTxRows = [];
  const newSahRows = [];

  // Iterate from fund start month up to current month
  let y = startYear;
  let m = startMonth;

  while (y < currentYear || (y === currentYear && m <= currentMonth)) {
    const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`;
    const deductionDate = `${monthKey}-01`;

    // Only apply if the 1st of this month has already arrived
    const firstOfTarget = new Date(y, m, 1);
    if (now >= firstOfTarget) {
      members.forEach(mem => {
        const name = mem["Name"] || mem["name"];
        if (!name) return;

        // Check if deduction already exists for this member in this month
        const alreadyDeducted = existingTx.some(t => {
          const tDate = String(t["Date"] || t["date"] || "");
          const tName = String(t["Member_Name"] || t["member_name"] || "");
          const tType = String(t["Type"] || t["type"] || "");
          return tName === name && tType === "SahayaNidhi" && tDate.startsWith(monthKey);
        });

        if (!alreadyDeducted) {
          newTxRows.push([
            deductionDate,
            name,
            "SahayaNidhi",
            5,
            "SYSTEM_AUTO",
            nowStr
          ]);

          newSahRows.push([
            deductionDate,
            "Compulsory Monthly Deduction",
            name,
            5,
            `Monthly Charity Deduction (${monthKey})`,
            "SYSTEM_AUTO",
            "Auto 1st-of-month deduction"
          ]);
        }
      });
    }

    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }

  if (newTxRows.length > 0) {
    txSheet.getRange(txSheet.getLastRow() + 1, 1, newTxRows.length, 6).setValues(newTxRows);
  }
  if (newSahRows.length > 0 && sahSheet) {
    sahSheet.getRange(sahSheet.getLastRow() + 1, 1, newSahRows.length, 7).setValues(newSahRows);
  }
}

/**
 * Setup Time-driven trigger for monthly deductions (can be executed once)
 */
function setupMonthlyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "triggerMonthlySahayaExecution") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Runs on the 1st of every month at 1:00 AM
  ScriptApp.newTrigger("triggerMonthlySahayaExecution")
    .timeBased()
    .onMonthDay(1)
    .atHour(1)
    .create();
}

function triggerMonthlySahayaExecution() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureMonthlySahayaNidhiDeductions(ss);
}

/**
 * SMART PAYMENT RECORDER:
 * Atomically writes allocated waterfall parts (SahayaNidhi, Monthly Payment, Loan Repayment)
 * and updates LoansDB if loan repayment is included!
 */
function recordSmartPayment(ss, data) {
  const date = data.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const memberName = data.memberName;
  const updatedBy = data.updatedBy || "Admin";
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  const allocations = data.allocations || []; // [{ type: "SahayaNidhi", amount: 5 }, { type: "Monthly Payment", amount: 100 }, ...]
  const txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  const rowsToAdd = [];

  allocations.forEach(alloc => {
    const amt = Number(alloc.amount || 0);
    if (amt > 0) {
      rowsToAdd.push([
        date,
        memberName,
        alloc.type,
        amt,
        updatedBy,
        now
      ]);
    }
  });

  if (rowsToAdd.length > 0) {
    txSheet.getRange(txSheet.getLastRow() + 1, 1, rowsToAdd.length, 6).setValues(rowsToAdd);
  }

  // If a loan repayment was allocated, update LoansDB
  const loanAlloc = allocations.find(a => a.type === "Loan Repayment");
  if (loanAlloc && loanAlloc.amount > 0 && data.loanId) {
    updateLoanRepaymentInDB(ss, data.loanId, Number(loanAlloc.amount));
  } else if (loanAlloc && loanAlloc.amount > 0) {
    // If no specific loanId provided, apply to oldest active loan of the member
    applyLoanRepaymentToActive(ss, memberName, Number(loanAlloc.amount));
  }

  return {
    status: "success",
    recordedRows: rowsToAdd.length,
    allocations: allocations
  };
}

/**
 * Update LoansDB repayment record
 */
function updateLoanRepaymentInDB(ss, loanId, repayAmount) {
  const loanSheet = ss.getSheetByName(SHEET_LOANS);
  if (!loanSheet) return;

  const values = loanSheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(loanId)) {
      const principal = Number(values[i][5] || 0); // Principal is col 6 (index 5)
      const currentRepaid = Number(values[i][6] || 0); // Repaid_Amount is col 7 (index 6)
      const newRepaid = currentRepaid + repayAmount;
      const status = newRepaid >= principal ? "Repaid" : "Active";

      loanSheet.getRange(i + 1, 7).setValue(newRepaid); // Repaid_Amount
      loanSheet.getRange(i + 1, 8).setValue(status); // Status
      break;
    }
  }
}

/**
 * Apply repayment to active loan for member
 */
function applyLoanRepaymentToActive(ss, memberName, repayAmount) {
  const loanSheet = ss.getSheetByName(SHEET_LOANS);
  if (!loanSheet) return;

  const values = loanSheet.getDataRange().getValues();
  let remaining = repayAmount;

  for (let i = 1; i < values.length && remaining > 0; i++) {
    if (String(values[i][1]) === String(memberName) && String(values[i][7]) !== "Repaid") {
      const principal = Number(values[i][5] || 0);
      const currentRepaid = Number(values[i][6] || 0);
      const outstanding = principal - currentRepaid;

      const applied = Math.min(remaining, outstanding);
      const newRepaid = currentRepaid + applied;
      const status = newRepaid >= principal ? "Repaid" : "Active";

      loanSheet.getRange(i + 1, 7).setValue(newRepaid);
      loanSheet.getRange(i + 1, 8).setValue(status);
      remaining -= applied;
    }
  }
}

/**
 * Add a single transaction
 */
function addTransaction(ss, data) {
  const txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  const date = data.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  txSheet.appendRow([
    date,
    data.memberName,
    data.type,
    Number(data.amount),
    data.updatedBy || "Admin",
    now
  ]);

  return { status: "success" };
}

/**
 * Edit an existing transaction in TransactionsDB
 */
function editTransaction(ss, data) {
  const txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  const rowIndex = Number(data.rowIndex);
  if (!rowIndex || rowIndex <= 1) throw new Error("Invalid rowIndex for edit");

  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  if (data.date) txSheet.getRange(rowIndex, 1).setValue(data.date);
  if (data.memberName) txSheet.getRange(rowIndex, 2).setValue(data.memberName);
  if (data.type) txSheet.getRange(rowIndex, 3).setValue(data.type);
  if (data.amount !== undefined) txSheet.getRange(rowIndex, 4).setValue(Number(data.amount));
  txSheet.getRange(rowIndex, 5).setValue(data.updatedBy || "Admin");
  txSheet.getRange(rowIndex, 6).setValue(now);

  return { status: "success", message: "Transaction updated" };
}

/**
 * Void/Delete an existing transaction
 */
function voidTransaction(ss, data) {
  const txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  const rowIndex = Number(data.rowIndex);
  if (!rowIndex || rowIndex <= 1) throw new Error("Invalid rowIndex for delete");

  txSheet.deleteRow(rowIndex);
  return { status: "success", message: "Transaction voided" };
}

/**
 * Issue Loan (Emergency or Vacation)
 */
function issueLoan(ss, data) {
  const loanId = "LN-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
  const issueDate = data.issueDate || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const requestDate = data.requestDate || issueDate;
  const updatedBy = data.updatedBy || "Admin";
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  const loanSheet = ss.getSheetByName(SHEET_LOANS);
  loanSheet.appendRow([
    loanId,
    data.memberName,
    data.loanType, // "Emergency Loan" or "Vacation Loan"
    requestDate,
    issueDate,
    Number(data.principal),
    0, // Repaid_Amount
    "Active",
    typeof data.scheduleJson === "string" ? data.scheduleJson : JSON.stringify(data.scheduleJson || [])
  ]);

  // Record "Loan issued" in TransactionsDB
  const txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  txSheet.appendRow([
    issueDate,
    data.memberName,
    "Loan issued",
    Number(data.principal),
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
  const amount = Number(data.amount);
  const date = data.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const updatedBy = data.updatedBy || "Admin";
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  updateLoanRepaymentInDB(ss, loanId, amount);

  // Record in TransactionsDB
  const txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  txSheet.appendRow([
    date,
    data.memberName,
    "Loan Repayment",
    amount,
    updatedBy,
    now
  ]);

  return { status: "success", loanId: loanId };
}

/**
 * Record Sahaya Expense / Charity Disbursement
 */
function recordSahayaExpense(ss, data) {
  const date = data.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const updatedBy = data.updatedBy || "Admin";
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  const sahSheet = ss.getSheetByName(SHEET_SAHAYA);
  sahSheet.appendRow([
    date,
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
 * Update or Add Member in Member_Details
 */
function updateMember(ss, data) {
  const sheet = ss.getSheetByName(SHEET_MEMBERS);
  const values = sheet.getDataRange().getValues();
  const srNum = data.srNum;
  const name = data.name;

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(srNum) || String(values[i][1]) === String(name)) {
      if (data.name !== undefined) sheet.getRange(i + 1, 2).setValue(data.name);
      if (data.ob !== undefined) sheet.getRange(i + 1, 3).setValue(Number(data.ob));
      if (data.phone !== undefined) sheet.getRange(i + 1, 4).setValue(data.phone);
      if (data.email !== undefined) sheet.getRange(i + 1, 5).setValue(data.email);
      if (data.type !== undefined) sheet.getRange(i + 1, 6).setValue(data.type);
      return { status: "success", message: "Member updated" };
    }
  }

  // New member
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

/**
 * Update Configuration in ConfigDB
 */
function updateConfig(ss, data) {
  const sheet = ss.getSheetByName(SHEET_CONFIG);
  if (!sheet) return { status: "error", message: "ConfigDB missing" };

  const values = sheet.getDataRange().getValues();
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  Object.keys(data).forEach(key => {
    let found = false;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]) === String(key)) {
        sheet.getRange(i + 1, 2).setValue(String(data[key]));
        sheet.getRange(i + 1, 4).setValue(now);
        found = true;
        break;
      }
    }
    if (!found) {
      sheet.appendRow([key, String(data[key]), "Fund Parameter", now]);
    }
  });

  return { status: "success", message: "Config updated" };
}

/**
 * Run monthly Sahaya deduction manually for all members
 */
function runMonthlySahayaDeductions(ss, data) {
  ensureMonthlySahayaNidhiDeductions(ss);
  return { status: "success", message: "Monthly deductions ensured" };
}
