# Facebook Lead Ads to WhatsApp Group Invite

Node.js + Express starter for a hosted service that receives Facebook Lead Ads, validates consent and phone numbers, sends approved WhatsApp template messages, includes a WhatsApp group invitation link, and tracks delivery statuses.

This system is intentionally designed around sending a compliant invitation message. It does not forcibly add users to a WhatsApp group.

## Hosted Service Positioning

This version is set up for service providers and agencies:

- one codebase
- multiple client accounts
- client-specific webhook URLs
- per-client secrets stored in environment variables
- protected admin dashboard
- branded handoff and sales templates

You can host this yourself and sell it as a managed service without sharing source code.

## Assumptions

- Each client has a valid Meta setup and a WhatsApp Business account.
- Each client uses an approved WhatsApp template with 3 body variables in this order:
  1. first name
  2. group invite link
  3. business or offer name
- Each client either has explicit WhatsApp consent in the lead form or documented compliant implied consent.
- Local JSON storage is acceptable for MVP and demos. Production should move to a managed database.

## External Dependencies

- Node.js 18+
- Express
- Axios
- dotenv
- libphonenumber-js
- googleapis for optional Google Sheets logging
- ngrok or Cloudflare Tunnel for local webhook testing

## Project Structure

```text
.
├─ server.js
├─ package.json
├─ .env.example
├─ config/
│  └─ clients.json
├─ routes/
│  ├─ admin.js
│  └─ webhooks.js
├─ services/
│  ├─ client-config.js
│  ├─ facebook.js
│  ├─ phone.js
│  ├─ storage.js
│  └─ whatsapp.js
├─ docs/
│  ├─ client-checklist.md
│  ├─ deployment-checklist.md
│  ├─ handoff-hosted-service.md
│  ├─ pricing-template.md
│  └─ proposal-template.md
├─ sample-payloads/
│  └─ facebook-lead-webhook.json
└─ data/
   └─ .gitkeep
```

## Multi-Client Model

Each client gets:

- a unique `slug`
- client-specific field mapping
- client-specific consent rules
- client-specific Meta secrets
- client-specific WhatsApp secrets
- optional client-specific Google Sheets logging

Client settings live in [config/clients.json](C:\Users\user\Documents\Playground\config\clients.json).
Actual secret values stay in environment variables referenced by name from that file.

## Webhook URLs

Recommended client-specific endpoints:

- Facebook Lead Ads:
  - `/webhooks/{clientSlug}/facebook`
- WhatsApp status webhook:
  - `/webhooks/{clientSlug}/whatsapp`

Legacy generic endpoints still exist, but the client-specific routes are cleaner for hosted-service operation.

## Admin Panel

- URL: `/admin`
- Auth: HTTP Basic Auth
- Credentials from:
  - `ADMIN_USERNAME`
  - `ADMIN_PASSWORD`

The admin panel gives you a lightweight operations view across configured clients. JSON endpoints are also available under `/admin/api/...`.

## Environment Setup

1. Install dependencies:

```bash
npm install
```

2. Create your `.env` file:

```bash
cp .env.example .env
```

3. Set provider-wide values in `.env`:

- `SERVICE_BRAND_NAME`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `CLIENT_CONFIG_PATH`

4. Set actual secret values in `.env`:

```env
ACME_FB_VERIFY_TOKEN=...
ACME_FB_APP_SECRET=...
ACME_FB_ACCESS_TOKEN=...
ACME_WA_PHONE_NUMBER_ID=...
ACME_WA_ACCESS_TOKEN=...
ACME_GROUP_INVITE_LINK=...
ACME_BUSINESS_OFFER_NAME=...
ACME_WA_TEMPLATE_NAME=...
ACME_WA_TEMPLATE_LANGUAGE_CODE=en_US
```

5. Reference those env keys from [config/clients.json](C:\Users\user\Documents\Playground\config\clients.json).

6. Start the app:

```bash
npm run dev
```

## Example Client Config

```json
{
  "slug": "demo-client",
  "name": "Demo Client",
  "status": "active",
  "defaultCountry": "US",
  "requireExplicitConsent": true,
  "consentFieldKeys": ["consent", "whatsapp_opt_in"],
  "consentTrueValues": ["true", "yes", "checked", "1"],
  "phoneFieldKeys": ["phone", "phone_number", "mobile_phone"],
  "firstNameFieldKeys": ["first_name", "full_name", "name"],
  "meta": {
    "verifyTokenEnv": "ACME_FB_VERIFY_TOKEN",
    "appSecretEnv": "ACME_FB_APP_SECRET",
    "accessTokenEnv": "ACME_FB_ACCESS_TOKEN",
    "graphApiVersion": "v22.0"
  },
  "whatsapp": {
    "phoneNumberIdEnv": "ACME_WA_PHONE_NUMBER_ID",
    "accessTokenEnv": "ACME_WA_ACCESS_TOKEN",
    "templateNameEnv": "ACME_WA_TEMPLATE_NAME",
    "templateLanguageCodeEnv": "ACME_WA_TEMPLATE_LANGUAGE_CODE",
    "groupInviteLinkEnv": "ACME_GROUP_INVITE_LINK",
    "businessOfferNameEnv": "ACME_BUSINESS_OFFER_NAME"
  }
}
```

## What Must Be Configured In Meta / WhatsApp

For each client:

- Meta app webhook subscription
- Facebook Page leadgen subscription
- App secret
- access token able to read lead data
- WhatsApp Business Account
- WhatsApp phone number ID
- approved template message
- WhatsApp webhook callback URL
- compliant consent wording in the lead form

## What Must Be Approved Before Go-Live

- WhatsApp template approval
- business verification if Meta requires it
- client legal/compliance approval of consent language
- final group invite link approval

## Testing Locally

### Safe no-consent test

1. Start the app:

```bash
npm run dev
```

2. Post [sample-payloads/facebook-lead-webhook.json](C:\Users\user\Documents\Playground\sample-payloads\facebook-lead-webhook.json) to the correct route:

```bash
curl -X POST http://localhost:3000/webhooks/demo-client/facebook \
  -H "Content-Type: application/json" \
  --data @sample-payloads/facebook-lead-webhook.json
```

3. Review output in `data/leads.json`.

### Full live test

- expose local app publicly
- configure Meta callback URLs for that client slug
- use real WhatsApp credentials
- use a real approved template
- send a lead with explicit consent

## Google Sheets Option

You can enable Google Sheets logging per client by adding Google Sheets env references and enabling that client’s `googleSheets.enabled` setting.

This is useful for customer visibility, but for serious production use, migrate to Postgres.

## Sales and Handoff Docs

- Hosted service handoff:
  - [docs/handoff-hosted-service.md](C:\Users\user\Documents\Playground\docs\handoff-hosted-service.md)
- Proposal template:
  - [docs/proposal-template.md](C:\Users\user\Documents\Playground\docs\proposal-template.md)
- Pricing template:
  - [docs/pricing-template.md](C:\Users\user\Documents\Playground\docs\pricing-template.md)
- Client intake:
  - [docs/client-checklist.md](C:\Users\user\Documents\Playground\docs\client-checklist.md)
- Deployment checklist:
  - [docs/deployment-checklist.md](C:\Users\user\Documents\Playground\docs\deployment-checklist.md)

## What Can Break In Production

- client changes lead form field names
- token expiry or loss of Meta permissions
- WhatsApp template variable mismatch
- group invite link rotation
- duplicate lead delivery from Meta
- JSON storage limits in multi-instance hosting
- weak client consent wording
- manual admin credentials not rotated

## Recommended Next Upgrades

1. Replace JSON storage with Postgres.
2. Add a queue and worker for sends and retries.
3. Add per-client RBAC instead of a single admin login.
4. Add billing hooks and invoice usage metrics.
5. Add a real front-end admin panel with filtering and exports.
