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
const {
  initializeStorage,
  findLeadById,
  saveLeadRecord,
  appendLeadEvent,
  updateLeadByWhatsAppMessageId
} = require("../services/storage");

const router = express.Router();

router.get("/facebook", (req, res) => {
  const verification = verifyFacebookWebhook(req.query);

  if (!verification.ok) {
    return res.status(403).json({
      ok: false,
      error: verification.error
    });
  }

  return res.status(200).send(verification.challenge);
});

router.post(
  "/facebook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      initializeStorage();

      if (!validateFacebookSignature(req)) {
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
        const rawLead = await fetchLeadDetails(event);
        const parsedLead = parseLeadRecord(rawLead, event);
        const normalizedPhone = normalizePhone(
          parsedLead.phoneNumber,
          process.env.DEFAULT_COUNTRY
        );

        let leadRecord = buildLeadTrackingRecord(parsedLead, event, {
          normalizedPhone: normalizedPhone.e164,
          phoneValidation: normalizedPhone,
          status: "received"
        });
        const existingLead = findLeadById(leadRecord.id);

        if (
          existingLead &&
          ["message_sent", "delivered", "read"].includes(existingLead.status)
        ) {
          await appendLeadEvent(existingLead.id, "duplicate_received", {
            note: "Duplicate Facebook lead webhook skipped"
          });

          results.push({
            leadId: existingLead.id,
            status: existingLead.status
          });
          continue;
        }

        leadRecord = await saveLeadRecord(leadRecord);
        await appendLeadEvent(leadRecord.id, "received", {
          note: "Lead webhook received and parsed"
        });

        if (!parsedLead.hasConsent) {
          leadRecord = await saveLeadRecord({
            ...leadRecord,
            status: "no_consent",
            failureReason: "Consent missing or false"
          });

          await appendLeadEvent(leadRecord.id, "no_consent", {
            note: "WhatsApp message blocked by consent policy"
          });

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

          await appendLeadEvent(leadRecord.id, "invalid_phone", {
            note: normalizedPhone.reason
          });

          results.push({
            leadId: leadRecord.id,
            status: leadRecord.status
          });
          continue;
        }

        const sendResult = await sendTemplateMessage({
          to: normalizedPhone.e164,
          firstName: parsedLead.firstName,
          groupInviteLink: process.env.GROUP_INVITE_LINK,
          offerName: process.env.BUSINESS_OFFER_NAME,
          metadata: {
            leadRecordId: leadRecord.id,
            campaignName: parsedLead.campaignName,
            formName: parsedLead.formName
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

          await appendLeadEvent(leadRecord.id, "message_sent", {
            messageId: sendResult.messageId
          });
        } else {
          leadRecord = await saveLeadRecord({
            ...leadRecord,
            status: "message_failed",
            failureReason: sendResult.error
          });

          await appendLeadEvent(leadRecord.id, "message_failed", {
            note: sendResult.error
          });
        }

        results.push({
          leadId: leadRecord.id,
          status: leadRecord.status
        });
      }

      return res.status(200).json({
        ok: true,
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
);

router.get("/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token &&
    token === process.env.FB_VERIFY_TOKEN &&
    challenge
  ) {
    return res.status(200).send(challenge);
  }

  return res.status(403).json({
    ok: false,
    error: "invalid_whatsapp_webhook_verification"
  });
});

router.post("/whatsapp", express.json(), async (req, res) => {
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

          await appendLeadEvent(updatedLead?.id || null, `whatsapp_${status.status}`, {
            messageId: status.id,
            recipientId: status.recipient_id,
            conversation: status.conversation || null,
            pricing: status.pricing || null,
            errors: status.errors || null
          });
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
});

module.exports = router;

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
