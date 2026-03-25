# Hosted Service Handoff Guide

## Service Model

This solution is delivered as a hosted managed service. The provider hosts and maintains the backend, webhook endpoints, logging, retries, and operational monitoring. The client receives service access, onboarding, and reporting, but does not require source code access.

## What The Client Receives

- A dedicated client slug such as `acme-clinic`
- Their Facebook webhook callback URL
- Their WhatsApp status webhook callback URL
- Setup instructions for Meta configuration
- Reporting access through Google Sheets or the admin dashboard
- An escalation path for support

## What The Provider Maintains

- Application hosting
- Environment secrets
- Client-specific webhook endpoints
- Template delivery logic
- Lead status tracking
- Retry handling
- Updates and bug fixes

## Client Webhook Format

- Facebook webhook:
  - `/webhooks/{clientSlug}/facebook`
- WhatsApp status webhook:
  - `/webhooks/{clientSlug}/whatsapp`

## Security Model

- Each client has separate Meta and WhatsApp secrets referenced by environment variable name
- Secrets are never stored in the shared client config JSON
- Admin access is protected with HTTP Basic Auth
- Clients can be isolated logically by `clientSlug`

## Recommended Support Terms

- Initial onboarding and test session included
- Reasonable support window after launch
- Change requests billed separately if they alter forms, templates, or compliance logic
