BEGIN;
DROP TABLE IF EXISTS public.admin_mfa_audit;
DROP TABLE IF EXISTS public.admin_mfa_challenges;
DROP TABLE IF EXISTS public.admin_mfa_profiles;
DROP TABLE IF EXISTS public.admin_security_settings;
COMMIT;
