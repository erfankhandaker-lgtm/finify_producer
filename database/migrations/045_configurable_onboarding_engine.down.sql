BEGIN;

DELETE FROM public.admin_role_permissions
WHERE permission_id IN (
  SELECT id FROM public.admin_permissions WHERE code LIKE 'onboarding_%'
);
DELETE FROM public.admin_permissions WHERE code LIKE 'onboarding_%';

DROP INDEX IF EXISTS kyc."IDX_KYC_CASE_CUSTOMER_UUID";
ALTER TABLE kyc.cases DROP CONSTRAINT IF EXISTS "CK_KYC_CUSTOMER_PRINCIPAL";
ALTER TABLE kyc.cases DROP COLUMN IF EXISTS customer_id;
ALTER TABLE kyc.cases ALTER COLUMN customer_msisdn SET NOT NULL;

DROP SCHEMA IF EXISTS onboarding CASCADE;
DROP SCHEMA IF EXISTS customer_registry CASCADE;

COMMIT;
