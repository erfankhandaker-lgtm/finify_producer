DO $$ BEGIN
  IF to_regclass('public.admin_biometric_profiles') IS NULL OR to_regclass('public.admin_biometric_challenges') IS NULL OR to_regclass('public.admin_biometric_audit') IS NULL THEN
    RAISE EXCEPTION 'Admin biometric login schema is incomplete';
  END IF;
END $$;
