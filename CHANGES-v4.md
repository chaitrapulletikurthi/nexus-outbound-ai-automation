# v4 — Nine-area remediation

This release updates a sanitized **reference implementation**. Everything remains disabled for live dialing by default.

| Audit area | Change |
|---|---|
| 1. Unknown-call recovery | Added authenticated operator reconciliation, Vapi call ID, buyer, assistant and timestamp cross-checks, audit log, and no-retry blocked resolution |
| 2. Early Vapi events | Added a persistent unmatched-event inbox and call-ID replay |
| 3. n8n handoff | Connected the disabled queue-handoff node to a private `/prepare-and-enqueue` endpoint that verifies listings |
| 4. Consent/suppression race | Serialized local suppression writes with dispatch intent; external eligibility still checked before dialing |
| 5. Spoken property accuracy | Rebuilt briefing from reviewed listing data; rejects changed details, price, region, and description |
| 6. CRM updates | Added an optional private Airtable action receiver with idempotent upserts and suppression writes |
| 7. Tests | Added contract, CRM, webhook-order tests and optional real-PostgreSQL CI integration checks |
| 8. Monitoring/retention | Added alert check, operator flags, privacy cleanup with explicit approval and legal holds |
| 9. Validation/CI/docs | Strict queue input contract, clearer errors, secret-scan fix, PostgreSQL CI and simplified README |

## Test transparency

The offline test suite and mocked webhook replay have been executed in this workspace. The real PostgreSQL integration test is configured for CI but is **skipped locally** unless `TEST_DATABASE_URL` is provided. An npm lockfile could not be generated here because external npm registry access was unavailable; CI uses `npm install`. No actual Vapi, Telnyx, Twilio, company CRM or regulatory consent service was accessed.

## Activation checklist

Confirm real consent wording, applicable law and DNC provider; populate private listing verifier; provision PostgreSQL and run migrations in order; configure Vapi server authentication and tool requests; configure the number provider; review Airtable field types; run CI, integration and simulated calls; obtain launch authorization. Do not remove the live-calling kill switches until those checks are documented.

## Deliberately external

National/state Do Not Call verification, legally valid AI-call consent records, actual carrier and Vapi credentials, private approval data, CRM schema ownership, and operational monitoring configuration must come from the deploying organization. No reference code can substitute for those services or approvals.
