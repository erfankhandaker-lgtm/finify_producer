BEGIN;

DELETE FROM public.admin_role_permissions
WHERE permission_id IN (
  SELECT id FROM public.admin_permissions
  WHERE code IN (
    'customers.manage','charges.read','charges.make','charges.check',
    'commissions.read','commissions.make','commissions.check',
    'accounting.read','accounting.operate','aml.read','aml.make','aml.check'
  )
);
DELETE FROM public.admin_permissions
WHERE code IN (
  'customers.manage','charges.read','charges.make','charges.check',
  'commissions.read','commissions.make','commissions.check',
  'accounting.read','accounting.operate','aml.read','aml.make','aml.check'
);

DROP TABLE IF EXISTS public.aml_cases;
DROP TABLE IF EXISTS public.customer_profile_operation_audit;

COMMIT;
