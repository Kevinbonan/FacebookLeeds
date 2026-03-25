# Deployment Checklist

## Before Deploy

- Fill in all required values in `.env`.
- Verify `GROUP_INVITE_LINK` is current and tested.
- Verify `WA_TEMPLATE_NAME` is approved and matches the code variable order.
- Verify `FB_VERIFY_TOKEN`, `FB_APP_SECRET`, `FB_ACCESS_TOKEN`, `WA_ACCESS_TOKEN`, and `WA_PHONE_NUMBER_ID`.
- Set the production callback URL in Meta.
- Confirm the Facebook Page is subscribed to the `leadgen` webhook.
- Confirm the WhatsApp webhook is subscribed for message statuses.

## Hosting

- Deploy Node.js 18+ runtime.
- Expose HTTPS publicly.
- Persist the `data/` directory only if using local JSON storage.
- Prefer a managed database for multi-client or multi-instance production.

## Security

- Store secrets in the hosting provider secret manager.
- Restrict who can access logs and exported lead data.
- Rotate Meta and Google credentials on a regular schedule.

## Verification

- Test `/health`.
- Verify Facebook webhook subscription challenge.
- Send a sample Facebook payload.
- Confirm the system fetches lead details from Meta.
- Confirm consent logic blocks non-consented leads.
- Confirm invalid phone numbers are rejected.
- Confirm an approved template sends successfully.
- Confirm WhatsApp delivery status webhook events are recorded.

## Go-Live

- Turn on monitoring and alerting.
- Confirm retry behavior is acceptable.
- Confirm ownership for template edits and token renewal.
- Document the handoff contact and support process.
