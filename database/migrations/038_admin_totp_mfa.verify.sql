DO $$
BEGIN
  IF to_regclass('public.admin_mfa_profiles') IS NULL
     OR to_regclass('public.admin_mfa_challenges') IS NULL
     OR to_regclass('public.admin_mfa_audit') IS NULL
     OR to_regclass('public.admin_security_settings') IS NULL THEN
    RAISE EXCEPTION 'Admin MFA migration is incomplete';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_security_settings
    WHERE id = 1 AND mfa_required AND captcha_enabled
  ) THEN
    RAISE EXCEPTION 'Mandatory MFA/CAPTCHA policy was not created';
  END IF;
END $$;
