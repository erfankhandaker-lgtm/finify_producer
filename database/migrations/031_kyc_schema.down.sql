BEGIN;

DELETE FROM public.admin_role_permissions
WHERE permission_id IN (
  SELECT id FROM public.admin_permissions
  WHERE code IN ('kyc.read','kyc.operate','kyc.review','kyc.configure','kyc.documents.read')
);
DELETE FROM public.admin_permissions
WHERE code IN ('kyc.read','kyc.operate','kyc.review','kyc.configure','kyc.documents.read');

DROP SCHEMA IF EXISTS kyc CASCADE;

COMMIT;
