BEGIN;

UPDATE onboarding.journey_nodes SET configuration='{"policyCode":"DEFAULT_OTP"}'::jsonb
WHERE journey_version_id='00000000-0000-4000-8004-000000000001' AND node_key='otp';
UPDATE onboarding.journey_nodes SET configuration='{"consentVersionId":"DEFAULT_CUSTOMER_CONSENT"}'::jsonb
WHERE journey_version_id='00000000-0000-4000-8004-000000000001' AND node_key='consent';
UPDATE onboarding.journey_nodes SET configuration='{"formVersionId":"DEFAULT_CUSTOMER_PROFILE"}'::jsonb
WHERE journey_version_id='00000000-0000-4000-8004-000000000001' AND node_key='profile';
UPDATE onboarding.journey_nodes SET configuration='{"kycConfigurationCode":"DEFAULT_KYC"}'::jsonb
WHERE journey_version_id='00000000-0000-4000-8004-000000000001' AND node_key='kyc';
UPDATE onboarding.journey_nodes SET configuration='{"walletType":103,"currency":"UGX","pricingPlanCode":"DEFAULT_RETAIL"}'::jsonb
WHERE journey_version_id='00000000-0000-4000-8004-000000000001' AND node_key='wallet';
UPDATE onboarding.journey_nodes SET configuration='{"providerCode":"DEFAULT_SCORE_PROVIDER"}'::jsonb
WHERE journey_version_id='00000000-0000-4000-8004-000000000001' AND node_key='score';
UPDATE onboarding.journey_nodes SET configuration='{"policyCode":"DEFAULT_CREDIT_POLICY"}'::jsonb
WHERE journey_version_id='00000000-0000-4000-8004-000000000001' AND node_key='policy';

DELETE FROM public.credit_master_rules WHERE rule_code='UGA_RETAIL_CREDIT_POLICY' AND version=1;
DELETE FROM public.credit_score_providers WHERE code='FINIFY_SCORE_MODEL_UGA_V1';
DELETE FROM public.credit_http_integrations WHERE code='FINIFY_SCORE_MODEL_API';
DELETE FROM onboarding.wallet_product_bindings WHERE id='00000000-0000-4000-8309-000000000001';
DELETE FROM onboarding.configuration_versions WHERE configuration_definition_id IN (
  '00000000-0000-4000-8301-000000000001','00000000-0000-4000-8303-000000000001',
  '00000000-0000-4000-8305-000000000001'
);
DELETE FROM onboarding.configuration_definitions WHERE id IN (
  '00000000-0000-4000-8301-000000000001','00000000-0000-4000-8303-000000000001',
  '00000000-0000-4000-8305-000000000001'
);
DELETE FROM onboarding.otp_policies WHERE id='00000000-0000-4000-8300-000000000001';

ALTER TABLE onboarding.otp_policies
  DROP CONSTRAINT "UQ_ONBOARDING_OTP_CODE_VERSION",
  DROP CONSTRAINT "CK_ONBOARDING_OTP_ACTIVE_STATE",
  DROP CONSTRAINT "CK_ONBOARDING_OTP_CHECKER",
  DROP CONSTRAINT "CK_ONBOARDING_OTP_STATUS",
  DROP CONSTRAINT "CK_ONBOARDING_OTP_VERSION",
  DROP CONSTRAINT "CK_ONBOARDING_OTP_CODE",
  DROP COLUMN activated_at,
  DROP COLUMN approved_at,
  DROP COLUMN submitted_at,
  DROP COLUMN approved_by,
  DROP COLUMN modified_by,
  DROP COLUMN status,
  DROP COLUMN version_number,
  DROP COLUMN code;

DROP TABLE onboarding.wallet_product_bindings;
DROP TABLE onboarding.configuration_versions;
DROP TABLE onboarding.configuration_definitions;

COMMIT;
