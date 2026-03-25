# Meta Onboarding Checklist

Use this checklist during a live client onboarding call to collect everything needed for Facebook Lead Ads to WhatsApp invitation automation.

## Goal

By the end of the session, you should have:

- Facebook Page details
- lead form details and field names
- consent wording confirmation
- Meta app and webhook configuration
- Facebook lead retrieval access token
- WhatsApp Cloud API credentials
- approved WhatsApp template details
- webhook callback URLs configured
- a successful test lead

## Before The Call

- Prepare the client slug you will use in the system
  - example: `acme-clinic`
- Prepare the client webhook URLs
  - Facebook: `/webhooks/{clientSlug}/facebook`
  - WhatsApp: `/webhooks/{clientSlug}/whatsapp`
- Prepare a random verify token
- Open your `.env` and `config/clients.json` template
- Ask the client to have admin access ready for:
  - Facebook Page
  - Meta Business / Meta App
  - WhatsApp Business Account

## Section 1: Business Details

- Client business name:
- Offer or service name:
- WhatsApp group invitation link:
- Preferred message language:
- Main technical contact:
- Main approval contact:

## Section 2: Facebook Page And Lead Form

### Facebook Page

- Page name:
- Page ID:
- Does this Page own the lead form? `Yes / No`

### Lead Form

- Exact lead form name:
- Is this the only form to connect? `Yes / No`
- If no, list all form names:

### Lead Form Field Mapping

- First name field name:
- Phone field name:
- Consent field name:
- Any alternate phone field names:
- Any alternate first-name field names:

### Consent Review

- Exact consent text shown to the user:
- Does the user explicitly agree to receive a WhatsApp message? `Yes / No`
- What values mean consent is true?
  - examples: `yes`, `true`, `checked`, `1`
- Privacy policy URL:
- Compliance approved by client? `Yes / No`

## Section 3: Meta App Setup

- Existing Meta app available? `Yes / No`
- If yes, app name:
- If no, create a new Business app

Collect:

- App ID:
- App Secret:

Notes:

- Store the App Secret securely
- Do not leave this in shared documents or client emails

## Section 4: Facebook Lead Ads Webhook Setup

### Webhooks Product

- Webhooks product added to the app? `Yes / No`
- Page object subscribed? `Yes / No`
- `leadgen` field subscribed? `Yes / No`

### Callback Settings

- Facebook callback URL entered:
- Verify token entered:
- Webhook verification successful? `Yes / No`

### App Installed On The Page

- App installed on the correct Facebook Page? `Yes / No`

## Section 5: Facebook Access Token

Collect:

- Facebook access token:
- Token type:
  - Page token
  - User token
  - System user token
- Is it long-lived or production-safe? `Yes / No`

Confirm permissions are available for lead retrieval and webhook operation.

Minimum practical items to confirm:

- lead retrieval access
- page metadata access
- page read access

If the client uses restricted lead access:

- Leads Access Manager confirmed? `Yes / No`

## Section 6: WhatsApp Cloud API Setup

- WhatsApp product added to the Meta app? `Yes / No`
- WhatsApp Business Account available? `Yes / No`
- Sending number confirmed? `Yes / No`

Collect:

- WhatsApp Business Account name:
- WhatsApp phone number:
- WhatsApp phone number ID:
- WhatsApp access token:

## Section 7: WhatsApp Template

- Approved template exists? `Yes / No`
- Template name:
- Template language code:
- Category:

Confirm variable order:

1. first name
2. group invite link
3. business or offer name

- Variable order confirmed? `Yes / No`

## Section 8: WhatsApp Webhook Setup

- WhatsApp callback URL entered:
- Verify token entered:
- Webhook verification successful? `Yes / No`
- Message status events enabled? `Yes / No`

## Section 9: Phone Handling

- Default country for phone normalization:
  - example: `US`, `GB`, `IL`
- Are numbers usually entered in local format or international format?
- Any country-specific phone formatting issues to expect?

## Section 10: Tracking And Reporting

- Reporting method:
  - built-in storage only
  - Google Sheets
  - both

If Google Sheets:

- Spreadsheet name:
- Spreadsheet ID:
- Worksheet name:
- Service account shared successfully? `Yes / No`

## Section 11: Go-Live Review

Confirm all of the following:

- Group invite link is final
- Consent wording is approved
- Template is approved
- Correct phone number ID is in use
- Correct access tokens are in use
- Correct webhook URLs are configured
- Correct field mappings are documented

## Section 12: Live Test

Do one real test during the call.

### Test Steps

1. Submit a lead from the real Facebook lead form
2. Confirm your Facebook webhook receives the event
3. Confirm the system fetches lead details
4. Confirm consent is detected correctly
5. Confirm phone normalization succeeds
6. Confirm the WhatsApp template message is sent
7. Confirm the recipient receives the group invite link
8. Confirm WhatsApp delivery status is received back

### Test Result

- Test lead submitted? `Yes / No`
- Facebook webhook received? `Yes / No`
- Lead data fetched successfully? `Yes / No`
- Message sent successfully? `Yes / No`
- Delivery status received? `Yes / No`
- Final test status: `Pass / Fail`

## Copy Into Your Project After The Call

### Put These In `.env`

- client verify token
- client app secret
- client Facebook access token
- client WhatsApp phone number ID
- client WhatsApp access token
- client group invite link
- client business offer name
- client template name
- client template language code

### Put These In `config/clients.json`

- client slug
- client name
- default country
- `requireExplicitConsent`
- `consentFieldKeys`
- `consentTrueValues`
- `phoneFieldKeys`
- `firstNameFieldKeys`
- env var references for client secrets

## Final Provider Notes

- Do not assume you can add users directly to a WhatsApp group
- Always validate consent before sending
- Do not rely on memory for field names; copy them exactly
- Test with a real lead before marking the client live
- Keep a written record of who approved consent wording and template copy
