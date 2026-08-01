BEGIN;

-- Wallet code 110 is the safeguarding account in every configured currency.
-- Older USD/GBP rows predate wallet-purpose metadata and were backfilled as
-- generic SYSTEM wallets.
UPDATE public."SW_TBL_WALLET"
SET wallet_purpose='SAFEGUARDING',
    "Modified_By"='MIGRATION_028',
    "Modified_Date"=CURRENT_TIMESTAMP
WHERE owner_type='SYSTEM'
  AND "Wallet_Code"=110
  AND "Status"=0
  AND wallet_purpose<>'SAFEGUARDING';

-- Repair approved rows written by builds whose unquoted RETURNING alias was
-- not exposed as `balance` by the database driver.
UPDATE public.treasury_funding_requests
SET wallet_balance_after =
      wallet_balance_before
      + CASE WHEN direction='CREDIT' THEN amount ELSE -amount END
WHERE status='APPROVED'
  AND wallet_balance_before IS NOT NULL
  AND wallet_balance_after IS NULL;

UPDATE public.sw_tbl_wallet_operation_audit audit
SET new_state=jsonb_set(
      audit.new_state,
      '{balance}',
      to_jsonb(movement.wallet_balance_after::text),
      true
    )
FROM public.treasury_funding_requests movement
WHERE audit.correlation_id=movement.reference
  AND audit.operation IN ('TREASURY_FUNDING','TREASURY_WITHDRAWAL')
  AND movement.status='APPROVED'
  AND movement.wallet_balance_after IS NOT NULL
  AND NOT (audit.new_state ? 'balance');

ALTER TABLE public.treasury_funding_requests
  DROP CONSTRAINT IF EXISTS "CK_TREASURY_MOVEMENT_BALANCES";

ALTER TABLE public.treasury_funding_requests
  ADD CONSTRAINT "CK_TREASURY_MOVEMENT_BALANCES"
  CHECK (
    (
      status='APPROVED'
      AND wallet_balance_before IS NOT NULL
      AND wallet_balance_after IS NOT NULL
      AND wallet_balance_after>=0
      AND wallet_balance_after=wallet_balance_before
        + CASE WHEN direction='CREDIT' THEN amount ELSE -amount END
    )
    OR
    (
      status<>'APPROVED'
      AND wallet_balance_before IS NULL
      AND wallet_balance_after IS NULL
    )
  );

COMMIT;
