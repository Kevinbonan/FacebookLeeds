const crypto = require("crypto");
const axios = require("axios");

const graphApiVersion = process.env.FB_GRAPH_API_VERSION || "v22.0";

function verifyFacebookWebhook(query) {
  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];

  if (mode !== "subscribe") {
    return { ok: false, error: "invalid_mode" };
  }

  if (!token || token !== process.env.FB_VERIFY_TOKEN) {
    return { ok: false, error: "invalid_verify_token" };
  }

  if (!challenge) {
    return { ok: false, error: "missing_challenge" };
  }

  return { ok: true, challenge };
}

function validateFacebookSignature(req) {
  const appSecret = process.env.FB_APP_SECRET;
  const signatureHeader = req.get("x-hub-signature-256");

  if (!appSecret || !signatureHeader) {
    return true;
  }

  const expectedSignature = `sha256=${crypto
    .createHmac("sha256", appSecret)
    .update(req.body)
    .digest("hex")}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expectedSignature)
    );
  } catch (_error) {
    return false;
  }
}

function extractLeadEvents(payload) {
  const events = [];

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "leadgen") {
        continue;
      }

      const value = change.value || {};
      events.push({
        pageId: entry.id,
        adId: value.ad_id || null,
        adGroupId: value.adgroup_id || null,
        formId: value.form_id || null,
        leadgenId: value.leadgen_id || null,
        createdTime: value.created_time || null,
        rawValue: value
      });
    }
  }

  return events;
}

async function fetchLeadDetails(event) {
  if (event.rawValue && event.rawValue.field_data) {
    return {
      ...event.rawValue,
      id: event.rawValue.leadgen_id || event.leadgenId || null
    };
  }

  if (!event.leadgenId) {
    throw new Error("Missing leadgen_id in Facebook webhook event");
  }

  if (!process.env.FB_ACCESS_TOKEN) {
    throw new Error("FB_ACCESS_TOKEN is required to fetch lead details");
  }

  const url = `https://graph.facebook.com/${graphApiVersion}/${event.leadgenId}`;
  const response = await axios.get(url, {
    params: {
      access_token: process.env.FB_ACCESS_TOKEN,
      fields:
        "id,created_time,ad_id,form_id,field_data,campaign_name,ad_name,platform"
    },
    timeout: 15000
  });

  return response.data;
}

function parseLeadRecord(rawLead, event) {
  const fieldMap = {};

  for (const field of rawLead.field_data || []) {
    if (!field || !field.name) {
      continue;
    }

    const values = Array.isArray(field.values) ? field.values : [];
    fieldMap[field.name.toLowerCase()] = values.join(" ").trim();
  }

  const firstName = pickValue(
    fieldMap,
    process.env.FIRST_NAME_FIELD_KEYS,
    inferFirstName(fieldMap)
  );
  const phoneNumber = pickValue(
    fieldMap,
    process.env.PHONE_FIELD_KEYS,
    rawLead.phone_number || ""
  );
  const consentEvaluation = evaluateConsent(fieldMap, rawLead, event);

  return {
    externalLeadId: rawLead.id || event.leadgenId || null,
    firstName: firstName || "there",
    phoneNumber,
    hasConsent: consentEvaluation.hasConsent,
    consentSource: consentEvaluation.source,
    consentValue: consentEvaluation.value,
    fieldMap,
    rawLead,
    campaignName:
      rawLead.campaign_name || event.rawValue?.campaign_name || null,
    formId: rawLead.form_id || event.formId || null,
    formName: rawLead.form_name || event.rawValue?.form_name || null,
    pageId: event.pageId || null
  };
}

function buildLeadTrackingRecord(parsedLead, event, overrides = {}) {
  return {
    id: parsedLead.externalLeadId || `lead_${Date.now()}`,
    externalLeadId: parsedLead.externalLeadId,
    firstName: parsedLead.firstName,
    phoneNumberRaw: parsedLead.phoneNumber,
    phoneNumberNormalized: overrides.normalizedPhone || null,
    phoneValidation: overrides.phoneValidation || null,
    hasConsent: parsedLead.hasConsent,
    consentSource: parsedLead.consentSource,
    consentValue: parsedLead.consentValue,
    campaignName: parsedLead.campaignName,
    formId: parsedLead.formId,
    formName: parsedLead.formName,
    pageId: parsedLead.pageId,
    eventCreatedTime: event.createdTime,
    status: overrides.status || "received",
    failureReason: null,
    whatsappMessageId: null,
    sentAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fields: parsedLead.fieldMap
  };
}

function evaluateConsent(fieldMap, rawLead, event) {
  const impliedConsentForms = parseCsv(
    process.env.META_FORM_NAMES_WITH_IMPLIED_CONSENT
  );
  const consentKeys = parseCsv(process.env.CONSENT_FIELD_KEYS);
  const trueValues = new Set(
    parseCsv(process.env.CONSENT_TRUE_VALUES).map((value) =>
      value.toLowerCase()
    )
  );

  for (const key of consentKeys) {
    const value = fieldMap[key];
    if (!value) {
      continue;
    }

    return {
      hasConsent: trueValues.has(value.toLowerCase().trim()),
      source: key,
      value
    };
  }

  const formName = rawLead.form_name || event.rawValue?.form_name || "";
  if (formName && impliedConsentForms.includes(formName.toLowerCase())) {
    return {
      hasConsent: true,
      source: "implied_form_name",
      value: formName
    };
  }

  const requireExplicitConsent =
    `${process.env.REQUIRE_EXPLICIT_CONSENT}` !== "false";

  return {
    hasConsent: !requireExplicitConsent,
    source: "default_policy",
    value: requireExplicitConsent ? "missing" : "bypassed"
  };
}

function pickValue(fieldMap, csvKeys, fallback = "") {
  for (const key of parseCsv(csvKeys)) {
    const value = fieldMap[key];
    if (value) {
      return value;
    }
  }

  return fallback || "";
}

function inferFirstName(fieldMap) {
  const fullName = fieldMap.full_name || fieldMap.name || "";
  if (!fullName) {
    return "";
  }

  return fullName.trim().split(/\s+/)[0];
}

function parseCsv(value = "") {
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

module.exports = {
  verifyFacebookWebhook,
  validateFacebookSignature,
  extractLeadEvents,
  fetchLeadDetails,
  parseLeadRecord,
  buildLeadTrackingRecord
};
