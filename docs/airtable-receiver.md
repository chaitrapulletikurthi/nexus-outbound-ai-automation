# Optional Airtable CRM receiver

The queue emits durable actions through `src/crm-sync.js`; `src/airtable-crm-receiver.js` is a **configurable private receiver**, not a substitute for consent/DNC screening.

## Required private setup

In your own Airtable base, provide:

- **Buyer table:** existing records, addressed by Airtable record ID (`rec...`) and a writable checkbox field for Do Not Contact.
- **Action log table:** single-line text field `Action Key` (the upsert key), text fields `Action Type` and `Buyer Ref`, and long-text field `Payload JSON`.
- A scoped Personal Access Token with access only to the necessary base/tables.

Put table IDs and the token in your private environment. The public repo contains **no real base IDs, contacts, or keys**.

Run `npm run crm-receiver` on a private host. It listens on loopback and requires `Authorization: Bearer CRM_ACTION_API_TOKEN` behind a TLS reverse proxy. Set `CRM_ACTION_WEBHOOK_URL` for the outbox relay to `/actions`.

## How updates work

- `suppression` first checks the existing buyer record and sets Do Not Contact, then upserts a row in the action ledger.
- `interest`, `callback`, and `call_outcome` are stored in the action ledger for operator/CRM workflows.
- A successful response includes `{ "applied": true, "actionKey": "..." }` only after Airtable confirms the write.
- Network or Airtable errors cause the original outbox action to remain pending and retry. Upsert by action key makes replay safe.

**Important:** This does **not** automatically schedule callbacks, notify sales, or create a complete CRM follow-up journey. Configure those separately, and confirm the actual field types and Airtable permissions before activating.


## Read-back verification

The receiver now verifies buyer-field changes with a subsequent Airtable `GET`, then verifies the action-ledger record after upsert. A mismatch returns an error so the relay retries with the same idempotency key. Optional buyer fields are configured privately using `AIRTABLE_CALLBACK_REQUEST_FIELD`, `AIRTABLE_INTEREST_SUMMARY_FIELD`, and `AIRTABLE_LAST_CALL_STATUS_FIELD`. Without these fields, all actions are retained in the dedicated action ledger, not projected onto the buyer record. Verify field types and permissions against the actual private Airtable base before use.
