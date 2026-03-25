const axios = require("axios");

async function sendTemplateMessage({
  to,
  firstName,
  groupInviteLink,
  offerName,
  clientConfig,
  metadata = {}
}) {
  validateWhatsAppConfig(clientConfig);

  const url = `https://graph.facebook.com/${clientConfig.whatsapp.apiVersion}/${clientConfig.whatsapp.phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: clientConfig.whatsapp.templateName,
      language: {
        code: clientConfig.whatsapp.templateLanguageCode || "en_US"
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
            Authorization: `Bearer ${clientConfig.whatsapp.accessToken}`,
            "Content-Type": "application/json"
          },
          timeout: 15000
        }),
      Number(clientConfig.whatsapp.retryAttempts || 3),
      Number(clientConfig.whatsapp.retryDelayMs || 1500)
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

function validateWhatsAppConfig(clientConfig) {
  const checks = {
    WA_PHONE_NUMBER_ID: clientConfig?.whatsapp?.phoneNumberId,
    WA_ACCESS_TOKEN: clientConfig?.whatsapp?.accessToken,
    WA_TEMPLATE_NAME: clientConfig?.whatsapp?.templateName,
    GROUP_INVITE_LINK: clientConfig?.whatsapp?.groupInviteLink,
    BUSINESS_OFFER_NAME: clientConfig?.whatsapp?.businessOfferName
  };

  const missing = Object.entries(checks)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(
      `Missing WhatsApp configuration: ${missing.join(", ")}`
    );
  }
}

module.exports = {
  sendTemplateMessage
};
