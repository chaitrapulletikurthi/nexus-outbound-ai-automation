# Tests and operational acceptance

## Automated, offline

Run `npm test`. It checks the extracted n8n matching script, ranking, prepared briefing, phone normalization, consent/DNC fail-closed controls, listing approval contracts, state transition rules, mocked Vapi create/get, and repository safety. CI runs the same checks.

## Integration tests still required in your own environment

- Use an isolated PostgreSQL instance and apply `sql/schema.sql`, then `sql/upgrade-v3.sql`, then `sql/upgrade-v4.sql`.
- Verify two queue workers never dispatch in parallel using the advisory lock; crash during `dialing` must leave the job in `unknown` until reconciliation.
- Deliver a signed/authenticated Vapi tool call twice; expect one CRM action.
- Deliver delayed status updates after `ended`; ensure the job remains ended.
- Reject revoked/expired AI consent, incomplete DNC evidence, invalid local calling window, and unavailable eligibility service.
- Confirm a verbal opt-out is immediately written to local suppression and eventually acknowledged by the private CRM.
- Induce CRM HTTP failures and verify queued outbox retries without duplicate application.
- Simulate an unresponsive Vapi POST and verify no automatic retry to avoid double dialing.
- Validate call-recording disclosure with counsel and real provider configuration; do not record or retain audio without approval.

These integration tests cannot be run from the sanitized public project without Vapi access, a private database, a private eligibility service, and a test CRM.

## Test environments

- `npm test`: offline fixture tests, JSON safety checks, data contract, and mock provider responses.
- `npm run test:integration`: early-webhook replay offline, plus real PostgreSQL lock/schema/idempotency checks when `TEST_DATABASE_URL` exists.
- GitHub Actions provisions a disposable PostgreSQL service for the integration run. This CI configuration has not yet been executed on the user's GitHub account.
- Before dialing: use an authorized test number and confirm Vapi, carrier, webhooks, CRM writes, DNC service, opt-out synchronization, and operator recovery.

## v5 evidence

- `npm test`: unit tests, HTTP authentication, retention transactions, CRM read-back checks and the safety scan.
- `npm run test:integration`: executes the **actual Code node source** in `workflow/outbound-preparation-reference.json`, compares it with standalone scripts, and validates the queue → Vapi payload contract. Also tests early callbacks, operator recovery and optional PostgreSQL lock/idempotency checks.
- Tests against the real Vapi organization, carrier number, Airtable base, legal screening endpoint and production deployment are **not** part of the public ZIP. Treat them as deployment blockers, not as passing tests.
- Package lockfile generation was unavailable offline; obtain it from the npm registry and run `npm ci` in the private deployment pipeline.
