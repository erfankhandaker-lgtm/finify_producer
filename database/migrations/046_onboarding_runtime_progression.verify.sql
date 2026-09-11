DO $$
BEGIN
  IF to_regprocedure(
    'onboarding.advance_journey_step(uuid,character,character varying,character varying,character varying,character,jsonb,character varying,character varying)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Onboarding runtime progression function is missing';
  END IF;
END $$;
