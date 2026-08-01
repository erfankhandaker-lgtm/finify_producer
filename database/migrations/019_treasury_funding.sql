BEGIN;

CREATE TABLE IF NOT EXISTS public.treasury_funding_requests (
  id bigserial PRIMARY KEY,
  funding_type varchar(32) NOT NULL,
  wallet_msisdn bigint NOT NULL
    REFERENCES public."SW_TBL_WALLET"("Wallet_MSISDN")
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  wallet_code integer NOT NULL
    REFERENCES public."SW_TBL_WALLET_TYPE"("Wallet_ID")
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  currency varchar(3) NOT NULL,
  amount numeric(24,2) NOT NULL,
  reference varchar(100) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'PENDING',
  maker_id varchar(100) NOT NULL,
  maker_comment text NOT NULL,
  checker_id varchar(100) NULL,
  checker_comment text NULL,
  wallet_balance_before numeric(24,2) NULL,
  wallet_balance_after numeric(24,2) NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at timestamp without time zone NULL,
  CONSTRAINT "CK_TREASURY_FUNDING_TYPE"
    CHECK (funding_type IN ('SAFEGUARDING','COMMISSION_FUNDING')),
  CONSTRAINT "CK_TREASURY_FUNDING_WALLET"
    CHECK (
      (funding_type='SAFEGUARDING' AND wallet_code=110)
      OR
      (funding_type='COMMISSION_FUNDING' AND wallet_code=114)
    ),
  CONSTRAINT "CK_TREASURY_FUNDING_CURRENCY"
    CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT "CK_TREASURY_FUNDING_AMOUNT"
    CHECK (amount > 0),
  CONSTRAINT "CK_TREASURY_FUNDING_STATUS"
    CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  CONSTRAINT "CK_TREASURY_DIFFERENT_CHECKER"
    CHECK (checker_id IS NULL OR lower(checker_id)<>lower(maker_id)),
  CONSTRAINT "CK_TREASURY_FUNDING_BALANCES"
    CHECK (
      (status='APPROVED'
        AND wallet_balance_before IS NOT NULL
        AND wallet_balance_after=wallet_balance_before+amount)
      OR
      (status<>'APPROVED'
        AND wallet_balance_before IS NULL
        AND wallet_balance_after IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_TREASURY_FUNDING_REFERENCE"
  ON public.treasury_funding_requests(lower(reference));

CREATE INDEX IF NOT EXISTS "IDX_TREASURY_FUNDING_QUEUE"
  ON public.treasury_funding_requests(status,created_at DESC);

ALTER TABLE public.sw_tbl_wallet_operation_audit
  DROP CONSTRAINT IF EXISTS "CK_WALLET_AUDIT_OPERATION";

ALTER TABLE public.sw_tbl_wallet_operation_audit
  ADD CONSTRAINT "CK_WALLET_AUDIT_OPERATION"
  CHECK (operation IN (
    'CREATE','SET_DEFAULT','STATUS_CHANGE','TREASURY_FUNDING'
  ));

COMMIT;
