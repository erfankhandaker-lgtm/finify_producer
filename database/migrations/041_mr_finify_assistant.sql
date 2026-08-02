BEGIN;

CREATE TABLE IF NOT EXISTS public.mr_finify_interactions (
  id bigserial PRIMARY KEY,
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  admin_user_id bigint NOT NULL REFERENCES public.admin_users(id),
  username varchar(100) NOT NULL,
  access_scope varchar(32) NOT NULL,
  active_module varchar(64) NULL,
  model varchar(100) NULL,
  user_message text NOT NULL,
  assistant_message text NULL,
  tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(20) NOT NULL,
  error_code varchar(100) NULL,
  input_tokens integer NULL,
  output_tokens integer NULL,
  duration_ms integer NOT NULL DEFAULT 0,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_mr_finify_interaction_status
    CHECK (status IN ('COMPLETED','UNCONFIGURED','FAILED','RATE_LIMITED')),
  CONSTRAINT ck_mr_finify_interaction_scope
    CHECK (access_scope IN ('SUPERADMIN','ROLE_SCOPED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_mr_finify_interactions_request
  ON public.mr_finify_interactions(request_id);
CREATE INDEX IF NOT EXISTS ix_mr_finify_interactions_user_date
  ON public.mr_finify_interactions(admin_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_mr_finify_interactions_status_date
  ON public.mr_finify_interactions(status,created_at DESC);

INSERT INTO public.admin_permissions(code,resource,action,description) VALUES
  ('assistant.use','assistant','use','Use Mr. Finify within assigned administrative permissions'),
  ('assistant.audit','assistant','audit','Review Mr. Finify interaction audit records'),
  ('assistant.configure','assistant','configure','View and manage Mr. Finify runtime configuration')
ON CONFLICT(code) DO UPDATE SET
  resource=EXCLUDED.resource,action=EXCLUDED.action,description=EXCLUDED.description;

-- Existing administrators can use the assistant, but the backend still scopes
-- every available tool to their current role permissions.
INSERT INTO public.admin_role_permissions(role_id,permission_id)
SELECT role.id,permission.id
FROM public.admin_roles role
JOIN public.admin_permissions permission ON permission.code='assistant.use'
ON CONFLICT DO NOTHING;

INSERT INTO public.admin_role_permissions(role_id,permission_id)
SELECT role.id,permission.id
FROM public.admin_roles role
CROSS JOIN public.admin_permissions permission
WHERE role.code='super_admin'
  AND permission.code IN ('assistant.audit','assistant.configure')
ON CONFLICT DO NOTHING;

COMMIT;
