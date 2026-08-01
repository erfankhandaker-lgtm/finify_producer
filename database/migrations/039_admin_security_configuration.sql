BEGIN;

ALTER TABLE public.admin_security_settings
  ADD COLUMN IF NOT EXISTS turnstile_site_key text NULL,
  ADD COLUMN IF NOT EXISTS turnstile_secret_ciphertext text NULL,
  ADD COLUMN IF NOT EXISTS turnstile_secret_iv varchar(32) NULL,
  ADD COLUMN IF NOT EXISTS turnstile_secret_auth_tag varchar(32) NULL,
  ADD COLUMN IF NOT EXISTS mfa_issuer varchar(120) NOT NULL DEFAULT 'Finify Admin';

UPDATE public.admin_security_settings
SET mfa_issuer = COALESCE(NULLIF(mfa_issuer, ''), 'Finify Admin')
WHERE id = 1;

COMMIT;
