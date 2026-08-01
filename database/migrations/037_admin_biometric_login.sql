BEGIN;
CREATE TABLE IF NOT EXISTS public.admin_biometric_profiles (
  user_id bigint PRIMARY KEY REFERENCES public.admin_users(id) ON DELETE CASCADE,
  bucket_name text NOT NULL, object_key text NOT NULL, content_type varchar(100) NOT NULL,
  sha256 char(64) NOT NULL, enabled boolean NOT NULL DEFAULT false,
  match_threshold numeric(5,2) NOT NULL DEFAULT 45.00 CHECK (match_threshold BETWEEN 40 AND 95),
  failed_attempts integer NOT NULL DEFAULT 0, locked_until timestamp NULL,
  enrolled_by bigint NULL REFERENCES public.admin_users(id), consent_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_verified_at timestamp NULL, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS public.admin_biometric_challenges (
  id uuid PRIMARY KEY, user_id bigint NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  ip_hash char(64) NOT NULL, expires_at timestamp NOT NULL, consumed_at timestamp NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS admin_biometric_challenges_expiry_idx ON public.admin_biometric_challenges(expires_at,consumed_at);
CREATE INDEX IF NOT EXISTS admin_biometric_challenges_ip_idx ON public.admin_biometric_challenges(ip_hash,created_at DESC);
CREATE TABLE IF NOT EXISTS public.admin_biometric_audit (
  id bigserial PRIMARY KEY, user_id bigint NULL REFERENCES public.admin_users(id) ON DELETE SET NULL,
  challenge_id uuid NULL, action varchar(40) NOT NULL, outcome varchar(40) NOT NULL,
  match_score numeric(6,3) NULL, reason text NULL,
  actor_id bigint NULL REFERENCES public.admin_users(id) ON DELETE SET NULL,
  ip_hash char(64) NULL, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS admin_biometric_audit_user_idx ON public.admin_biometric_audit(user_id,created_at DESC);
COMMIT;
