DO $verify$
BEGIN
  IF to_regprocedure('public.sw_fn_sync_wallet_type_gl_mapping()') IS NULL THEN
    RAISE EXCEPTION 'Wallet type GL mapping sync function is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname='TRG_WALLET_TYPE_GL_MAPPING' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Wallet type GL mapping sync trigger is missing';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public."SW_TBL_WALLET_TYPE" wallet_type
    LEFT JOIN public.sw_tbl_wallet_gl_mapping mapping
      ON mapping.wallet_code=wallet_type."Wallet_ID" AND mapping.is_active
    WHERE wallet_type."Wallet_Type" IN (100,200,300)
      AND mapping.wallet_code IS NULL
  ) THEN
    RAISE EXCEPTION 'An active customer, merchant, or agent wallet type lacks a GL mapping';
  END IF;
END
$verify$;

SELECT 'Accounting reporting controls verified' AS result;
