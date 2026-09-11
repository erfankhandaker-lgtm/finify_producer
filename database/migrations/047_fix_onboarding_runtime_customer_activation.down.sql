BEGIN;

DROP FUNCTION IF EXISTS onboarding.advance_journey_step(
  uuid,char(64),varchar,varchar,varchar,char(64),jsonb,varchar,varchar
);

COMMIT;
