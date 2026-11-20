# Reliability and security

## Default behavior

- Live calls disabled unless `ENABLE_LIVE_CALLS=true` **and** `LAUNCH_APPROVED=true`, with Vapi credentials, a private eligibility endpoint, and a separate authenticated listing-review endpoint.
- `POST /jobs` and `GET /queue/status` require an internal bearer token. `POST /vapi/webhook` requires a **different** bearer token.
- Calls use one outstanding job at a time. Uncertain create/status responses hold the queue.
- API secrets, complete contact records, audio and transcripts stay out of Git.

## Failure playbook

| Failure | What happens |
|---|---|
| CRM eligibility unavailable | Block the job (do not call) |
| Consent/DNC/quiet-hours not cleared | Block and record reason |
| Vapi create call times out | Mark `unknown`, freeze dispatch, reconcile manually |
| Poll fails or unexpected status | Mark `unknown`, freeze dispatch |
| Carrier rejects call | Store status/ended reason; no automatic retry |
| CRM action endpoint unavailable | Leave action in outbox; retry separately |
| Opt-out tool request | Add local suppression immediately; sync externally |
| App restarts | Database state preserved; queued work not re-created by time alone |

**End-report hold:** If polling sees an ended call before a corresponding report, the queue waits for the report. If the report has no transcript, it stays held until a reviewer resolves the `missing_transcript` flag. Unknown dial outcomes always require human reconciliation.

## Operator checks

Track counts of `queued`, `blocked`, `active`, `unknown`, `ended`, action records without `synced_at`, Vapi webhook errors and expenses. Alert on unknown calls or failed suppression sync. Investigate with Vapi/provider logs using private dashboards.

## Deployment boundaries

Deploy the coordinator behind a restricted HTTPS reverse proxy (loopback bind by default), with TLS, database backups, restricted inbound endpoints and token rotation. Run schema migrations first. Set `ELIGIBILITY_URL` and `CRM_ACTION_WEBHOOK_URL` to trusted internal services. Review infrastructure access and company publishing permissions.

**Known reference limitations:** no direct regulator/registry integration; no web console for manual reconciliation; no recording archive implementation; no automated callback calendar; no formal stress or failover certification. Do not treat the reference as a complete operational platform.

### Resolving review holds

An authorized operator checks the Vapi call, transcript (when lawful), opt-out evidence, and the private CRM before posting an acknowledged review to `/reviews/resolve` using a **separate** `REVIEW_ADMIN_TOKEN`. The payload is `{"flagId": <integer>, "reviewNote": "reason and verification reference"}`. This clears only the specified hold; it cannot change an unknown call into a safe state or start another call automatically. Unknown calls require an authenticated, audited `/reviews/reconcile` action after confirming provider and carrier evidence; see [recovery](recovery.md).


## Recovery, monitoring and privacy

See [operator recovery](recovery.md), [privacy maintenance and alerts](privacy-operations.md), and the [Airtable receiver](airtable-receiver.md). The available admin API can reconcile unknown jobs using independent provider evidence; it never re-dials uncertain calls.

## Important last-second revocation boundary

The coordinator serializes the local suppression check and dial-intent claim and repeats the consent, local-time and suppression checks before calling Vapi. **There is no atomic transaction spanning PostgreSQL, the private consent service and a carrier call.** A revocation can still arrive during the short external POST window. Before operational use, approve a procedure for real-time revocation propagation, in-progress call termination where appropriate, and review of any such overlap. Never claim that a prompt or a database lock alone guarantees TCPA compliance.

## Readiness and incident response

- `/health` reports process liveness (HTTP 200 even if PostgreSQL is down). `/ready` probes PostgreSQL with a bounded `SELECT 1` (HTTP 200 if reachable, HTTP 503 if unavailable). Neither proves Vapi, CRM or eligibility services are healthy. The independent monitor checks both `/queue/alerts` and `/ready`; also review provider logs and integration-level alerts.
- Missing end reports and unknown calls block further dialing until reviewed. Standard non-suppression CRM actions remain in a durable, independently retried outbox.
- Confirm owner/operator coverage, alert destination, token rotation, backup restore procedure, and call recording policy before launch.
- The private reference deployment should use network access controls, TLS, bounded request size, process supervision and a read-only incident dashboard. These infrastructure controls are not supplied by the public JSON exports.
