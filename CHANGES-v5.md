# v5 — Consolidated engineering hardening

This version addresses the confirmed code bugs and implements the testable safeguards identified in the earlier audits. It is **not** a certificate that live calls are safe, legally authorized, or fully deployed.

## Code changes

- **Real exported n8n contract test:** executes the exact embedded scripts from the recommended workflow and verifies region IDs, ranking, phone normalization, approval handoff, queue schema, and Vapi payload. Ensures standalone JS files match exported node source.
- **Dispatch integrity:** local suppression and dial-intent claim now share a transaction and per-contact lock; the caller is screened again immediately before the Vapi POST. No attempt timestamp is recorded when the final pre-dial check blocks the call. The unavoidable gap between a remote POST and revocation is explained in operations documentation.
- **Call event consistency:** per-call advisory locks serialize status reports, end reports, and poll decisions; periodic reconciliation replays orphan events after a call ID is stored; duplicate events use provider IDs or stable content hashes.
- **Call completion:** missing end reports create a review hold before releasing the queue, and reported opt-outs are stored locally before an end-report handler finalizes a call. CRM non-suppression actions are durable but asynchronous.
- **Property accuracy:** checked description and region data; requires verified availability and fee; regenerates spoken property details from approved listings; rejects duplicates or changed content.
- **Eligibility evidence:** added reviewed jurisdiction/time-window details with evidence and expiry checks; applies both internal and policy-approved local calling windows. The private compliance service, not the sample code, must determine legally appropriate windows.
- **CRM receiver:** optional mapping for callback/interest/outcome fields, plus read-back verification of buyer fields and durable action ledger before acknowledging success.
- **Retention:** all cleanup transactions run on a dedicated PostgreSQL connection and recheck holds and eligibility under a row lock.
- **Monitoring/security:** stale dial intents and unknown calls generate alerts; private endpoints require separate credentials; explicit HTTP authentication tests.
- **Testing:** unit tests, exported-workflow contract tests, mock event and CRM recovery tests, and optional PostgreSQL lock/idempotency tests for CI.

## External boundaries (not completed by repository code)

Real Vapi and telephony credentials, legal consent/DNC screening, state-law and recording policy approvals, private Airtable field mapping, an operational PostgreSQL server, live-authorized call acceptance testing, and publication permission remain environment-specific.

The Node package lock could not be generated in the isolated environment because the npm registry was unreachable. Generate it from the pinned `pg` dependency and run `npm ci` before operational deployment.
