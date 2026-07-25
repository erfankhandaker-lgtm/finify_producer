DO $verify$
BEGIN
  IF to_regclass('public.sw_tbl_wallet_operation_audit') IS NULL THEN
    RAISE EXCEPTION 'wallet operation audit table is missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public."SW_TBL_WALLET"
             WHERE owner_msisdn IS NULL OR owner_type IS NULL OR wallet_purpose IS NULL) THEN
    RAISE EXCEPTION 'wallet ownership backfill is incomplete';
  END IF;
  IF EXISTS (SELECT 1 FROM public."SW_TBL_WALLET"
             WHERE owner_type='CUSTOMER' AND "Wallet_MSISDN"=owner_msisdn
               AND (wallet_purpose<>'CUSTOMER_MAIN' OR NOT is_default)) THEN
    RAISE EXCEPTION 'customer main wallet classification is incomplete';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM admin_permissions WHERE code='wallets.manage') THEN
    RAISE EXCEPTION 'wallet management permission is missing';
  END IF;
END
$verify$;
SELECT 'Wallet operations migration verified' AS result;
