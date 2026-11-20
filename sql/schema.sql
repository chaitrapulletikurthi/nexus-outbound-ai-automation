-- Run on a privately managed PostgreSQL instance. No actual contact data in this repository.
CREATE TABLE IF NOT EXISTS outbound_jobs (
  id uuid PRIMARY KEY,
  buyer_ref text NOT NULL,
  phone_e164 text NOT NULL,
  payload jsonb NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','blocked','dialing','active','ended','unknown','failed')),
  blocked_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  call_id text UNIQUE,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_outbound_jobs_status_created ON outbound_jobs(status,created_at);
CREATE TABLE IF NOT EXISTS outbound_suppression (
 phone_e164 text PRIMARY KEY, reason text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS outbound_call_events (
 id bigserial PRIMARY KEY, job_id uuid REFERENCES outbound_jobs(id), call_id text, event_type text NOT NULL,
 event_key text UNIQUE, event_data jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS outbound_call_actions (
 id bigserial PRIMARY KEY, job_id uuid REFERENCES outbound_jobs(id), action_key text NOT NULL UNIQUE,
 action_type text NOT NULL CHECK (action_type IN ('callback','interest','suppression','call_outcome')),
 action_data jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
-- Exactly one service-wide queue owner. Unknown calls intentionally HOLD the lease.
CREATE TABLE IF NOT EXISTS outbound_queue_lock (
 lock_key text PRIMARY KEY, owner text, acquired_at timestamptz,
 heartbeat_at timestamptz
);
INSERT INTO outbound_queue_lock(lock_key) VALUES('outbound') ON CONFLICT DO NOTHING;
-- External DNC checks, consent and authorization evidence remain in a private CRM.

-- CRM sync uses a durable outbox. Callback/interest are not considered sent until acknowledged.
ALTER TABLE outbound_call_actions ADD COLUMN IF NOT EXISTS synced_at timestamptz;
ALTER TABLE outbound_call_actions ADD COLUMN IF NOT EXISTS sync_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE outbound_call_actions ADD COLUMN IF NOT EXISTS last_sync_error text;
CREATE INDEX IF NOT EXISTS idx_actions_pending_sync ON outbound_call_actions(synced_at) WHERE synced_at IS NULL;
