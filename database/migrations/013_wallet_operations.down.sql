BEGIN;
DELETE FROM admin_role_permissions WHERE permission_id=(SELECT id FROM admin_permissions WHERE code='wallets.manage');
DELETE FROM admin_permissions WHERE code='wallets.manage';
DROP TABLE IF EXISTS public.sw_tbl_wallet_operation_audit;
DROP INDEX IF EXISTS public."IDX_WALLET_OWNER_DEFAULT";
DROP INDEX IF EXISTS public."IDX_WALLET_OWNER";
ALTER TABLE public."SW_TBL_WALLET"
  DROP CONSTRAINT IF EXISTS "CK_WALLET_PURPOSE",
  DROP CONSTRAINT IF EXISTS "CK_WALLET_OWNER_TYPE",
  DROP COLUMN IF EXISTS wallet_purpose,
  DROP COLUMN IF EXISTS owner_type,
  DROP COLUMN IF EXISTS owner_msisdn;
DROP SEQUENCE IF EXISTS public.sw_wallet_account_number_seq;
COMMIT;
