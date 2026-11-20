# Engineering review fixes — v3

This is a sanitized reference implementation. It does not contain a live company connection or phone number.

| Review area | Change in this version |
|---|---|
| Data contracts | `src/queue-payload.js` ties prepared matches to separately reviewed listing facts. A fresh listing review is required at dispatch. |
| Eligibility | Consent evidence, scope, reviewer, DNC provider/evidence, local window and suppression must be confirmed by a private service. Missing information blocks dispatch. |
| Recovery and concurrency | Vapi timeouts create an uncertain state; the queue holds rather than redialing. Session-scoped PostgreSQL advisory locking maintains one active call. Terminal states cannot be reopened. |
| CRM follow-up | Durable outbox covers callbacks, interest, opt-outs and call outcomes; a matching post-commit acknowledgment is required, with retry backoff. |
| Tests | Added approval-contract, uncertain Vapi, state-transition, webhook/tool, transcript opt-out and CRM-retry tests. Live provider/database integration remains a deployment acceptance requirement. |
| Security | Entire exported tree scanner, disabled outbound n8n HTTP nodes, secret placeholders, scoped tokens, review hold and GitHub Actions CI. |
| Docs | Short README Mermaid flowchart, clearer Vapi settings, integration boundaries, test plan and privacy guide. |

## Before any live deployment

Private requirements: configured Vapi assistant, authorized outbound Telnyx/Twilio caller ID, PostgreSQL, current consent/DNC verification, listing review service, CRM action writer, counsel-approved rules and a full test run on isolated infrastructure.

Run SQL in order: `sql/schema.sql` then `sql/upgrade-v3.sql`. The operator must resolve uncertain calls through verified provider records; the review endpoint does not override call states. No real calls are made by the included n8n example.
