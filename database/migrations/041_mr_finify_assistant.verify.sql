DO $$
BEGIN
  IF to_regclass('public.mr_finify_interactions') IS NULL THEN
    RAISE EXCEPTION 'mr_finify_interactions table is missing';
  END IF;
  IF (SELECT count(*) FROM public.admin_permissions
      WHERE code IN ('assistant.use','assistant.audit','assistant.configure')) <> 3 THEN
    RAISE EXCEPTION 'Mr. Finify permissions are incomplete';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_roles role
    JOIN public.admin_role_permissions link ON link.role_id=role.id
    JOIN public.admin_permissions permission ON permission.id=link.permission_id
    WHERE role.code='super_admin' AND permission.code='assistant.configure'
  ) THEN
    RAISE EXCEPTION 'Superadmin Mr. Finify configuration permission is missing';
  END IF;
END $$;
