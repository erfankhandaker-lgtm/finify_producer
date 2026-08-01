BEGIN;

CREATE TABLE IF NOT EXISTS kyc.sanction_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode varchar(20) NOT NULL,
  source varchar(40) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'RUNNING',
  records_received integer NOT NULL DEFAULT 0,
  records_applied integer NOT NULL DEFAULT 0,
  file_name varchar(255) NULL,
  file_sha256 char(64) NULL,
  actor_id varchar(100) NOT NULL,
  error_message text NULL,
  started_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamp without time zone NULL,
  CONSTRAINT "CK_KYC_SANCTION_SYNC_MODE" CHECK (mode IN ('OFFICIAL','MANUAL_REPLACE','MANUAL_MERGE')),
  CONSTRAINT "CK_KYC_SANCTION_SYNC_STATUS" CHECK (status IN ('RUNNING','COMPLETED','FAILED'))
);

CREATE INDEX IF NOT EXISTS "IDX_KYC_SANCTION_SYNC_RUNS"
  ON kyc.sanction_sync_runs(started_at DESC);

COMMIT;
