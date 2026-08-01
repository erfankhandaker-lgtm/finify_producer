BEGIN;
ALTER TABLE public.admin_security_settings
  DROP COLUMN IF EXISTS turnstile_site_key,
  DROP COLUMN IF EXISTS turnstile_secret_ciphertext,
  DROP COLUMN IF EXISTS turnstile_secret_iv,
  DROP COLUMN IF EXISTS turnstile_secret_auth_tag,
  DROP COLUMN IF EXISTS mfa_issuer;
COMMIT;
