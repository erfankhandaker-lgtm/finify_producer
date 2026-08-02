BEGIN;

CREATE TABLE IF NOT EXISTS public.mr_finify_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  api_key_ciphertext text NULL,
  api_key_iv varchar(32) NULL,
  api_key_auth_tag varchar(32) NULL,
  model varchar(100) NOT NULL DEFAULT 'gpt-5.6-sol',
  rate_limit_per_minute smallint NOT NULL DEFAULT 20
    CHECK (rate_limit_per_minute BETWEEN 1 AND 100),
  updated_by bigint NULL REFERENCES public.admin_users(id),
  updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (api_key_ciphertext IS NULL AND api_key_iv IS NULL AND api_key_auth_tag IS NULL)
    OR
    (api_key_ciphertext IS NOT NULL AND api_key_iv IS NOT NULL AND api_key_auth_tag IS NOT NULL)
  )
);

INSERT INTO public.mr_finify_settings(id,model,rate_limit_per_minute)
VALUES (1,'gpt-5.6-sol',20)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.mr_finify_configuration_audit (
  id bigserial PRIMARY KEY,
  action varchar(32) NOT NULL CHECK (action IN ('UPDATED','API_KEY_REMOVED')),
  model varchar(100) NOT NULL,
  rate_limit_per_minute smallint NOT NULL,
  api_key_configured boolean NOT NULL,
  actor_user_id bigint NOT NULL REFERENCES public.admin_users(id),
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mr_finify_configuration_audit_created
  ON public.mr_finify_configuration_audit(created_at DESC,id DESC);

COMMENT ON COLUMN public.mr_finify_settings.api_key_ciphertext IS
  'AES-256-GCM encrypted OpenAI API credential; never returned by an API.';

COMMIT;
