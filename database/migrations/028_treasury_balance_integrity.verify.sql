DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."SW_TBL_WALLET"
    WHERE owner_type='SYSTEM'
      AND "Wallet_Code"=110
      AND "Status"=0
      AND wallet_purpose<>'SAFEGUARDING'
  ) THEN
    RAISE EXCEPTION 'An active safeguarding wallet has the wrong purpose';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.treasury_funding_requests
    WHERE status='APPROVED'
      AND (
        wallet_balance_before IS NULL
        OR wallet_balance_after IS NULL
        OR wallet_balance_after<>wallet_balance_before
          + CASE WHEN direction='CREDIT' THEN amount ELSE -amount END
      )
  ) THEN
    RAISE EXCEPTION 'An approved Treasury movement has an incomplete balance trail';
  END IF;
END
$verify$;

SELECT 'Treasury balance integrity verified' AS result;
