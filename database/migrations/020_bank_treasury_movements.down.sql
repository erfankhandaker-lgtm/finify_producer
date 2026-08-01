BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.treasury_funding_requests
    WHERE direction='DEBIT' OR funding_type='CHARGE_REVENUE'
  ) THEN
    RAISE EXCEPTION
      'Cannot roll back migration 020 while treasury withdrawal records exist';
  END IF;
END
$$;

ALTER TABLE public.treasury_funding_requests
  DROP CONSTRAINT IF EXISTS "CK_TREASURY_MOVEMENT_DIRECTION",
  DROP CONSTRAINT IF EXISTS "CK_TREASURY_MOVEMENT_TARGET",
  DROP CONSTRAINT IF EXISTS "CK_TREASURY_MOVEMENT_PURPOSE",
  DROP CONSTRAINT IF EXISTS "CK_TREASURY_MOVEMENT_BALANCES";

ALTER TABLE public.treasury_funding_requests
  ADD CONSTRAINT "CK_TREASURY_FUNDING_TYPE"
    CHECK (funding_type IN ('SAFEGUARDING','COMMISSION_FUNDING')),
  ADD CONSTRAINT "CK_TREASURY_FUNDING_WALLET"
    CHECK (
      (funding_type='SAFEGUARDING' AND wallet_code=110)
      OR
      (funding_type='COMMISSION_FUNDING' AND wallet_code=114)
    ),
  ADD CONSTRAINT "CK_TREASURY_FUNDING_BALANCES"
    CHECK (
      (status='APPROVED'
        AND wallet_balance_before IS NOT NULL
        AND wallet_balance_after=wallet_balance_before+amount)
      OR
      (status<>'APPROVED'
        AND wallet_balance_before IS NULL
        AND wallet_balance_after IS NULL)
    );

ALTER TABLE public.treasury_funding_requests
  DROP COLUMN IF EXISTS direction,
  DROP COLUMN IF EXISTS bank_name,
  DROP COLUMN IF EXISTS bank_account,
  DROP COLUMN IF EXISTS value_date,
  DROP COLUMN IF EXISTS evidence_reference,
  DROP COLUMN IF EXISTS business_purpose;

ALTER TABLE public.sw_tbl_wallet_operation_audit
  DROP CONSTRAINT IF EXISTS "CK_WALLET_AUDIT_OPERATION";

ALTER TABLE public.sw_tbl_wallet_operation_audit
  ADD CONSTRAINT "CK_WALLET_AUDIT_OPERATION"
  CHECK (operation IN (
    'CREATE','SET_DEFAULT','STATUS_CHANGE','TREASURY_FUNDING'
  ));

COMMIT;
