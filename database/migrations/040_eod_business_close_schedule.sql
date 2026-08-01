BEGIN;

CREATE TABLE IF NOT EXISTS public.sw_tbl_eod_schedule (
  reporting_entity varchar(32) PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  business_timezone varchar(100) NOT NULL DEFAULT 'Europe/London',
  closure_time time NOT NULL DEFAULT '00:05:00',
  last_tick_at timestamp NULL,
  last_run_at timestamp NULL,
  last_business_date date NULL,
  last_status varchar(24) NULL,
  last_message text NULL,
  lease_owner varchar(100) NULL,
  lease_until timestamp NULL,
  updated_by varchar(150) NOT NULL DEFAULT 'MIGRATION_040',
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_eod_schedule_status CHECK (
    last_status IS NULL OR last_status IN ('IDLE','RUNNING','COMPLETED','PARTIAL','FAILED','BLOCKED')
  )
);

INSERT INTO public.sw_tbl_eod_schedule(
  reporting_entity,enabled,business_timezone,closure_time,updated_by
)
VALUES('FINIFY_UK',true,'Europe/London','00:05:00','MIGRATION_040')
ON CONFLICT(reporting_entity) DO NOTHING;

COMMIT;
