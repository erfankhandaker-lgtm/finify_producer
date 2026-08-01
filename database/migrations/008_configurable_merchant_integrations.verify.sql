DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='SW_TBL_PROFILE_MERCHANT' AND column_name='Integration_Channel'
  ) THEN RAISE EXCEPTION 'Integration_Channel is missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='SW_TBL_PROFILE_MERCHANT'
      AND column_name='Is_Special_Merchant' AND is_nullable='NO'
  ) THEN RAISE EXCEPTION 'Non-null Is_Special_Merchant is missing'; END IF;
  IF to_regclass('public.sw_tbl_merchant_integration_config') IS NULL THEN
    RAISE EXCEPTION 'merchant integration config table is missing';
  END IF;
  IF to_regclass('public.sw_tbl_merchant_integration_auth') IS NULL THEN
    RAISE EXCEPTION 'merchant integration auth table is missing';
  END IF;
  IF to_regclass('public.sw_tbl_merchant_confirmation') IS NULL THEN
    RAISE EXCEPTION 'merchant confirmation table is missing';
  END IF;
END
$verify$;

SELECT 'merchant integration migration verified' AS result;
