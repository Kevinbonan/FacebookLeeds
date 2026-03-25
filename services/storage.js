const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const defaultLeadsPath = process.env.LEADS_FILE_PATH || "./data/leads.json";

function initializeStorage() {
  const directory = path.dirname(defaultLeadsPath);

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  if (!fs.existsSync(defaultLeadsPath)) {
    fs.writeFileSync(
      defaultLeadsPath,
      JSON.stringify({ leads: [], events: [] }, null, 2),
      "utf8"
    );
  }
}

async function saveLeadRecord(record) {
  initializeStorage();
  const db = readDatabase();
  const existingIndex = db.leads.findIndex((lead) => lead.id === record.id);
  const nextRecord = {
    ...record,
    updatedAt: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    db.leads[existingIndex] = {
      ...db.leads[existingIndex],
      ...nextRecord
    };
  } else {
    db.leads.push(nextRecord);
  }

  writeDatabase(db);
  await appendGoogleSheetsRow(nextRecord, "lead_record");
  return nextRecord;
}

function findLeadById(leadId) {
  initializeStorage();
  const db = readDatabase();
  return db.leads.find((lead) => lead.id === leadId) || null;
}

async function appendLeadEvent(leadId, status, details = {}) {
  initializeStorage();
  const db = readDatabase();
  const event = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    leadId: leadId || null,
    status,
    details,
    createdAt: new Date().toISOString()
  };

  db.events.push(event);
  writeDatabase(db);
  await appendGoogleSheetsRow(event, "lead_event");
  return event;
}

async function updateLeadByWhatsAppMessageId(messageId, updates = {}) {
  if (!messageId) {
    return null;
  }

  initializeStorage();
  const db = readDatabase();
  const existingIndex = db.leads.findIndex(
    (lead) => lead.whatsappMessageId === messageId
  );

  if (existingIndex < 0) {
    return null;
  }

  const nextRecord = {
    ...db.leads[existingIndex],
    ...updates,
    updatedAt: new Date().toISOString()
  };

  db.leads[existingIndex] = nextRecord;
  writeDatabase(db);
  await appendGoogleSheetsRow(nextRecord, "lead_record");
  return nextRecord;
}

function readDatabase() {
  const raw = fs.readFileSync(defaultLeadsPath, "utf8");
  return JSON.parse(raw);
}

function writeDatabase(data) {
  fs.writeFileSync(defaultLeadsPath, JSON.stringify(data, null, 2), "utf8");
}

async function appendGoogleSheetsRow(record, recordType) {
  if (`${process.env.ENABLE_GOOGLE_SHEETS_LOGGING}` !== "true") {
    return;
  }

  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const worksheetName =
    process.env.GOOGLE_SHEETS_WORKSHEET_NAME || "LeadLog";
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(
    /\\n/g,
    "\n"
  );

  if (!spreadsheetId || !clientEmail || !privateKey) {
    console.warn(
      "Google Sheets logging is enabled but credentials are incomplete."
    );
    return;
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  const sheets = google.sheets({ version: "v4", auth });
  const values = [
    [
      new Date().toISOString(),
      recordType,
      record.id || "",
      record.leadId || "",
      record.status || "",
      record.externalLeadId || "",
      record.phoneNumberNormalized || "",
      record.whatsappMessageId || "",
      record.failureReason || "",
      JSON.stringify(record)
    ]
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${worksheetName}!A:J`,
    valueInputOption: "RAW",
    requestBody: {
      values
    }
  });
}

module.exports = {
  initializeStorage,
  findLeadById,
  saveLeadRecord,
  appendLeadEvent,
  updateLeadByWhatsAppMessageId
};
