BEGIN;
DROP FUNCTION IF EXISTS onboarding.propagate_kyc_decision(uuid,varchar);
DROP FUNCTION IF EXISTS onboarding.advance_verified_step(uuid,varchar,varchar,varchar,jsonb,varchar,varchar,varchar);
DELETE FROM onboarding.journey_transitions WHERE journey_version_id='00000000-0000-4000-8004-000000000001'
 AND from_node_id='00000000-0000-4000-8200-000000000007' AND outcome_code='REJECTED';
UPDATE onboarding.journey_transitions SET outcome_code='SUCCESS' WHERE journey_version_id='00000000-0000-4000-8004-000000000001'
 AND from_node_id='00000000-0000-4000-8200-000000000007' AND to_node_id='00000000-0000-4000-8200-000000000008';
ALTER TABLE kyc.cases DROP COLUMN configuration_version_id;
DROP INDEX onboarding."UQ_ONBOARDING_OTP_IDEMPOTENCY";
ALTER TABLE onboarding.otp_challenges DROP COLUMN locked_at,DROP COLUMN resend_available_at,DROP COLUMN idempotency_key;
DROP TABLE onboarding.profile_form_submissions;DROP TABLE onboarding.consent_acceptances;DROP TABLE onboarding.customer_credentials;
COMMIT;
