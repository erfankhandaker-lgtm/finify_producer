BEGIN;

DELETE FROM public.admin_role_permissions
WHERE permission_id IN (
  SELECT id FROM public.admin_permissions
  WHERE code IN ('reference_data.read', 'reference_data.make', 'reference_data.check')
);

DELETE FROM public.admin_permissions
WHERE code IN ('reference_data.read', 'reference_data.make', 'reference_data.check');

DROP TABLE IF EXISTS public.reference_data_change_requests;

COMMIT;
