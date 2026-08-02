BEGIN;
DELETE FROM public.admin_role_permissions
WHERE permission_id IN (
  SELECT id FROM public.admin_permissions
  WHERE code IN ('assistant.use','assistant.audit','assistant.configure')
);
DELETE FROM public.admin_permissions
WHERE code IN ('assistant.use','assistant.audit','assistant.configure');
DROP TABLE IF EXISTS public.mr_finify_interactions;
COMMIT;
