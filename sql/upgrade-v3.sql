-- Apply after schema.sql on existing installations. For new installs, apply both.
ALTER TABLE outbound_jobs ADD COLUMN IF NOT EXISTS dial_attempted_at timestamptz;
ALTER TABLE outbound_jobs ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE outbound_jobs ADD COLUMN IF NOT EXISTS state_version bigint NOT NULL DEFAULT 0;
ALTER TABLE outbound_jobs ADD COLUMN IF NOT EXISTS review_reason text;
CREATE INDEX IF NOT EXISTS idx_jobs_phone_attempted ON outbound_jobs(phone_e164,dial_attempted_at) WHERE dial_attempted_at IS NOT NULL;
ALTER TABLE outbound_call_events ADD COLUMN IF NOT EXISTS received_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS outbound_reconciliation_flags (
  id bigserial PRIMARY KEY,job_id uuid NOT NULL REFERENCES outbound_jobs(id),
  kind text NOT NULL,details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_reconciliation_open ON outbound_reconciliation_flags(job_id) WHERE reviewed_at IS NULL;

ALTER TABLE outbound_call_actions ADD COLUMN IF NOT EXISTS next_sync_at timestamptz;

ALTER TABLE outbound_call_actions DROP CONSTRAINT IF EXISTS outbound_call_actions_action_type_check;
ALTER TABLE outbound_call_actions ADD CONSTRAINT outbound_call_actions_action_type_check CHECK (action_type IN ('callback','interest','suppression','call_outcome'));
