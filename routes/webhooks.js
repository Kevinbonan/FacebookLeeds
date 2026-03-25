const express = require("express");
const {
  verifyFacebookWebhook,
  validateFacebookSignature,
  extractLeadEvents,
  fetchLeadDetails,
  parseLeadRecord,
  buildLeadTrackingRecord
} = require("../services/facebook");
const { normalizePhone } = require("../services/phone");
const { sendTemplateMessage } = require("../services/whatsapp");
const { getClientConfig, getClientConfigForVerifyToken } = require("../services/client-config");
const {
  initializeStorage,
  findLeadByExternalId,
  saveLeadRecord,
  appendLeadEvent,
  updateLeadByWhatsAppMessageId
} = require("../services/storage");

const router = express.Router();

router.get("/facebook", handleFacebookVerificationByToken);
router.get("/:clientSlug/facebook", handleFacebookVerificationBySlug);

router.post(
  "/facebook",
  express.raw({ type: "application/json" }),
  handleFacebookWebhookByToken
);

router.post(
  "/:clientSlug/facebook",
  express.raw({ type: "application/json" }),
  handleFacebookWebhookBySlug
);

router.get("/whatsapp", handleWhatsAppVerificationByToken);
router.get("/:clientSlug/whatsapp", handleWhatsAppVerificationBySlug);

router.post("/whatsapp", express.json(), handleWhatsAppWebhook);
router.post("/:clientSlug/whatsapp", express.json(), handleWhatsAppWebhook);

module.exports = router;

function handleFacebookVerificationByToken(req, res) {
  const clientConfig = getClientConfigForVerifyToken(req.query["hub.verify_token"]);

  if (!clientConfig) {
    return res.status(403).json({
      ok: false,
      error: "client_not_found_for_verify_token"
    });
  }

  return verifyChallenge(req, res, clientConfig.meta.verifyToken);
}

function handleFacebookVerificationBySlug(req, res) {
  const clientConfig = getClientOr404(req.params.clientSlug, res);
  if (!clientConfig) {
    return;
  }

  return verifyChallenge(req, res, clientConfig.meta.verifyToken);
}

async function handleFacebookWebhookByToken(req, res) {
  const token = req.query.client || req.get("x-client-slug");
  const clientConfig = token ? getClientConfig(token) : null;

  if (!clientConfig) {
    return res.status(400).json({
      ok: false,
      error: "client_slug_required",
      detail: "Pass x-client-slug header, ?client=slug, or use /webhooks/:clientSlug/facebook"
    });
  }

  return processFacebookWebhook(req, res, clientConfig);
}

async function handleFacebookWebhookBySlug(req, res) {
  const clientConfig = getClientOr404(req.params.clientSlug, res);
  if (!clientConfig) {
    return;
  }

  return processFacebookWebhook(req, res, clientConfig);
}

function handleWhatsAppVerificationByToken(req, res) {
  const clientConfig = getClientConfigForVerifyToken(req.query["hub.verify_token"]);

  if (!clientConfig) {
    return res.status(403).json({
      ok: false,
      error: "client_not_found_for_verify_token"
    });
  }

  return verifyChallenge(req, res, clientConfig.meta.verifyToken);
}

function handleWhatsAppVerificationBySlug(req, res) {
  const clientConfig = getClientOr404(req.params.clientSlug, res);
  if (!clientConfig) {
    return;
  }

  return verifyChallenge(req, res, clientConfig.meta.verifyToken);
}

async function handleWhatsAppWebhook(req, res) {
  try {
    initializeStorage();
    const payload = req.body || {};
    let processed = 0;

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};

        for (const status of value.statuses || []) {
          processed += 1;
          const normalizedStatus = mapWhatsappStatus(status.status);
          const updatedLead = await updateLeadByWhatsAppMessageId(status.id, {
            status: normalizedStatus,
            deliveryStatus: status.status,
            deliveryUpdatedAt: new Date().toISOString(),
            failureReason:
              status.status === "failed"
                ? status.errors?.[0]?.title || "WhatsApp delivery failed"
                : null
          });

          await appendLeadEvent(
            updatedLead?.id || null,
            `whatsapp_${status.status}`,
            {
              messageId: status.id,
              recipientId: status.recipient_id,
              conversation: status.conversation || null,
              pricing: status.pricing || null,
              errors: status.errors || null
            },
            {
              clientSlug: updatedLead?.clientSlug || null,
              clientName: updatedLead?.clientName || null,
              googleSheets: updatedLead?.googleSheets || {}
            }
          );
        }
      }
    }

    return res.status(200).json({
      ok: true,
      processed
    });
  } catch (error) {
    console.error("WhatsApp status webhook processing failed:", error);
    return res.status(500).json({
      ok: false,
      error: "whatsapp_webhook_processing_failed",
      detail: error.message
    });
  }
}

function verifyChallenge(req, res, verifyToken) {
  const verification = verifyFacebookWebhook(req.query, verifyToken);

  if (!verification.ok) {
    return res.status(403).json({
      ok: false,
      error: verification.error
    });
  }

  return res.status(200).send(verification.challenge);
}

async function processFacebookWebhook(req, res, clientConfig) {
  try {
    initializeStorage();

    if (!validateFacebookSignature(req, clientConfig.meta.appSecret)) {
      return res.status(403).json({
        ok: false,
        error: "invalid_signature"
      });
    }

    const payload = JSON.parse(req.body.toString("utf8"));
    const leadEvents = extractLeadEvents(payload);

    if (!leadEvents.length) {
      return res.status(200).json({
        ok: true,
        message: "no_lead_events"
      });
    }

    const results = [];

    for (const event of leadEvents) {
      const rawLead = await fetchLeadDetails(event, clientConfig);
      const parsedLead = parseLeadRecord(rawLead, event, clientConfig);
      const normalizedPhone = normalizePhone(
        parsedLead.phoneNumber,
        clientConfig.defaultCountry
      );

      let leadRecord = buildLeadTrackingRecord(parsedLead, event, {
        clientSlug: clientConfig.slug,
        clientName: clientConfig.name,
        normalizedPhone: normalizedPhone.e164,
        phoneValidation: normalizedPhone,
        status: "received"
      });
      leadRecord.id = `${clientConfig.slug}:${leadRecord.externalLeadId || Date.now()}`;
      leadRecord.googleSheets = clientConfig.googleSheets;

      const existingLead = findLeadByExternalId(
        clientConfig.slug,
        leadRecord.externalLeadId
      );

      if (
        existingLead &&
        ["message_sent", "delivered", "read"].includes(existingLead.status)
      ) {
        await appendLeadEvent(
          existingLead.id,
          "duplicate_received",
          { note: "Duplicate Facebook lead webhook skipped" },
          {
            clientSlug: existingLead.clientSlug,
            clientName: existingLead.clientName,
            googleSheets: existingLead.googleSheets || clientConfig.googleSheets
          }
        );

        results.push({
          leadId: existingLead.id,
          status: existingLead.status
        });
        continue;
      }

      leadRecord = await saveLeadRecord(leadRecord);
      await appendLeadEvent(
        leadRecord.id,
        "received",
        { note: "Lead webhook received and parsed" },
        {
          clientSlug: leadRecord.clientSlug,
          clientName: leadRecord.clientName,
          googleSheets: leadRecord.googleSheets
        }
      );

      if (!parsedLead.hasConsent) {
        leadRecord = await saveLeadRecord({
          ...leadRecord,
          status: "no_consent",
          failureReason: "Consent missing or false"
        });

        await appendLeadEvent(
          leadRecord.id,
          "no_consent",
          { note: "WhatsApp message blocked by consent policy" },
          {
            clientSlug: leadRecord.clientSlug,
            clientName: leadRecord.clientName,
            googleSheets: leadRecord.googleSheets
          }
        );

        results.push({
          leadId: leadRecord.id,
          status: leadRecord.status
        });
        continue;
      }

      if (!normalizedPhone.isValid) {
        leadRecord = await saveLeadRecord({
          ...leadRecord,
          status: "invalid_phone",
          failureReason: normalizedPhone.reason
        });

        await appendLeadEvent(
          leadRecord.id,
          "invalid_phone",
          { note: normalizedPhone.reason },
          {
            clientSlug: leadRecord.clientSlug,
            clientName: leadRecord.clientName,
            googleSheets: leadRecord.googleSheets
          }
        );

        results.push({
          leadId: leadRecord.id,
          status: leadRecord.status
        });
        continue;
      }

      const sendResult = await sendTemplateMessage({
        to: normalizedPhone.e164,
        firstName: parsedLead.firstName,
        groupInviteLink: clientConfig.whatsapp.groupInviteLink,
        offerName: clientConfig.whatsapp.businessOfferName,
        clientConfig,
        metadata: {
          leadRecordId: leadRecord.id,
          campaignName: parsedLead.campaignName,
          formName: parsedLead.formName,
          clientSlug: clientConfig.slug
        }
      });

      if (sendResult.ok) {
        leadRecord = await saveLeadRecord({
          ...leadRecord,
          status: "message_sent",
          whatsappMessageId: sendResult.messageId,
          sentAt: new Date().toISOString(),
          failureReason: null
        });

        await appendLeadEvent(
          leadRecord.id,
          "message_sent",
          { messageId: sendResult.messageId },
          {
            clientSlug: leadRecord.clientSlug,
            clientName: leadRecord.clientName,
            googleSheets: leadRecord.googleSheets
          }
        );
      } else {
        leadRecord = await saveLeadRecord({
          ...leadRecord,
          status: "message_failed",
          failureReason: sendResult.error
        });

        await appendLeadEvent(
          leadRecord.id,
          "message_failed",
          { note: sendResult.error },
          {
            clientSlug: leadRecord.clientSlug,
            clientName: leadRecord.clientName,
            googleSheets: leadRecord.googleSheets
          }
        );
      }

      results.push({
        leadId: leadRecord.id,
        status: leadRecord.status
      });
    }

    return res.status(200).json({
      ok: true,
      client: clientConfig.slug,
      processed: results.length,
      results
    });
  } catch (error) {
    console.error("Facebook webhook processing failed:", error);
    return res.status(500).json({
      ok: false,
      error: "facebook_webhook_processing_failed",
      detail: error.message
    });
  }
}

function getClientOr404(clientSlug, res) {
  const clientConfig = getClientConfig(clientSlug);

  if (!clientConfig) {
    res.status(404).json({
      ok: false,
      error: "client_not_found"
    });
    return null;
  }

  return clientConfig;
}

function mapWhatsappStatus(status) {
  switch (status) {
    case "sent":
      return "message_sent";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "failed":
      return "message_failed";
    default:
      return status || "message_sent";
  }
}
