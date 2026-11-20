# Verification and launch checklist

## Local checks

```bash
npm test
npm run test:integration
```

These run the exported n8n Code nodes against fictional data, verify the private queue payload, test state/CRM controls, and scan the sanitized repository. The PostgreSQL test runs only when `TEST_DATABASE_URL` is configured. No telephone calls are placed.

## Operator acceptance

- [ ] Map CRM fields; check buyer and listing ID relationships.
- [ ] Review listing status, region, marketing descriptions, pricing and fresh verification timestamps.
- [ ] Implement private AI-voice consent evidence capture and authorization verification.
- [ ] Implement real National/state/internal DNC screening and reciprocal opt-out synchronization.
- [ ] Review country/state/time-zone calling permissions and contact-frequency rules with counsel.
- [ ] Confirm recording disclosures, retention and access policy.
- [ ] Import a verified outbound-capable Telnyx/Twilio number and configure correct caller ID.
- [ ] Connect saved Vapi assistant, variables and authenticated callback/interest/opt-out tools.
- [ ] Generate and commit a registry-backed `package-lock.json`, then use `npm ci`; provision a patched PostgreSQL server and verify database migration, advisory locks and webhook authentication.
- [ ] Test authorized internal calls, no answer, timeout, duplicate event and webhook outage.
- [ ] Verify that one long-running call blocks the next; unknown status also holds queue.
- [ ] Confirm CRM actions, especially opt-out, persist even after webhook retries.
- [ ] Establish human review for failed/unknown calls and monitor usage costs.
- [ ] Obtain operator and legal sign-off before enabling the two explicit live switches.

## Scenario matrix

| Scenario | Expected behavior |
|---|---|
| Missing consent evidence | Do not queue for calling / block |
| DNC unclear | Block |
| Wrong buyer local time | Block |
| Invalid listing facts | Reject until verified |
| Duplicate intended outreach | Reuse idempotency key; no second job |
| Call still active | Hold next job |
| Call status unknown | Freeze queue for review |
| Opt-out tool fires twice | One durable suppression record |
| CRM sync fails | Keep pending action for retry |
