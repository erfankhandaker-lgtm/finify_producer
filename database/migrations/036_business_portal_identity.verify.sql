DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='SW_TBL_PROFILE_MERCHANT' AND column_name='PIN'
  ) THEN
    RAISE EXCEPTION 'Business portal PIN support is missing';
  END IF;
  IF to_regprocedure('public.walletpindetail(text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Unified portal PIN function is missing';
  END IF;
END $$;
