BEGIN;

CREATE TABLE IF NOT EXISTS public.reference_data_change_requests (
  id bigserial PRIMARY KEY,
  resource_type varchar(32) NOT NULL,
  resource_key varchar(100) NOT NULL,
  action varchar(16) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'PENDING',
  base_snapshot jsonb NULL,
  proposed_snapshot jsonb NOT NULL,
  maker_user_id bigint NOT NULL,
  maker_username varchar(100) NOT NULL,
  maker_comment text NULL,
  checker_user_id bigint NULL,
  checker_username varchar(100) NULL,
  checker_comment text NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at timestamp without time zone NULL,
  CONSTRAINT "FK_REFERENCE_CHANGE_MAKER"
    FOREIGN KEY (maker_user_id) REFERENCES public.admin_users(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "FK_REFERENCE_CHANGE_CHECKER"
    FOREIGN KEY (checker_user_id) REFERENCES public.admin_users(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "CK_REFERENCE_CHANGE_RESOURCE"
    CHECK (resource_type IN ('KEYWORD', 'WALLET_TYPE')),
  CONSTRAINT "CK_REFERENCE_CHANGE_ACTION"
    CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
  CONSTRAINT "CK_REFERENCE_CHANGE_STATUS"
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  CONSTRAINT "CK_REFERENCE_CHANGE_DIFFERENT_CHECKER"
    CHECK (checker_user_id IS NULL OR checker_user_id <> maker_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_REFERENCE_CHANGE_PENDING"
  ON public.reference_data_change_requests (resource_type, resource_key)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS "IDX_REFERENCE_CHANGE_QUEUE"
  ON public.reference_data_change_requests (status, resource_type, created_at);

CREATE INDEX IF NOT EXISTS "IDX_REFERENCE_CHANGE_MAKER"
  ON public.reference_data_change_requests (maker_user_id, created_at DESC);

INSERT INTO public.admin_permissions (code, resource, action, description) VALUES
  ('reference_data.read', 'reference_data', 'read', 'View keyword, wallet type, and maker-checker history'),
  ('reference_data.make', 'reference_data', 'make', 'Submit keyword and wallet type changes'),
  ('reference_data.check', 'reference_data', 'check', 'Approve or reject keyword and wallet type changes')
ON CONFLICT (code) DO UPDATE SET
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description;

INSERT INTO public.admin_role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM public.admin_roles role
CROSS JOIN public.admin_permissions permission
WHERE role.code = 'super_admin'
  AND permission.code IN ('reference_data.read', 'reference_data.make', 'reference_data.check')
ON CONFLICT DO NOTHING;

COMMIT;
