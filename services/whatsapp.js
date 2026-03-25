const axios = require("axios");

const apiVersion = process.env.WA_API_VERSION || "v22.0";

async function sendTemplateMessage({
  to,
  firstName,
  groupInviteLink,
  offerName,
  metadata = {}
}) {
  validateWhatsAppConfig();

  const url = `https://graph.facebook.com/${apiVersion}/${process.env.WA_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: process.env.WA_TEMPLATE_NAME,
      language: {
        code: process.env.WA_TEMPLATE_LANGUAGE_CODE || "en_US"
      },
      components: [
        {
          type: "body",
          parameters: [
            {
              type: "text",
              text: firstName || "there"
            },
            {
              type: "text",
              text: groupInviteLink
            },
            {
              type: "text",
              text: offerName
            }
          ]
        }
      ]
    }
  };

  try {
    const response = await withRetry(
      () =>
        axios.post(url, payload, {
          headers: {
            Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}`,
            "Content-Type": "application/json"
          },
          timeout: 15000
        }),
      Number(process.env.WHATSAPP_RETRY_ATTEMPTS || 3),
      Number(process.env.WHATSAPP_RETRY_DELAY_MS || 1500)
    );

    return {
      ok: true,
      messageId: response.data?.messages?.[0]?.id || null,
      rawResponse: response.data,
      metadata
    };
  } catch (error) {
    const responseData = error.response?.data;
    return {
      ok: false,
      error:
        responseData?.error?.message ||
        error.message ||
        "Unknown WhatsApp API error",
      rawResponse: responseData || null,
      metadata
    };
  }
}

async function withRetry(fn, attempts, delayMs) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!shouldRetry(error) || attempt === attempts) {
        break;
      }

      await wait(delayMs * attempt);
    }
  }

  throw lastError;
}

function shouldRetry(error) {
  const status = error.response?.status;

  if (!status) {
    return true;
  }

  return status >= 500 || status === 429;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function validateWhatsAppConfig() {
  const required = [
    "WA_PHONE_NUMBER_ID",
    "WA_ACCESS_TOKEN",
    "WA_TEMPLATE_NAME",
    "GROUP_INVITE_LINK",
    "BUSINESS_OFFER_NAME"
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(
      `Missing WhatsApp configuration: ${missing.join(", ")}`
    );
  }
}

module.exports = {
  sendTemplateMessage
};
