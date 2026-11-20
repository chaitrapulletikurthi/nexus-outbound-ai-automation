# Privacy and monitoring operations

## Health alerts

Run `npm run monitor` independently on a schedule, with `QUEUE_PRIVATE_URL` and `INTERNAL_API_TOKEN`. The monitor checks stuck calls, failed/late CRM delivery, overdue review flags, and unmatched webhooks. Set `MONITOR_WEBHOOK_URL` only to an approved internal alert channel. No customer phone or transcript is sent in the alert payload.

A failed monitor must page an operator. Merely adding the script to GitHub does not create an active monitoring service.

## Retention

Set a legally reviewed `RETENTION_DAYS` (minimum 30 days by default in this reference). Run `npm run retention:dry-run` first. A destructive run requires **both** `ENABLE_RETENTION_PURGE=true` and `PRIVACY_REVIEW_APPROVED=true`, then `npm run retention:apply`.

Cleanup is limited to old terminal jobs with no unsynced CRM actions, unresolved flags, or legal hold. Open unmatched webhook events and suppression records are deliberately preserved for review and future call prevention. A legal hold remains active until an authorized operator removes it under company policy.

**Separate systems need separate retention rules:** this script does not erase Vapi recordings, carrier CDRs, Airtable activity, backups, or legal records. Set documented policies for each provider, and have counsel approve deletion and suppression retention.

## Access and operations

- Separate tokens for queue API, Vapi webhooks, CRM writer and manual reviews.
- TLS, network restrictions, audit logs, backups and credential rotation are required for real deployments.
- Review opt-outs independently of voice-agent tool execution.
- Rehearse database backup/restore and provider failover in a private test environment.
