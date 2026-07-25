DO $verify$
DECLARE
  v_test_rows integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='SW_TBL_AML' AND column_name='Is_Active'
  ) THEN
    RAISE EXCEPTION 'SW_TBL_AML.Is_Active is missing';
  END IF;

  IF (SELECT count(*) FROM pg_constraint
      WHERE conrelid='public."SW_TBL_AML"'::regclass
        AND conname IN ('UQ_AML_WALLET_KEYWORD','FK_AML_WALLET_CODE','FK_AML_KEYWORD',
                        'CK_AML_POSITIVE_LIMITS','CK_AML_AMOUNT_ORDER','CK_AML_COUNT_ORDER')) <> 6 THEN
    RAISE EXCEPTION 'AML configuration constraints are incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.reference_data_change_requests'::regclass
      AND conname='CK_REFERENCE_CHANGE_RESOURCE'
      AND pg_get_constraintdef(oid) LIKE '%AML%'
  ) THEN
    RAISE EXCEPTION 'AML maker-checker resource is not enabled';
  END IF;

  SELECT count(*) INTO v_test_rows
  FROM public."SW_TBL_AML" WHERE "Created_By"='MIGRATION_010_TEST';
  IF v_test_rows < 1 THEN
    RAISE EXCEPTION 'No AML development test rules were inserted';
  END IF;
END
$verify$;

SELECT 'AML configuration maker-checker migration verified' AS result;
