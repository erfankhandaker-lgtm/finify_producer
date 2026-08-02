DO $$
BEGIN
  IF to_regclass('public.mr_finify_settings') IS NULL
     OR to_regclass('public.mr_finify_configuration_audit') IS NULL THEN
    RAISE EXCEPTION 'Mr. Finify secure configuration tables are missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mr_finify_settings WHERE id=1) THEN
    RAISE EXCEPTION 'Mr. Finify singleton configuration row is missing';
  END IF;
END $$;
