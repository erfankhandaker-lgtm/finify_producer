DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(procedure.oid) INTO v_definition
  FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
  WHERE namespace.nspname='onboarding' AND procedure.proname='advance_journey_step';

  IF v_definition IS NULL OR v_definition NOT LIKE '%customer.status=''ONBOARDING''%' THEN
    RAISE EXCEPTION 'Onboarding customer activation qualification fix is missing';
  END IF;
END $$;
