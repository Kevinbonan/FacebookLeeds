const fs = require("fs");
const path = require("path");

const clientConfigPath = process.env.CLIENT_CONFIG_PATH || "./config/clients.json";

function getAllClients() {
  const config = readClientConfig();
  const clients = config.clients || [];

  if (clients.length) {
    return clients.map(hydrateClientConfig);
  }

  const defaultClient = buildDefaultClientConfig();
  return defaultClient ? [defaultClient] : [];
}

function getClientConfig(clientSlug) {
  const clients = getAllClients();

  if (!clientSlug && clients.length === 1) {
    return clients[0];
  }

  return clients.find((item) => item.slug === clientSlug) || null;
}

function getClientConfigForVerifyToken(token) {
  if (!token) {
    return null;
  }

  return getAllClients().find((client) => client.meta.verifyToken === token) || null;
}

function hydrateClientConfig(client) {
  return {
    ...client,
    defaultCountry: client.defaultCountry || process.env.DEFAULT_COUNTRY || "US",
    requireExplicitConsent:
      typeof client.requireExplicitConsent === "boolean"
        ? client.requireExplicitConsent
        : `${process.env.REQUIRE_EXPLICIT_CONSENT}` !== "false",
    consentFieldKeys: normalizeList(
      client.consentFieldKeys || splitCsv(process.env.CONSENT_FIELD_KEYS)
    ),
    consentTrueValues: normalizeList(
      client.consentTrueValues || splitCsv(process.env.CONSENT_TRUE_VALUES)
    ),
    phoneFieldKeys: normalizeList(
      client.phoneFieldKeys || splitCsv(process.env.PHONE_FIELD_KEYS)
    ),
    firstNameFieldKeys:
      normalizeList(
        client.firstNameFieldKeys || splitCsv(process.env.FIRST_NAME_FIELD_KEYS)
      ),
    impliedConsentFormNames:
      normalizeList(
        client.impliedConsentFormNames ||
          splitCsv(process.env.META_FORM_NAMES_WITH_IMPLIED_CONSENT)
      ),
    meta: {
      verifyToken: readEnvReference(client.meta?.verifyTokenEnv, process.env.FB_VERIFY_TOKEN),
      appSecret: readEnvReference(client.meta?.appSecretEnv, process.env.FB_APP_SECRET),
      accessToken: readEnvReference(client.meta?.accessTokenEnv, process.env.FB_ACCESS_TOKEN),
      graphApiVersion:
        client.meta?.graphApiVersion || process.env.FB_GRAPH_API_VERSION || "v22.0"
    },
    whatsapp: {
      phoneNumberId: readEnvReference(
        client.whatsapp?.phoneNumberIdEnv,
        process.env.WA_PHONE_NUMBER_ID
      ),
      accessToken: readEnvReference(
        client.whatsapp?.accessTokenEnv,
        process.env.WA_ACCESS_TOKEN
      ),
      apiVersion: client.whatsapp?.apiVersion || process.env.WA_API_VERSION || "v22.0",
      templateName: readEnvReference(
        client.whatsapp?.templateNameEnv,
        process.env.WA_TEMPLATE_NAME
      ),
      templateLanguageCode: readEnvReference(
        client.whatsapp?.templateLanguageCodeEnv,
        process.env.WA_TEMPLATE_LANGUAGE_CODE || "en_US"
      ),
      groupInviteLink: readEnvReference(
        client.whatsapp?.groupInviteLinkEnv,
        process.env.GROUP_INVITE_LINK
      ),
      businessOfferName: readEnvReference(
        client.whatsapp?.businessOfferNameEnv,
        process.env.BUSINESS_OFFER_NAME
      ),
      retryAttempts:
        client.whatsapp?.retryAttempts || Number(process.env.WHATSAPP_RETRY_ATTEMPTS || 3),
      retryDelayMs:
        client.whatsapp?.retryDelayMs || Number(process.env.WHATSAPP_RETRY_DELAY_MS || 1500)
    },
    googleSheets: {
      enabled:
        typeof client.googleSheets?.enabled === "boolean"
          ? client.googleSheets.enabled
          : `${process.env.ENABLE_GOOGLE_SHEETS_LOGGING}` === "true",
      spreadsheetId: readEnvReference(
        client.googleSheets?.spreadsheetIdEnv,
        process.env.GOOGLE_SHEETS_SPREADSHEET_ID
      ),
      worksheetName:
        client.googleSheets?.worksheetName || process.env.GOOGLE_SHEETS_WORKSHEET_NAME || "LeadLog",
      serviceAccountEmail: readEnvReference(
        client.googleSheets?.serviceAccountEmailEnv,
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
      ),
      privateKey: readEnvReference(
        client.googleSheets?.privateKeyEnv,
        process.env.GOOGLE_PRIVATE_KEY
      )
    }
  };
}

function buildDefaultClientConfig() {
  const hasDefaultSecrets =
    process.env.FB_VERIFY_TOKEN ||
    process.env.FB_ACCESS_TOKEN ||
    process.env.WA_ACCESS_TOKEN ||
    process.env.WA_PHONE_NUMBER_ID;

  if (!hasDefaultSecrets) {
    return null;
  }

  return hydrateClientConfig({
    slug: "default",
    name: process.env.SERVICE_BRAND_NAME || "Default Client",
    status: "active"
  });
}

function readClientConfig() {
  const resolvedPath = path.resolve(clientConfigPath);

  if (!fs.existsSync(resolvedPath)) {
    return { clients: [] };
  }

  return JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
}

function readEnvReference(envName, fallback) {
  if (!envName) {
    return fallback || "";
  }

  return process.env[envName] || fallback || "";
}

function splitCsv(value = "") {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeList(items = []) {
  return items.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
}

module.exports = {
  getAllClients,
  getClientConfig,
  getClientConfigForVerifyToken
};
