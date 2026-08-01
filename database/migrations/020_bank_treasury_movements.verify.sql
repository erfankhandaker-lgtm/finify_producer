DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='treasury_funding_requests'
      AND column_name='direction'
  ) THEN
    RAISE EXCEPTION 'Treasury movement direction is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname='CK_TREASURY_MOVEMENT_TARGET'
  ) THEN
    RAISE EXCEPTION 'Treasury movement target constraint is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname='CK_TREASURY_MOVEMENT_BALANCES'
      AND pg_get_constraintdef(oid) ILIKE '%wallet_balance_after >=%'
  ) THEN
    RAISE EXCEPTION 'Treasury movement non-negative balance constraint is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname='CK_WALLET_AUDIT_OPERATION'
      AND pg_get_constraintdef(oid) ILIKE '%TREASURY_WITHDRAWAL%'
  ) THEN
    RAISE EXCEPTION 'Treasury withdrawal audit operation is missing';
  END IF;
END
$$;

SELECT 'Bank treasury movement migration verified' AS result;
