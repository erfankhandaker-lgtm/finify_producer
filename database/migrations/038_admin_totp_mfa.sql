BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_mfa_profiles (
  user_id bigint PRIMARY KEY REFERENCES public.admin_users(id) ON DELETE CASCADE,
  secret_ciphertext text NULL,
  secret_iv varchar(32) NULL,
  secret_auth_tag varchar(32) NULL,
  enabled boolean NOT NULL DEFAULT false,
  enrolled_at timestamp NULL,
  last_used_counter bigint NULL,
  recovery_pin_hash text NULL,
  recovery_pin_used_at timestamp NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamp NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.admin_mfa_challenges (
  id uuid PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  purpose varchar(32) NOT NULL CHECK (purpose IN ('LOGIN', 'ENROLLMENT', 'RECOVERY_ENROLLMENT')),
  pending_secret_ciphertext text NULL,
  pending_secret_iv varchar(32) NULL,
  pending_secret_auth_tag varchar(32) NULL,
  ip_hash char(64) NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  expires_at timestamp NOT NULL,
  consumed_at timestamp NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS admin_mfa_challenges_expiry_idx
  ON public.admin_mfa_challenges(expires_at, consumed_at);
CREATE INDEX IF NOT EXISTS admin_mfa_challenges_user_idx
  ON public.admin_mfa_challenges(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_mfa_audit (
  id bigserial PRIMARY KEY,
  user_id bigint NULL REFERENCES public.admin_users(id) ON DELETE SET NULL,
  challenge_id uuid NULL,
  action varchar(40) NOT NULL,
  outcome varchar(40) NOT NULL,
  reason text NULL,
  actor_id bigint NULL REFERENCES public.admin_users(id) ON DELETE SET NULL,
  ip_hash char(64) NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS admin_mfa_audit_user_idx
  ON public.admin_mfa_audit(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_security_settings (
  id smallint PRIMARY KEY CHECK (id = 1),
  mfa_required boolean NOT NULL DEFAULT true,
  captcha_enabled boolean NOT NULL DEFAULT true,
  captcha_provider varchar(40) NOT NULL DEFAULT 'CLOUDFLARE_TURNSTILE',
  updated_by bigint NULL REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO public.admin_security_settings (id, mfa_required, captcha_enabled)
VALUES (1, true, true)
ON CONFLICT (id) DO NOTHING;

-- Face portraits are retained, but face authentication is permanently switched off.
UPDATE public.admin_biometric_profiles SET enabled = false, updated_at = CURRENT_TIMESTAMP
WHERE enabled = true;

COMMIT;
