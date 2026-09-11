BEGIN;

CREATE TABLE onboarding.channel_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  code varchar(40) NOT NULL,
  name varchar(100) NOT NULL,
  description text NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_by varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_ONBOARDING_CHANNEL_DEFINITION_CODE" CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  CONSTRAINT "UQ_ONBOARDING_TENANT_CHANNEL" UNIQUE (tenant_id,code)
);

CREATE TABLE onboarding.channel_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_definition_id uuid NOT NULL REFERENCES onboarding.channel_definitions(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'DRAFT',
  revision integer NOT NULL DEFAULT 1,
  authentication_mode varchar(40) NOT NULL DEFAULT 'PUBLIC_PREAUTH',
  session_timeout_seconds integer NOT NULL DEFAULT 900,
  resume_timeout_seconds integer NOT NULL DEFAULT 604800,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_summary text NULL,
  created_by varchar(100) NOT NULL,
  modified_by varchar(100) NULL,
  submitted_at timestamptz NULL,
  approved_by varchar(100) NULL,
  approved_at timestamptz NULL,
  activated_at timestamptz NULL,
  retired_at timestamptz NULL,
  rejected_by varchar(100) NULL,
  rejection_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_ONBOARDING_CHANNEL_VERSION_STATUS" CHECK (
    status IN ('DRAFT','SUBMITTED','APPROVED','ACTIVE','REJECTED','RETIRED')
  ),
  CONSTRAINT "CK_ONBOARDING_CHANNEL_VERSION_NUMBER" CHECK (version_number > 0),
  CONSTRAINT "CK_ONBOARDING_CHANNEL_VERSION_REVISION" CHECK (revision > 0),
  CONSTRAINT "CK_ONBOARDING_CHANNEL_SESSION_TIMEOUT" CHECK (session_timeout_seconds BETWEEN 60 AND 86400),
  CONSTRAINT "CK_ONBOARDING_CHANNEL_RESUME_TIMEOUT" CHECK (resume_timeout_seconds BETWEEN 300 AND 2592000),
  CONSTRAINT "CK_ONBOARDING_CHANNEL_VERSION_CONFIGURATION" CHECK (jsonb_typeof(configuration)='object'),
  CONSTRAINT "CK_ONBOARDING_CHANNEL_VERSION_CHECKER" CHECK (
    approved_by IS NULL OR approved_by <> COALESCE(modified_by,created_by)
  ),
  CONSTRAINT "UQ_ONBOARDING_CHANNEL_VERSION" UNIQUE (channel_definition_id,version_number)
);

CREATE UNIQUE INDEX "UQ_ONBOARDING_ACTIVE_CHANNEL_VERSION"
  ON onboarding.channel_versions(channel_definition_id) WHERE status='ACTIVE';

CREATE TABLE onboarding.channel_country_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_version_id uuid NOT NULL REFERENCES onboarding.channel_versions(id) ON DELETE CASCADE,
  country_code char(3) NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "CK_ONBOARDING_CHANNEL_COUNTRY" CHECK (country_code ~ '^[A-Z]{3}$'),
  CONSTRAINT "CK_ONBOARDING_CHANNEL_COUNTRY_CONFIGURATION" CHECK (jsonb_typeof(configuration)='object'),
  CONSTRAINT "UQ_ONBOARDING_CHANNEL_COUNTRY" UNIQUE (channel_version_id,country_code)
);

CREATE TABLE onboarding.channel_node_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_version_id uuid NOT NULL REFERENCES onboarding.channel_versions(id) ON DELETE CASCADE,
  node_type varchar(40) NOT NULL REFERENCES onboarding.node_type_catalogue(code) ON DELETE RESTRICT,
  execution_mode varchar(20) NOT NULL,
  component_key varchar(100) NULL,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "CK_ONBOARDING_CHANNEL_EXECUTION_MODE" CHECK (
    execution_mode IN ('DIRECT','HANDOFF_ONLY','SERVER_ONLY','UNSUPPORTED')
  ),
  CONSTRAINT "CK_ONBOARDING_CHANNEL_CAPABILITY_CONFIGURATION" CHECK (jsonb_typeof(configuration)='object'),
  CONSTRAINT "UQ_ONBOARDING_CHANNEL_NODE_CAPABILITY" UNIQUE (channel_version_id,node_type)
);

CREATE TABLE onboarding.channel_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_definition_id uuid NOT NULL REFERENCES onboarding.channel_definitions(id) ON DELETE RESTRICT,
  client_id varchar(100) NOT NULL,
  credential_hash char(64) NULL,
  credential_reference varchar(300) NULL,
  authentication_mode varchar(40) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz NULL,
  created_by varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_ONBOARDING_CHANNEL_CLIENT_CREDENTIAL" CHECK (
    credential_hash IS NOT NULL OR credential_reference IS NOT NULL
  ),
  CONSTRAINT "CK_ONBOARDING_CHANNEL_CLIENT_HASH" CHECK (
    credential_hash IS NULL OR credential_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "UQ_ONBOARDING_CHANNEL_CLIENT" UNIQUE (client_id)
);

CREATE TABLE onboarding.channel_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES onboarding.journey_instances(id) ON DELETE RESTRICT,
  channel_version_id uuid NOT NULL REFERENCES onboarding.channel_versions(id) ON DELETE RESTRICT,
  token_hash char(64) NOT NULL UNIQUE,
  status varchar(16) NOT NULL DEFAULT 'ACTIVE',
  client_id varchar(100) NULL,
  started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  CONSTRAINT "CK_ONBOARDING_CHANNEL_SESSION_STATUS" CHECK (status IN ('ACTIVE','CONSUMED','REVOKED','EXPIRED')),
  CONSTRAINT "CK_ONBOARDING_CHANNEL_SESSION_HASH" CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE TABLE onboarding.channel_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES onboarding.journey_instances(id) ON DELETE RESTRICT,
  source_channel_version_id uuid NOT NULL REFERENCES onboarding.channel_versions(id) ON DELETE RESTRICT,
  target_channel_version_id uuid NOT NULL REFERENCES onboarding.channel_versions(id) ON DELETE RESTRICT,
  source_node_id uuid NOT NULL REFERENCES onboarding.journey_nodes(id) ON DELETE RESTRICT,
  token_hash char(64) NOT NULL UNIQUE,
  idempotency_key varchar(120) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'PENDING',
  expires_at timestamptz NOT NULL,
  created_by varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consumed_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  CONSTRAINT "CK_ONBOARDING_CHANNEL_HANDOFF_STATUS" CHECK (
    status IN ('PENDING','CONSUMED','CANCELLED','EXPIRED')
  ),
  CONSTRAINT "CK_ONBOARDING_CHANNEL_HANDOFF_HASH" CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "UQ_ONBOARDING_CHANNEL_HANDOFF_IDEMPOTENCY" UNIQUE (instance_id,idempotency_key)
);

CREATE TABLE onboarding.channel_audit_events (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  channel_definition_id uuid NOT NULL REFERENCES onboarding.channel_definitions(id) ON DELETE RESTRICT,
  channel_version_id uuid NULL REFERENCES onboarding.channel_versions(id) ON DELETE RESTRICT,
  action varchar(40) NOT NULL,
  previous_state jsonb NULL,
  new_state jsonb NOT NULL,
  actor_id varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_ONBOARDING_CHANNEL_AUDIT_STATE" CHECK (jsonb_typeof(new_state)='object')
);

ALTER TABLE onboarding.journey_scopes
  ADD COLUMN channel_definition_id uuid NULL REFERENCES onboarding.channel_definitions(id) ON DELETE RESTRICT,
  ADD COLUMN channel_version_id uuid NULL REFERENCES onboarding.channel_versions(id) ON DELETE RESTRICT;

ALTER TABLE onboarding.journey_instances
  ADD COLUMN source_channel_definition_id uuid NULL REFERENCES onboarding.channel_definitions(id) ON DELETE RESTRICT,
  ADD COLUMN source_channel_version_id uuid NULL REFERENCES onboarding.channel_versions(id) ON DELETE RESTRICT,
  ADD COLUMN current_channel_definition_id uuid NULL REFERENCES onboarding.channel_definitions(id) ON DELETE RESTRICT,
  ADD COLUMN current_channel_version_id uuid NULL REFERENCES onboarding.channel_versions(id) ON DELETE RESTRICT;

INSERT INTO onboarding.channel_definitions(tenant_id,code,name,description,is_enabled,created_by)
SELECT DISTINCT definition.tenant_id,channel.code,channel.name,
       'Migrated from the platform channel catalogue',channel.is_active,'migration'
FROM onboarding.journey_definitions definition
JOIN onboarding.journey_versions version ON version.journey_definition_id=definition.id
JOIN onboarding.journey_scopes scope ON scope.journey_version_id=version.id
JOIN onboarding.channels channel ON channel.code=scope.channel_code
ON CONFLICT(tenant_id,code) DO NOTHING;

INSERT INTO onboarding.channel_versions(
  channel_definition_id,version_number,status,authentication_mode,configuration,
  created_by,modified_by,approved_by,approved_at,activated_at
)
SELECT definition.id,1,'ACTIVE','PUBLIC_PREAUTH',channel.capabilities,
       'migration','migration','migration-checker',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM onboarding.channel_definitions definition
JOIN onboarding.channels channel ON channel.code=definition.code
WHERE NOT EXISTS (
  SELECT 1 FROM onboarding.channel_versions version
  WHERE version.channel_definition_id=definition.id
);

INSERT INTO onboarding.channel_country_scopes(channel_version_id,country_code)
SELECT DISTINCT channel_version.id,scope.country_code
FROM onboarding.journey_scopes scope
JOIN onboarding.journey_versions journey_version ON journey_version.id=scope.journey_version_id
JOIN onboarding.journey_definitions journey ON journey.id=journey_version.journey_definition_id
JOIN onboarding.channel_definitions channel_definition
  ON channel_definition.tenant_id=journey.tenant_id AND channel_definition.code=scope.channel_code
JOIN onboarding.channel_versions channel_version
  ON channel_version.channel_definition_id=channel_definition.id AND channel_version.status='ACTIVE'
ON CONFLICT(channel_version_id,country_code) DO NOTHING;

INSERT INTO onboarding.channel_node_capabilities(channel_version_id,node_type,execution_mode,component_key)
SELECT version.id,node.code,
       CASE
         WHEN node.code IN ('WALLET_ALLOCATION','CREDIT_SCORE','CREDIT_POLICY','LIMIT_ALLOCATION','DECISION') THEN 'SERVER_ONLY'
         WHEN definition.code='USSD' AND node.code IN ('FORM','KYC') THEN 'HANDOFF_ONLY'
         ELSE 'DIRECT'
       END,
       CASE WHEN node.code IN ('START','END','WALLET_ALLOCATION','CREDIT_SCORE','CREDIT_POLICY','LIMIT_ALLOCATION','DECISION')
            THEN NULL ELSE lower(node.code) END
FROM onboarding.channel_versions version
JOIN onboarding.channel_definitions definition ON definition.id=version.channel_definition_id
CROSS JOIN onboarding.node_type_catalogue node
ON CONFLICT(channel_version_id,node_type) DO NOTHING;

UPDATE onboarding.journey_scopes scope
SET channel_definition_id=channel_definition.id,channel_version_id=channel_version.id
FROM onboarding.journey_versions journey_version
JOIN onboarding.journey_definitions journey ON journey.id=journey_version.journey_definition_id
JOIN onboarding.channel_definitions channel_definition ON channel_definition.tenant_id=journey.tenant_id
JOIN onboarding.channel_versions channel_version
  ON channel_version.channel_definition_id=channel_definition.id AND channel_version.status='ACTIVE'
WHERE scope.journey_version_id=journey_version.id AND channel_definition.code=scope.channel_code;

UPDATE onboarding.journey_instances instance
SET source_channel_definition_id=source_definition.id,
    source_channel_version_id=source_version.id,
    current_channel_definition_id=current_definition.id,
    current_channel_version_id=current_version.id
FROM onboarding.channel_definitions source_definition
JOIN onboarding.channel_versions source_version
  ON source_version.channel_definition_id=source_definition.id AND source_version.status='ACTIVE'
JOIN onboarding.channel_definitions current_definition
  ON current_definition.tenant_id=source_definition.tenant_id
JOIN onboarding.channel_versions current_version
  ON current_version.channel_definition_id=current_definition.id AND current_version.status='ACTIVE'
WHERE source_definition.tenant_id=instance.tenant_id
  AND source_definition.code=instance.source_channel_code
  AND current_definition.code=instance.current_channel_code;

CREATE INDEX "IDX_ONBOARDING_CHANNEL_LOOKUP"
  ON onboarding.channel_definitions(tenant_id,code,is_enabled);
CREATE INDEX "IDX_ONBOARDING_CHANNEL_COUNTRY_LOOKUP"
  ON onboarding.channel_country_scopes(country_code,channel_version_id) WHERE is_enabled;
CREATE INDEX "IDX_ONBOARDING_CHANNEL_HANDOFF_PENDING"
  ON onboarding.channel_handoffs(instance_id,expires_at) WHERE status='PENDING';
CREATE INDEX "IDX_ONBOARDING_CHANNEL_SESSION_INSTANCE"
  ON onboarding.channel_sessions(instance_id,status,expires_at DESC);

INSERT INTO public.admin_permissions(code,resource,action,description) VALUES
  ('onboarding_channels.read','onboarding_channels','read','View governed onboarding channels'),
  ('onboarding_channels.make','onboarding_channels','make','Create and submit onboarding channel versions'),
  ('onboarding_channels.check','onboarding_channels','check','Approve, activate and retire onboarding channel versions')
ON CONFLICT(code) DO UPDATE SET
  resource=EXCLUDED.resource,action=EXCLUDED.action,description=EXCLUDED.description;

INSERT INTO public.admin_role_permissions(role_id,permission_id)
SELECT role.id,permission.id
FROM public.admin_roles role
CROSS JOIN public.admin_permissions permission
WHERE role.code='super_admin' AND permission.code LIKE 'onboarding_channels.%'
ON CONFLICT DO NOTHING;

COMMIT;
