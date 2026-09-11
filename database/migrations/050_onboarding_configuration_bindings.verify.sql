DO $$
DECLARE
  v_placeholder_count integer;
BEGIN
  IF to_regclass('onboarding.configuration_definitions') IS NULL
     OR to_regclass('onboarding.configuration_versions') IS NULL
     OR to_regclass('onboarding.wallet_product_bindings') IS NULL THEN
    RAISE EXCEPTION 'Governed onboarding configuration tables are missing';
  END IF;

  SELECT count(*) INTO v_placeholder_count
  FROM onboarding.journey_nodes
  WHERE journey_version_id='00000000-0000-4000-8004-000000000001'
    AND configuration::text ~ 'DEFAULT_(OTP|CUSTOMER_CONSENT|CUSTOMER_PROFILE|KYC|RETAIL|SCORE_PROVIDER|CREDIT_POLICY)';
  IF v_placeholder_count<>0 THEN
    RAISE EXCEPTION 'Default onboarding journey still contains % placeholder bindings',v_placeholder_count;
  END IF;

  IF (SELECT count(*) FROM onboarding.configuration_versions
      WHERE id IN (
        '00000000-0000-4000-8302-000000000001',
        '00000000-0000-4000-8304-000000000001',
        '00000000-0000-4000-8306-000000000001'
      ))<>3 THEN
    RAISE EXCEPTION 'Default governed configuration versions are incomplete';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM onboarding.otp_policies
    WHERE tenant_id='00000000-0000-4000-8000-000000000001'
      AND code='UGA_MOBILE_CUSTOMER_OTP' AND status='ACTIVE' AND is_active) THEN
    RAISE EXCEPTION 'Default OTP policy is not active';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.credit_score_providers
    WHERE code='FINIFY_SCORE_MODEL_UGA_V1' AND NOT is_active) THEN
    RAISE EXCEPTION 'Draft score-provider baseline is missing or incorrectly active';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.credit_master_rules
    WHERE rule_code='UGA_RETAIL_CREDIT_POLICY' AND version=1 AND status='DRAFT') THEN
    RAISE EXCEPTION 'Draft credit policy baseline is missing or incorrectly active';
  END IF;
END $$;
