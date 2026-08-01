DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.sw_tbl_accounting_configuration config
    CROSS JOIN (VALUES (110),(113),(114)) required(wallet_code)
    LEFT JOIN public."SW_TBL_WALLET" wallet
      ON wallet."Wallet_Code"=required.wallet_code
     AND upper(wallet.currency)=config.currency
     AND wallet.owner_type='SYSTEM' AND wallet."Status"=0
    WHERE config.reporting_entity='FINIFY_UK' AND config.is_active
      AND config.effective_from<=CURRENT_DATE
      AND (config.effective_to IS NULL OR config.effective_to>=CURRENT_DATE)
      AND wallet."Wallet_MSISDN" IS NULL
  ) THEN
    RAISE EXCEPTION 'An active currency lacks a required multi-currency Treasury wallet';
  END IF;
END
$verify$;

SELECT 'Multi-currency Treasury wallets verified' AS result;
