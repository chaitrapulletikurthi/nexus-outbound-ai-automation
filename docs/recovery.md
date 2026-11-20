# Call recovery: no accidental repeat calls

A call-create request can time out **after the carrier starts dialing**. Never automatically resubmit that request.

## How to handle a stuck call

1. Review `GET /queue/status` and `GET /queue/alerts` using the private API token.
2. Find the job in your private database. Compare Vapi dashboard, carrier logs, buyer reference, and dialing window.
3. If Vapi shows the exact call **ended**, submit `POST /reviews/reconcile` using the separate admin token:

```json
{
  "jobId": "REPLACE_WITH_PRIVATE_JOB_UUID",
  "resolution": "provider_ended",
  "providerCallId": "REPLACE_WITH_VERIFIED_VAPI_CALL_UUID",
  "evidenceRef": "PRIVATE_TICKET_REFERENCE",
  "reviewNote": "Checked Vapi and carrier logs against the matching customer and assistant."
}
```

The service checks Vapi directly; the provider call must be ended and match the job's customer number, configured assistant, and dial-attempt time window. An end-report review hold remains until a reviewer resolves it.

4. If independent provider and carrier evidence confirms **no call** was created, use `resolution: "no_call_confirmed"`, omit `providerCallId`, and record a ticket/evidence reference. The job becomes **blocked**: it is never silently re-dialed.
5. After checking opt-outs, missing artifacts, and CRM updates, resolve any remaining flag through `POST /reviews/resolve`, with `flagId` and a meaningful `reviewNote`.

Recovery requires human verification. The endpoints do not authorize a replay of the original dial request.

## Early webhook events

The webhook stores uncorrelated status/end reports in `outbound_unmatched_events` and replays them when the call ID is bound to a job. Tool calls cannot change CRM data until authenticated call-to-job correlation succeeds. Unmatched events are included in queue alerts.

## Restart behavior

PostgreSQL retains queued, active and uncertain jobs after restarts. One PostgreSQL advisory lock controls queue dispatch. `unknown` / `dialing` jobs hold the queue until reviewed. No automatic retry of an uncertain create-call request is permitted.
