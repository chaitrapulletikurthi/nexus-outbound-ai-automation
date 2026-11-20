# Data mapping, quality and CRM actions

## 1. Recommended sanitized inputs

**Buyer:** `buyerId`, `buyerName`, `phone`, `preferredRegions` (linked IDs). Live dialing requires externally verified AI consent, DNC clearance, recording approval and a reviewed jurisdiction-specific time window. The example eligibility response includes evidence IDs and dates, not a substitute for legal review.

**Listing:** `dealId`, `city`, `verifiedRegionIds`, `summary`, `entryFee`, `listingStatus`, `listingApproved`, `cityRegionVerified`, `priceVerified`, `lastVerifiedAt`.

**Prepared call:** `buyerId`, `phone`, `buyerName`, `propertyBriefing`, `topDeals`, `idempotencyKey`.

The matching script uses region IDs, ranked property selection and a summary. The **queue** requires an additional listing quality review: confirm city-region mapping, status, approved copy and prices. The example rejects unreviewed or stale listing facts rather than silently passing them.

## 2. Private eligibility service contract

`POST ELIGIBILITY_URL` with `buyerRef` and phone. It must return the current consent and DNC review snapshot described in [`examples/eligibility-response.example.json`](../examples/eligibility-response.example.json). **Do not fabricate a DNC result**; connect a legally approved service and preserve screen date and proof. Revalidate again right before every call.

## 3. Persistent tables

[`sql/schema.sql`](../sql/schema.sql) provides jobs, suppression, events and actions. `idempotency_key` blocks repeated enqueue requests; `call_id` ties status updates to the right conversation; unknown calls remain in the database until reconciled.

## 4. Voice tool → CRM updates

Vapi sends tool calls to an authenticated webhook. `src/service.js` validates the buyer and listing, writes an idempotent action, then `src/crm-sync.js` sends it to a private CRM action endpoint.

| Event | CRM action |
|---|---|
| `record_interest` | Create/update property interest by buyer + listing |
| `request_callback` | Record callback request and human follow-up |
| `do_not_call` | Suppress locally right away, then sync suppression to other CRMs |
| `end-of-call-report` | Record final call outcome in job/event log and idempotent CRM action |

The destination CRM must handle `actionKey` idempotently and return a success response only after the write is durable. A tool call returning success does not by itself guarantee that the downstream CRM synchronized; check `synced_at` in the outbox.

The private CRM writer must support `call_outcome` with a durable `actionKey` acknowledgment. Missing end reports hold dispatch for review. Tool-driven callbacks are requests only, not booked appointments.

## Optional sample CRM receiver

See [Airtable receiver](airtable-receiver.md). It applies Do Not Contact and logs outcome/callback/interest actions. Actual CRM routing and calendar booking remain company-specific.

## 5. Read-back checks and optional buyer fields

`src/airtable-crm-receiver.js` verifies all mapped buyer fields by reading back the updated record, then upserts an idempotent action-ledger entry and reads it back before acknowledging the outbox relay. A failed read-back is a **retry**, not a successful delivery. Configure optional buyer fields through `AIRTABLE_CALLBACK_REQUEST_FIELD`, `AIRTABLE_INTEREST_SUMMARY_FIELD` and `AIRTABLE_LAST_CALL_STATUS_FIELD`; without these mappings, callback, interest and outcome actions live in the action ledger only. A callback request does not create an appointment.

The private compliance service must return a reviewed `legalCallingWindow`, `callingWindowEvidenceId`, `callingRulesEvidenceId`, `recordingPlanEvidenceId`, and `callingRulesReviewedAt`. The service enforces the intersection of this window and a conservative internal weekday window. Do not populate affirmative approvals in production based on the example JSON.
