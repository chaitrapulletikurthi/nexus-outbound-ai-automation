-- Apply schema.sql, upgrade-v3.sql, then upgrade-v4.sql, in order.
CREATE TABLE IF NOT EXISTS outbound_unmatched_events (
 id bigserial PRIMARY KEY, call_id text NOT NULL, event_key text NOT NULL UNIQUE,
 payload jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_unmatched_events_pending ON outbound_unmatched_events(call_id) WHERE consumed_at IS NULL;
CREATE TABLE IF NOT EXISTS outbound_operator_audit (
 id bigserial PRIMARY KEY, job_id uuid NOT NULL REFERENCES outbound_jobs(id), action text NOT NULL,
 evidence_ref text NOT NULL, note text NOT NULL, result jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE outbound_jobs ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_outbound_jobs_updated_status ON outbound_jobs(status,updated_at);
CREATE INDEX IF NOT EXISTS idx_outbound_events_created ON outbound_call_events(created_at);
CREATE INDEX IF NOT EXISTS idx_outbound_actions_synced ON outbound_call_actions(synced_at,created_at);

CREATE TABLE IF NOT EXISTS outbound_legal_holds (
 job_id uuid PRIMARY KEY REFERENCES outbound_jobs(id), reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), released_at timestamptz
);

-- Keep exactly one open flag per job/kind; duplicate webhook delivery is common.
DELETE FROM outbound_reconciliation_flags a USING outbound_reconciliation_flags b
 WHERE a.job_id=b.job_id AND a.kind=b.kind AND a.reviewed_at IS NULL
   AND b.reviewed_at IS NULL AND a.id>b.id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_open_flags_unique ON outbound_reconciliation_flags(job_id,kind) WHERE reviewed_at IS NULL;
