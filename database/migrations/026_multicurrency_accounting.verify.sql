DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."SW_TBL_WALLET"
    WHERE "Wallet_MSISDN"=9800002110 AND "Wallet_Code"=110
      AND upper(currency)='UGX' AND "Status"=0
  ) THEN
    RAISE EXCEPTION 'UGX safeguarding wallet is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sw_tbl_accounting_configuration
    WHERE reporting_entity='FINIFY_UK' AND currency='UGX' AND is_active
  ) THEN
    RAISE EXCEPTION 'UGX accounting configuration is missing';
  END IF;
  IF EXISTS (
    WITH used AS (
      SELECT upper(currency)::varchar(3) currency FROM public."SW_TBL_WALLET"
      UNION SELECT upper(currency)::varchar(3) FROM public.sw_tbl_accounting_journal
    )
    SELECT 1 FROM used
    LEFT JOIN public.sw_tbl_accounting_configuration config
      ON config.reporting_entity='FINIFY_UK' AND config.currency=used.currency
     AND config.is_active
    WHERE used.currency ~ '^[A-Z]{3}$' AND config.id IS NULL
  ) THEN
    RAISE EXCEPTION 'A currency in use lacks an active accounting configuration';
  END IF;
END
$verify$;

SELECT 'Multi-currency accounting verified' AS result;
