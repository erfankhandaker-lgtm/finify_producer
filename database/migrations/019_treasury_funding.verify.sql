DO $$
BEGIN
  IF to_regclass('public.treasury_funding_requests') IS NULL THEN
    RAISE EXCEPTION 'Treasury funding request table is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND indexname='UQ_TREASURY_FUNDING_REFERENCE'
  ) THEN
    RAISE EXCEPTION 'Treasury funding idempotency index is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname='CK_WALLET_AUDIT_OPERATION'
      AND pg_get_constraintdef(oid) ILIKE '%TREASURY_FUNDING%'
  ) THEN
    RAISE EXCEPTION 'Wallet audit constraint does not allow treasury funding';
  END IF;
END
$$;

SELECT 'Treasury funding migration verified' AS result;
