const crypto = require("crypto");
const axios = require("axios");

function verifyFacebookWebhook(query, verifyToken) {
  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];

  if (mode !== "subscribe") {
    return { ok: false, error: "invalid_mode" };
  }

  if (!token || token !== verifyToken) {
    return { ok: false, error: "invalid_verify_token" };
  }

  if (!challenge) {
    return { ok: false, error: "missing_challenge" };
  }

  return { ok: true, challenge };
}

function validateFacebookSignature(req, appSecret) {
  const signatureHeader = req.get("x-hub-signature-256");

  if (!appSecret) {
    return true;
  }

  if (!signatureHeader) {
    return false;
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

async function fetchLeadDetails(event, clientConfig) {
  if (event.rawValue && event.rawValue.field_data) {
    return {
      ...event.rawValue,
      id: event.rawValue.leadgen_id || event.leadgenId || null
    };
  }

  if (!event.leadgenId) {
    throw new Error("Missing leadgen_id in Facebook webhook event");
  }

  if (!clientConfig?.meta?.accessToken) {
    throw new Error("FB_ACCESS_TOKEN is required to fetch lead details");
  }

  const graphApiVersion =
    clientConfig?.meta?.graphApiVersion || process.env.FB_GRAPH_API_VERSION || "v22.0";
  const url = `https://graph.facebook.com/${graphApiVersion}/${event.leadgenId}`;
  const response = await axios.get(url, {
    params: {
      access_token: clientConfig.meta.accessToken,
      fields:
        "id,created_time,ad_id,form_id,field_data,campaign_name,ad_name,platform"
    },
    timeout: 15000
  });

  return response.data;
}

function parseLeadRecord(rawLead, event, clientConfig) {
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
    clientConfig.firstNameFieldKeys,
    inferFirstName(fieldMap)
  );
  const phoneNumber = pickValue(
    fieldMap,
    clientConfig.phoneFieldKeys,
    rawLead.phone_number || ""
  );
  const consentEvaluation = evaluateConsent(fieldMap, rawLead, event, clientConfig);

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
    clientSlug: overrides.clientSlug || "default",
    clientName: overrides.clientName || "Default Client",
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

function evaluateConsent(fieldMap, rawLead, event, clientConfig) {
  const impliedConsentForms = (clientConfig.impliedConsentFormNames || []).map((item) =>
    item.toLowerCase()
  );
  const consentKeys = clientConfig.consentFieldKeys || [];
  const trueValues = new Set(
    (clientConfig.consentTrueValues || []).map((value) =>
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

  const requireExplicitConsent = clientConfig.requireExplicitConsent !== false;

  return {
    hasConsent: !requireExplicitConsent,
    source: "default_policy",
    value: requireExplicitConsent ? "missing" : "bypassed"
  };
}

function pickValue(fieldMap, keys, fallback = "") {
  for (const key of keys || []) {
    const normalizedKey = String(key).trim().toLowerCase();
    const value = fieldMap[normalizedKey];
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

module.exports = {
  verifyFacebookWebhook,
  validateFacebookSignature,
  extractLeadEvents,
  fetchLeadDetails,
  parseLeadRecord,
  buildLeadTrackingRecord
};
