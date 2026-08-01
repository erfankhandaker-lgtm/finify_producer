BEGIN;

ALTER TABLE public.treasury_funding_requests
  DROP CONSTRAINT IF EXISTS "CK_TREASURY_MOVEMENT_BALANCES";

ALTER TABLE public.treasury_funding_requests
  ADD CONSTRAINT "CK_TREASURY_MOVEMENT_BALANCES"
  CHECK (
    (
      status='APPROVED'
      AND wallet_balance_before IS NOT NULL
      AND wallet_balance_after>=0
      AND wallet_balance_after=wallet_balance_before
        + CASE WHEN direction='CREDIT' THEN amount ELSE -amount END
    )
    OR status<>'APPROVED'
  );

COMMIT;
