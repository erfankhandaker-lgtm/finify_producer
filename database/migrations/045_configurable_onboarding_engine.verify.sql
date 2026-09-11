DO $$
BEGIN
  IF to_regclass('customer_registry.customers') IS NULL THEN
    RAISE EXCEPTION 'customer_registry.customers is missing';
  END IF;
  IF to_regclass('onboarding.journey_definitions') IS NULL
     OR to_regclass('onboarding.journey_versions') IS NULL
     OR to_regclass('onboarding.journey_instances') IS NULL THEN
    RAISE EXCEPTION 'Core onboarding tables are missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='kyc' AND table_name='cases' AND column_name='customer_id'
  ) THEN
    RAISE EXCEPTION 'KYC cases are not linked to the UUID customer principal';
  END IF;
  IF to_regprocedure('onboarding.select_active_journey(uuid,character,character varying,character varying,timestamp with time zone)') IS NULL THEN
    RAISE EXCEPTION 'Journey selector function is missing';
  END IF;
  IF to_regprocedure('onboarding.start_or_resume_journey(uuid,character,character varying,character varying,character,character varying,bytea,character,character varying,timestamp with time zone)') IS NULL THEN
    RAISE EXCEPTION 'Journey start/resume function is missing';
  END IF;
  IF (SELECT count(*) FROM onboarding.node_type_catalogue) < 15 THEN
    RAISE EXCEPTION 'Onboarding node catalogue was not seeded';
  END IF;
  IF (SELECT count(*) FROM public.admin_permissions WHERE code LIKE 'onboarding_%') <> 9 THEN
    RAISE EXCEPTION 'Onboarding permissions were not provisioned';
  END IF;
END $$;
