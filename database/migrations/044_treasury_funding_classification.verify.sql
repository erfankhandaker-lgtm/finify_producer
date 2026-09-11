DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (VALUES (115),(116),(117)) required(wallet_code)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.sw_tbl_wallet_gl_mapping mapping
      WHERE mapping.wallet_code=required.wallet_code AND mapping.is_active
    )
  ) THEN
    RAISE EXCEPTION 'Treasury funding classification GL mappings are incomplete';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sw_tbl_accounting_configuration configuration
    CROSS JOIN (VALUES (116),(117)) required(wallet_code)
    WHERE configuration.is_active
      AND NOT EXISTS (
        SELECT 1 FROM public."SW_TBL_WALLET" wallet
        WHERE wallet.owner_type='SYSTEM' AND wallet."Status"=0
          AND wallet."Wallet_Code"=required.wallet_code
          AND upper(wallet.currency)=upper(configuration.currency)
      )
  ) THEN
    RAISE EXCEPTION 'A configured currency lacks funding classification control wallets';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.treasury_funding_requests
    WHERE funding_type='SAFEGUARDING'
      AND funding_classification NOT IN (
        'OWNER_INVESTMENT','CUSTOMER_FUNDS','BANK_PREFUNDING'
      )
  ) THEN
    RAISE EXCEPTION 'A safeguarding movement has an invalid funding classification';
  END IF;
END $$;

SELECT 'Treasury funding classification migration verified' AS result;
