# Facebook Lead Ads to WhatsApp Group Invite

Node.js + Express starter project for this workflow:

1. Receive a Facebook Lead Ads webhook event
2. Verify the webhook request
3. Fetch lead details from Meta if needed
4. Extract first name, phone number, campaign/form metadata, and consent
5. Normalize and validate the phone number
6. Only send a WhatsApp template message if consent exists
7. Include a WhatsApp group invitation link in the message
8. Track message status and lead outcomes

This project is intentionally designed around sending a compliant invitation message, not forcibly adding users into a WhatsApp group.

## Assumptions

- The Facebook lead form either contains an explicit WhatsApp opt-in field, or the business has documented compliant consent tied to the form.
- The WhatsApp template is already approved in WhatsApp Business Manager before production use.
- The WhatsApp message template body supports 3 variables in this order:
  1. `first_name`
  2. `group_invite_link`
  3. `business_offer_name`
- The business has a valid WhatsApp group invite link and accepts the risk that the link can be forwarded by recipients.
- For MVP storage, a local JSON file is acceptable. For production, move to a managed database.
- Node.js 18+ is available.

## External Dependencies

- Node.js
- Express
- Axios
- dotenv
- libphonenumber-js
- googleapis (optional, for Google Sheets logging)
- A tunnel for local webhook testing such as ngrok or Cloudflare Tunnel

## What Must Be Configured In Meta / WhatsApp

### Meta App

- A Meta app with Webhooks enabled
- Facebook Lead Ads webhook subscription for the correct Page
- App secret and webhook verify token
- A long-lived access token with permission to fetch lead details

### Facebook Lead Ads

- The correct Facebook Page connected
- A published lead form
- A phone field in the form
- A clear consent / opt-in field for WhatsApp contact

### WhatsApp Business Platform

- A WhatsApp Business Account (WABA)
- A phone number connected to WhatsApp Cloud API
- Permanent access token or token strategy for production
- An approved template message
- A webhook endpoint for message delivery statuses

## What Must Be Approved Before Going Live

- WhatsApp template approval from Meta
- Business verification if required by Meta for the client account
- The client's consent wording and privacy policy
- Any required internal legal/compliance approval for WhatsApp outreach
- Client confirmation that sending a group invitation link is acceptable and compliant in their market

## Recommended Architecture

### MVP

- Express API with two webhook endpoints:
  - `/webhooks/facebook`
  - `/webhooks/whatsapp`
- Local JSON file for lead and event tracking
- Direct WhatsApp Cloud API call after lead validation
- Basic retry for transient WhatsApp API failures
- Optional Google Sheets append for visibility

### Production Version

- Express API behind a reverse proxy or platform ingress
- Queue-based processing after webhook receipt
- Managed database such as Postgres
- Structured logs and alerting
- Idempotency on lead events and message sends
- Secret management through the deployment platform
- Background retry worker for failed sends
- Dashboard or BI view for statuses and conversion tracking

## Project Structure

```text
.
├─ server.js
├─ package.json
├─ .env.example
├─ routes/
│  └─ webhooks.js
├─ services/
│  ├─ facebook.js
│  ├─ whatsapp.js
│  ├─ phone.js
│  └─ storage.js
├─ sample-payloads/
│  └─ facebook-lead-webhook.json
├─ docs/
│  ├─ client-checklist.md
│  └─ deployment-checklist.md
└─ data/
   └─ .gitkeep
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a local environment file:

```bash
cp .env.example .env
```

3. Fill in the Meta and WhatsApp credentials in `.env`.

4. Start the server:

```bash
npm run dev
```

5. Confirm health:

```bash
curl http://localhost:3000/health
```

6. Expose the server publicly with a tunnel.

7. Use the public URL for:
   - Facebook Lead Ads webhook verification
   - WhatsApp status webhook verification

## Meta Configuration Steps

1. Create a Meta app.
2. Add the Webhooks product.
3. Add or generate:
   - `FB_APP_SECRET`
   - `FB_ACCESS_TOKEN`
4. Subscribe the Page to the `leadgen` field.
5. Set webhook callback URL to:
   - `https://your-domain.example.com/webhooks/facebook`
6. Set verify token to the value in `FB_VERIFY_TOKEN`.
7. In WhatsApp Cloud API, configure:
   - Callback URL: `https://your-domain.example.com/webhooks/whatsapp`
   - Verify token: same token or a separate value if you extend the code
8. Create and submit a WhatsApp template with 3 body variables.

## Consent Guidance

The safest approach is an explicit lead form field such as:

`I agree to receive a WhatsApp message with the group invitation and related follow-up.`

Set that field name in `CONSENT_FIELD_KEYS` if needed.

If explicit consent is missing and `REQUIRE_EXPLICIT_CONSENT=true`, the lead is stored with `no_consent` and no WhatsApp message is sent.

## Storage Options

### Default Local JSON

- Lead records and event logs are written to `data/leads.json`
- Good for demo, testing, and small pilots
- Not ideal for multi-instance production deployments

### Optional Google Sheets

Set:

- `ENABLE_GOOGLE_SHEETS_LOGGING=true`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

The service account must have edit access to the spreadsheet.

## Local Testing

### 1. Test Health

```bash
curl http://localhost:3000/health
```

### 2. Verify Facebook Webhook

Open this in a browser:

```text
http://localhost:3000/webhooks/facebook?hub.mode=subscribe&hub.verify_token=replace-with-random-verify-token&hub.challenge=12345
```

### 3. Send Sample Facebook Lead Payload

Use the sample payload in `sample-payloads/facebook-lead-webhook.json`.

```bash
curl -X POST http://localhost:3000/webhooks/facebook \
  -H "Content-Type: application/json" \
  --data @sample-payloads/facebook-lead-webhook.json
```

### 4. Review Stored Output

Check:

- `data/leads.json`
- Server logs

### 5. Test WhatsApp Delivery Status Callback

Send a mock payload to `/webhooks/whatsapp` after a message is sent.

## Make.com Alternative

### Module Sequence

1. `Webhooks > Custom webhook`
2. `JSON > Parse JSON`
3. `HTTP > Make a request` to fetch Facebook lead details
4. `Tools > Set variable` or `Tools > Compose a string` for normalized values
5. `Router`
6. Consent-valid path:
   - `HTTP > Make a request` to WhatsApp Cloud API
   - `Google Sheets > Add a row` or `Data store > Add/Replace a record`
7. Invalid / no-consent path:
   - `Google Sheets > Add a row` or `Data store > Add/Replace a record`

### Fields To Map

- `leadgen_id`
- `form_id`
- `created_time`
- `field_data[].name`
- `field_data[].values[]`
- `first_name`
- `phone`
- `consent`
- `campaign_name`
- `group_invite_link`
- `business_offer_name`

### Filters

- Consent path:
  - consent exists
  - consent matches approved true values
  - phone is not empty
- Invalid phone path:
  - phone missing or failed normalization
- No consent path:
  - consent missing
  - or consent false

### Practical Note

Make.com can run this workflow for small deployments, but production teams usually outgrow it when they need stronger audit trails, better retries, idempotency, and cleaner handoff across multiple clients.

## What Can Break In Production

- The client changes the form field names and your consent/phone mapping no longer matches
- Meta tokens expire or lose permissions
- WhatsApp template variables no longer match the payload structure
- The WhatsApp group invite link is rotated or revoked
- Duplicate webhooks arrive and idempotency is not enforced in the storage layer
- Local JSON storage becomes unsafe in multi-instance hosting
- Google Sheets logging slows down or fails under volume
- Consent wording is legally insufficient for the target region

## Next Production Upgrades

1. Replace JSON storage with Postgres
2. Add a queue such as BullMQ or SQS
3. Add idempotency keys per `leadgen_id`
4. Add structured logs and alerting
5. Add admin reporting for send rates and failures
