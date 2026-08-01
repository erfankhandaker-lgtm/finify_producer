BEGIN;

ALTER TABLE public.treasury_funding_requests
  ADD COLUMN IF NOT EXISTS direction varchar(8) NOT NULL DEFAULT 'CREDIT',
  ADD COLUMN IF NOT EXISTS bank_name varchar(160),
  ADD COLUMN IF NOT EXISTS bank_account varchar(160),
  ADD COLUMN IF NOT EXISTS value_date date,
  ADD COLUMN IF NOT EXISTS evidence_reference text,
  ADD COLUMN IF NOT EXISTS business_purpose varchar(40);

UPDATE public.treasury_funding_requests
SET bank_name=COALESCE(bank_name,'LEGACY TEST ENTRY'),
    bank_account=COALESCE(bank_account,'NOT CAPTURED'),
    value_date=COALESCE(value_date,created_at::date),
    evidence_reference=COALESCE(evidence_reference,'LEGACY-MIGRATION'),
    business_purpose=COALESCE(
      business_purpose,
      CASE funding_type
        WHEN 'SAFEGUARDING' THEN 'SAFEGUARDING_FUNDING'
        ELSE 'COMMISSION_FUNDING'
      END
    );

ALTER TABLE public.treasury_funding_requests
  ALTER COLUMN bank_name SET NOT NULL,
  ALTER COLUMN bank_account SET NOT NULL,
  ALTER COLUMN value_date SET NOT NULL,
  ALTER COLUMN evidence_reference SET NOT NULL,
  ALTER COLUMN business_purpose SET NOT NULL;

ALTER TABLE public.treasury_funding_requests
  DROP CONSTRAINT IF EXISTS "CK_TREASURY_FUNDING_TYPE",
  DROP CONSTRAINT IF EXISTS "CK_TREASURY_FUNDING_WALLET",
  DROP CONSTRAINT IF EXISTS "CK_TREASURY_FUNDING_BALANCES",
  DROP CONSTRAINT IF EXISTS "CK_TREASURY_MOVEMENT_DIRECTION",
  DROP CONSTRAINT IF EXISTS "CK_TREASURY_MOVEMENT_TARGET",
  DROP CONSTRAINT IF EXISTS "CK_TREASURY_MOVEMENT_PURPOSE",
  DROP CONSTRAINT IF EXISTS "CK_TREASURY_MOVEMENT_BALANCES";

ALTER TABLE public.treasury_funding_requests
  ADD CONSTRAINT "CK_TREASURY_FUNDING_TYPE"
    CHECK (funding_type IN ('SAFEGUARDING','COMMISSION_FUNDING','CHARGE_REVENUE')),
  ADD CONSTRAINT "CK_TREASURY_MOVEMENT_DIRECTION"
    CHECK (direction IN ('CREDIT','DEBIT')),
  ADD CONSTRAINT "CK_TREASURY_MOVEMENT_TARGET"
    CHECK (
      (direction='CREDIT' AND (
        (funding_type='SAFEGUARDING' AND wallet_code=110)
        OR
        (funding_type='COMMISSION_FUNDING' AND wallet_code=114)
      ))
      OR
      (direction='DEBIT' AND (
        (funding_type='SAFEGUARDING' AND wallet_code=110)
        OR
        (funding_type='CHARGE_REVENUE' AND wallet_code=113)
      ))
    ),
  ADD CONSTRAINT "CK_TREASURY_MOVEMENT_PURPOSE"
    CHECK (business_purpose IN (
      'SAFEGUARDING_FUNDING','COMMISSION_FUNDING',
      'SAFEGUARDING_WITHDRAWAL','GROSS_PROFIT_WITHDRAWAL'
    )),
  ADD CONSTRAINT "CK_TREASURY_MOVEMENT_BALANCES"
    CHECK (
      (status='APPROVED'
        AND wallet_balance_before IS NOT NULL
        AND wallet_balance_after >= 0
        AND wallet_balance_after=wallet_balance_before+
          CASE WHEN direction='CREDIT' THEN amount ELSE -amount END)
      OR
      (status<>'APPROVED'
        AND wallet_balance_before IS NULL
        AND wallet_balance_after IS NULL)
    );

ALTER TABLE public.sw_tbl_wallet_operation_audit
  DROP CONSTRAINT IF EXISTS "CK_WALLET_AUDIT_OPERATION";

ALTER TABLE public.sw_tbl_wallet_operation_audit
  ADD CONSTRAINT "CK_WALLET_AUDIT_OPERATION"
  CHECK (operation IN (
    'CREATE','SET_DEFAULT','STATUS_CHANGE',
    'TREASURY_FUNDING','TREASURY_WITHDRAWAL'
  ));

CREATE INDEX IF NOT EXISTS "IDX_TREASURY_VALUE_DATE"
  ON public.treasury_funding_requests(value_date,currency,direction);

COMMENT ON TABLE public.treasury_funding_requests IS
  'Maker-checker bank treasury movement subledger for safeguarding, commission funding, and gross-profit withdrawals.';

COMMIT;
