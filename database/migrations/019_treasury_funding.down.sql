BEGIN;

ALTER TABLE public.sw_tbl_wallet_operation_audit
  DROP CONSTRAINT IF EXISTS "CK_WALLET_AUDIT_OPERATION";

ALTER TABLE public.sw_tbl_wallet_operation_audit
  ADD CONSTRAINT "CK_WALLET_AUDIT_OPERATION"
  CHECK (operation IN ('CREATE','SET_DEFAULT','STATUS_CHANGE'));

DROP TABLE IF EXISTS public.treasury_funding_requests;

COMMIT;
