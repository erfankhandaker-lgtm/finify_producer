DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='admin_security_settings'
      AND column_name='turnstile_secret_ciphertext'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='admin_security_settings'
      AND column_name='mfa_issuer'
  ) THEN
    RAISE EXCEPTION 'Admin security configuration migration is incomplete';
  END IF;
END $$;
