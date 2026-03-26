const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const { getClientConfig } = require("./client-config");

const defaultLeadsPath = process.env.LEADS_FILE_PATH || "./data/leads.json";
let writeQueue = Promise.resolve();

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
  const nextRecord = await withWriteLock(() => {
    const db = readDatabase();
    const existingIndex = db.leads.findIndex((lead) => lead.id === record.id);
    const sanitizedRecord = sanitizeStoredRecord(record);
    const recordToStore = {
      ...sanitizedRecord,
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      db.leads[existingIndex] = {
        ...db.leads[existingIndex],
        ...recordToStore
      };
    } else {
      db.leads.push(recordToStore);
    }

    writeDatabase(db);
    return existingIndex >= 0 ? db.leads[existingIndex] : recordToStore;
  });

  await appendGoogleSheetsRowSafe(nextRecord, "lead_record");
  return nextRecord;
}

function findLeadById(leadId) {
  initializeStorage();
  const db = readDatabase();
  return db.leads.find((lead) => lead.id === leadId) || null;
}

function findLeadByExternalId(clientSlug, externalLeadId) {
  initializeStorage();
  const db = readDatabase();
  return (
    db.leads.find(
      (lead) =>
        lead.clientSlug === clientSlug && lead.externalLeadId === externalLeadId
    ) || null
  );
}

async function appendLeadEvent(leadId, status, details = {}, options = {}) {
  initializeStorage();
  const event = await withWriteLock(() => {
    const db = readDatabase();
    const nextEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      leadId: leadId || null,
      clientSlug: options.clientSlug || null,
      clientName: options.clientName || null,
      status,
      details,
      createdAt: new Date().toISOString()
    };

    db.events.push(nextEvent);
    writeDatabase(db);
    return nextEvent;
  });

  await appendGoogleSheetsRowSafe(event, "lead_event");
  return event;
}

async function updateLeadByWhatsAppMessageId(messageId, updates = {}) {
  if (!messageId) {
    return null;
  }

  initializeStorage();
  const nextRecord = await withWriteLock(() => {
    const db = readDatabase();
    const existingIndex = db.leads.findIndex(
      (lead) => lead.whatsappMessageId === messageId
    );

    if (existingIndex < 0) {
      return null;
    }

    const recordToStore = {
      ...db.leads[existingIndex],
      ...sanitizeStoredRecord(updates),
      updatedAt: new Date().toISOString()
    };

    db.leads[existingIndex] = recordToStore;
    writeDatabase(db);
    return recordToStore;
  });

  await appendGoogleSheetsRowSafe(nextRecord, "lead_record");
  return nextRecord;
}

function listLeadsByClient(clientSlug) {
  initializeStorage();
  const db = readDatabase();
  return db.leads.filter((lead) => lead.clientSlug === clientSlug);
}

function listEventsByClient(clientSlug) {
  initializeStorage();
  const db = readDatabase();
  return db.events.filter((event) => event.clientSlug === clientSlug);
}

function getLeadSummary(clientSlug) {
  const leads = listLeadsByClient(clientSlug);
  const summary = {
    received: 0,
    no_consent: 0,
    invalid_phone: 0,
    message_sent: 0,
    delivered: 0,
    read: 0,
    message_failed: 0
  };

  for (const lead of leads) {
    if (summary[lead.status] !== undefined) {
      summary[lead.status] += 1;
    }
  }

  return summary;
}

function readDatabase() {
  const raw = fs.readFileSync(defaultLeadsPath, "utf8");
  return JSON.parse(raw);
}

function writeDatabase(data) {
  fs.writeFileSync(defaultLeadsPath, JSON.stringify(data, null, 2), "utf8");
}

async function appendGoogleSheetsRow(record, recordType) {
  const googleSheetsConfig = resolveGoogleSheetsConfig(record);
  if (googleSheetsConfig.enabled !== true) {
    return;
  }

  const spreadsheetId = googleSheetsConfig.spreadsheetId;
  const worksheetName = googleSheetsConfig.worksheetName || "LeadLog";
  const clientEmail = googleSheetsConfig.serviceAccountEmail;
  const privateKey = (googleSheetsConfig.privateKey || "").replace(
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
      record.clientSlug || "",
      record.externalLeadId || "",
      record.phoneNumberNormalized || "",
      record.whatsappMessageId || "",
      record.failureReason || "",
      JSON.stringify(record)
    ]
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${worksheetName}!A:K`,
    valueInputOption: "RAW",
    requestBody: {
      values
    }
  });
}

async function appendGoogleSheetsRowSafe(record, recordType) {
  if (!record) {
    return;
  }

  try {
    await appendGoogleSheetsRow(record, recordType);
  } catch (error) {
    console.error("Google Sheets logging failed:", error.message);
  }
}

function resolveGoogleSheetsConfig(record) {
  const clientSlug = record?.clientSlug;
  if (!clientSlug) {
    return { enabled: false };
  }

  const clientConfig = getClientConfig(clientSlug);
  return clientConfig?.googleSheets || { enabled: false };
}

function sanitizeStoredRecord(record = {}) {
  const nextRecord = { ...record };
  delete nextRecord.googleSheets;
  return nextRecord;
}

function withWriteLock(callback) {
  const run = async () => callback();
  writeQueue = writeQueue.then(run, run);
  return writeQueue;
}

module.exports = {
  initializeStorage,
  findLeadById,
  findLeadByExternalId,
  saveLeadRecord,
  appendLeadEvent,
  updateLeadByWhatsAppMessageId,
  listLeadsByClient,
  listEventsByClient,
  getLeadSummary
};
