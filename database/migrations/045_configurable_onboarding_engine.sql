BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS customer_registry;
CREATE SCHEMA IF NOT EXISTS onboarding;

CREATE TABLE customer_registry.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  home_country_code char(3) NOT NULL,
  customer_type varchar(32) NOT NULL DEFAULT 'INDIVIDUAL',
  status varchar(24) NOT NULL DEFAULT 'PROSPECT',
  legacy_profile_msisdn bigint NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_CUSTOMER_REGISTRY_COUNTRY" CHECK (home_country_code ~ '^[A-Z]{3}$'),
  CONSTRAINT "CK_CUSTOMER_REGISTRY_STATUS" CHECK (
    status IN ('PROSPECT','ONBOARDING','ACTIVE','SUSPENDED','BLOCKED','CLOSED')
  ),
  CONSTRAINT "UQ_CUSTOMER_REGISTRY_LEGACY" UNIQUE (tenant_id,legacy_profile_msisdn),
  CONSTRAINT "UQ_CUSTOMER_REGISTRY_ID_TENANT" UNIQUE (id,tenant_id)
);

CREATE INDEX "IDX_CUSTOMER_REGISTRY_TENANT_STATUS"
  ON customer_registry.customers(tenant_id,status,created_at DESC);

CREATE TABLE customer_registry.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES customer_registry.customers(id) ON DELETE RESTRICT,
  contact_type varchar(16) NOT NULL,
  value_hash char(64) NOT NULL,
  value_ciphertext bytea NULL,
  masked_value varchar(100) NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_CUSTOMER_CONTACT_TYPE" CHECK (contact_type IN ('PHONE','EMAIL')),
  CONSTRAINT "CK_CUSTOMER_CONTACT_HASH" CHECK (value_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "UQ_CUSTOMER_CONTACT_VALUE" UNIQUE (tenant_id,contact_type,value_hash),
  CONSTRAINT "FK_CUSTOMER_CONTACT_TENANT" FOREIGN KEY (customer_id,tenant_id)
    REFERENCES customer_registry.customers(id,tenant_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "UQ_CUSTOMER_PRIMARY_CONTACT"
  ON customer_registry.contacts(tenant_id,customer_id,contact_type)
  WHERE is_primary;

CREATE TABLE customer_registry.identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES customer_registry.customers(id) ON DELETE RESTRICT,
  identifier_type varchar(40) NOT NULL,
  issuing_country char(3) NOT NULL,
  value_hash char(64) NOT NULL,
  value_ciphertext bytea NULL,
  masked_value varchar(100) NOT NULL,
  verified_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_CUSTOMER_IDENTIFIER_COUNTRY" CHECK (issuing_country ~ '^[A-Z]{3}$'),
  CONSTRAINT "CK_CUSTOMER_IDENTIFIER_HASH" CHECK (value_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "UQ_CUSTOMER_IDENTIFIER" UNIQUE (
    tenant_id,identifier_type,issuing_country,value_hash
  ),
  CONSTRAINT "FK_CUSTOMER_IDENTIFIER_TENANT" FOREIGN KEY (customer_id,tenant_id)
    REFERENCES customer_registry.customers(id,tenant_id) ON DELETE RESTRICT
);

ALTER TABLE kyc.cases
  ADD COLUMN customer_id uuid NULL
    REFERENCES customer_registry.customers(id) ON DELETE RESTRICT,
  ALTER COLUMN customer_msisdn DROP NOT NULL;

ALTER TABLE kyc.cases ADD CONSTRAINT "CK_KYC_CUSTOMER_PRINCIPAL"
  CHECK (customer_id IS NOT NULL OR customer_msisdn IS NOT NULL);

CREATE INDEX "IDX_KYC_CASE_CUSTOMER_UUID"
  ON kyc.cases(customer_id,created_at DESC) WHERE customer_id IS NOT NULL;

CREATE TABLE onboarding.channels (
  code varchar(40) PRIMARY KEY,
  name varchar(100) NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_ONBOARDING_CHANNEL_CODE" CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  CONSTRAINT "CK_ONBOARDING_CHANNEL_CAPABILITIES" CHECK (jsonb_typeof(capabilities)='object')
);

INSERT INTO onboarding.channels(code,name,capabilities,created_by) VALUES
  ('MOBILE_APP','Mobile application','{"camera":true,"fileUpload":true,"redirect":true}'::jsonb,'migration'),
  ('WEB','Web','{"camera":true,"fileUpload":true,"redirect":true}'::jsonb,'migration'),
  ('USSD','USSD','{"camera":false,"fileUpload":false,"redirect":false}'::jsonb,'migration'),
  ('WHATSAPP','WhatsApp','{"camera":true,"fileUpload":true,"redirect":true}'::jsonb,'migration'),
  ('AGENT','Agent assisted','{"camera":true,"fileUpload":true,"redirect":true}'::jsonb,'migration'),
  ('API','API','{"camera":false,"fileUpload":true,"redirect":true}'::jsonb,'migration')
ON CONFLICT(code) DO NOTHING;

CREATE TABLE onboarding.journey_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  code varchar(64) NOT NULL,
  name varchar(160) NOT NULL,
  description text NULL,
  created_by varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_ONBOARDING_JOURNEY_CODE" CHECK (code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  CONSTRAINT "UQ_ONBOARDING_JOURNEY_CODE" UNIQUE (tenant_id,code)
);

CREATE TABLE onboarding.journey_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_definition_id uuid NOT NULL
    REFERENCES onboarding.journey_definitions(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'DRAFT',
  revision integer NOT NULL DEFAULT 1,
  change_summary text NULL,
  created_by varchar(100) NOT NULL,
  modified_by varchar(100) NULL,
  approved_by varchar(100) NULL,
  rejected_by varchar(100) NULL,
  rejection_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at timestamptz NULL,
  approved_at timestamptz NULL,
  activated_at timestamptz NULL,
  retired_at timestamptz NULL,
  CONSTRAINT "CK_ONBOARDING_VERSION_STATUS" CHECK (
    status IN ('DRAFT','SUBMITTED','APPROVED','ACTIVE','REJECTED','RETIRED')
  ),
  CONSTRAINT "CK_ONBOARDING_VERSION_NUMBER" CHECK (version_number > 0),
  CONSTRAINT "CK_ONBOARDING_VERSION_REVISION" CHECK (revision > 0),
  CONSTRAINT "CK_ONBOARDING_VERSION_CHECKER" CHECK (
    approved_by IS NULL OR approved_by <> COALESCE(modified_by,created_by)
  ),
  CONSTRAINT "UQ_ONBOARDING_JOURNEY_VERSION" UNIQUE (journey_definition_id,version_number)
);

CREATE INDEX "IDX_ONBOARDING_VERSION_STATUS"
  ON onboarding.journey_versions(status,updated_at DESC);

CREATE TABLE onboarding.journey_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_version_id uuid NOT NULL
    REFERENCES onboarding.journey_versions(id) ON DELETE CASCADE,
  country_code char(3) NOT NULL,
  channel_code varchar(40) NOT NULL REFERENCES onboarding.channels(code) ON DELETE RESTRICT,
  customer_type varchar(32) NOT NULL DEFAULT 'INDIVIDUAL',
  priority integer NOT NULL DEFAULT 100,
  effective_from timestamptz NULL,
  effective_to timestamptz NULL,
  CONSTRAINT "CK_ONBOARDING_SCOPE_COUNTRY" CHECK (country_code ~ '^[A-Z]{3}$'),
  CONSTRAINT "CK_ONBOARDING_SCOPE_PRIORITY" CHECK (priority BETWEEN 1 AND 10000),
  CONSTRAINT "CK_ONBOARDING_SCOPE_PERIOD" CHECK (
    effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from
  ),
  CONSTRAINT "UQ_ONBOARDING_VERSION_SCOPE" UNIQUE (
    journey_version_id,country_code,channel_code,customer_type
  )
);

CREATE INDEX "IDX_ONBOARDING_SCOPE_LOOKUP"
  ON onboarding.journey_scopes(country_code,channel_code,customer_type,priority);

CREATE TABLE onboarding.node_type_catalogue (
  code varchar(40) PRIMARY KEY,
  name varchar(100) NOT NULL,
  category varchar(40) NOT NULL,
  configuration_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  sensitive boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT "CK_ONBOARDING_NODE_SCHEMA" CHECK (jsonb_typeof(configuration_schema)='object')
);

INSERT INTO onboarding.node_type_catalogue(code,name,category,sensitive) VALUES
  ('START','Start','CONTROL',false),
  ('END','End','CONTROL',false),
  ('PHONE_CAPTURE','Phone capture','IDENTITY',true),
  ('OTP_VERIFICATION','OTP verification','SECURITY',true),
  ('PIN_SETUP','PIN setup','SECURITY',true),
  ('CONSENT','Consent','COMPLIANCE',true),
  ('FORM','Configurable form','DATA',true),
  ('KYC','FINIFY KYC','COMPLIANCE',true),
  ('WALLET_ALLOCATION','Wallet allocation','ACTION',false),
  ('CREDIT_SCORE','Credit score','CREDIT',false),
  ('CREDIT_POLICY','Credit policy and decision tree','CREDIT',false),
  ('LIMIT_ALLOCATION','Limit allocation','CREDIT',false),
  ('DECISION','Decision branch','CONTROL',false),
  ('CHANNEL_HANDOFF','Channel handoff','CONTROL',false),
  ('MANUAL_REVIEW','Manual review','CONTROL',true)
ON CONFLICT(code) DO NOTHING;

CREATE TABLE onboarding.journey_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_version_id uuid NOT NULL
    REFERENCES onboarding.journey_versions(id) ON DELETE CASCADE,
  node_key varchar(80) NOT NULL,
  node_type varchar(40) NOT NULL
    REFERENCES onboarding.node_type_catalogue(code) ON DELETE RESTRICT,
  name varchar(160) NOT NULL,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  position_x numeric(12,2) NOT NULL DEFAULT 0,
  position_y numeric(12,2) NOT NULL DEFAULT 0,
  is_entry boolean NOT NULL DEFAULT false,
  CONSTRAINT "CK_ONBOARDING_NODE_KEY" CHECK (node_key ~ '^[A-Za-z][A-Za-z0-9_-]{0,79}$'),
  CONSTRAINT "CK_ONBOARDING_NODE_CONFIG" CHECK (jsonb_typeof(configuration)='object'),
  CONSTRAINT "UQ_ONBOARDING_NODE_KEY" UNIQUE (journey_version_id,node_key),
  CONSTRAINT "UQ_ONBOARDING_NODE_ID_VERSION" UNIQUE (id,journey_version_id)
);

CREATE UNIQUE INDEX "UQ_ONBOARDING_ENTRY_NODE"
  ON onboarding.journey_nodes(journey_version_id) WHERE is_entry;

CREATE TABLE onboarding.journey_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_version_id uuid NOT NULL
    REFERENCES onboarding.journey_versions(id) ON DELETE CASCADE,
  from_node_id uuid NOT NULL,
  to_node_id uuid NOT NULL,
  outcome_code varchar(64) NOT NULL DEFAULT 'SUCCESS',
  priority integer NOT NULL DEFAULT 100,
  condition_expression jsonb NULL,
  CONSTRAINT "CK_ONBOARDING_TRANSITION_PRIORITY" CHECK (priority BETWEEN 1 AND 10000),
  CONSTRAINT "CK_ONBOARDING_TRANSITION_CONDITION" CHECK (
    condition_expression IS NULL OR jsonb_typeof(condition_expression)='object'
  ),
  CONSTRAINT "FK_ONBOARDING_TRANSITION_FROM" FOREIGN KEY (from_node_id,journey_version_id)
    REFERENCES onboarding.journey_nodes(id,journey_version_id) ON DELETE CASCADE,
  CONSTRAINT "FK_ONBOARDING_TRANSITION_TO" FOREIGN KEY (to_node_id,journey_version_id)
    REFERENCES onboarding.journey_nodes(id,journey_version_id) ON DELETE CASCADE,
  CONSTRAINT "UQ_ONBOARDING_TRANSITION" UNIQUE (
    journey_version_id,from_node_id,outcome_code,priority
  ),
  CONSTRAINT "CK_ONBOARDING_TRANSITION_LOOP" CHECK (from_node_id <> to_node_id)
);

CREATE INDEX "IDX_ONBOARDING_TRANSITION_FROM"
  ON onboarding.journey_transitions(journey_version_id,from_node_id,priority);

CREATE TABLE onboarding.reason_codes (
  code varchar(80) PRIMARY KEY,
  category varchar(32) NOT NULL,
  internal_message text NOT NULL,
  customer_message text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_ONBOARDING_REASON_CATEGORY" CHECK (
    category IN ('BUSINESS_REJECTION','KYC_REJECTION','TECHNICAL_FAILURE','MANUAL_REVIEW')
  )
);

CREATE TABLE onboarding.otp_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  country_code char(3) NOT NULL,
  channel_code varchar(40) NOT NULL REFERENCES onboarding.channels(code),
  expiry_seconds integer NOT NULL DEFAULT 300,
  maximum_attempts integer NOT NULL DEFAULT 5,
  resend_seconds integer NOT NULL DEFAULT 60,
  maximum_sends_per_hour integer NOT NULL DEFAULT 5,
  is_active boolean NOT NULL DEFAULT true,
  created_by varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_ONBOARDING_OTP_EXPIRY" CHECK (expiry_seconds BETWEEN 30 AND 1800),
  CONSTRAINT "CK_ONBOARDING_OTP_ATTEMPTS" CHECK (maximum_attempts BETWEEN 1 AND 20),
  CONSTRAINT "CK_ONBOARDING_OTP_RESEND" CHECK (resend_seconds BETWEEN 10 AND 600),
  CONSTRAINT "CK_ONBOARDING_OTP_SENDS" CHECK (maximum_sends_per_hour BETWEEN 1 AND 50),
  CONSTRAINT "UQ_ONBOARDING_OTP_POLICY" UNIQUE (tenant_id,country_code,channel_code)
);

CREATE TABLE onboarding.journey_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES customer_registry.customers(id) ON DELETE RESTRICT,
  journey_version_id uuid NOT NULL REFERENCES onboarding.journey_versions(id) ON DELETE RESTRICT,
  current_node_id uuid NULL,
  source_channel_code varchar(40) NOT NULL REFERENCES onboarding.channels(code),
  current_channel_code varchar(40) NOT NULL REFERENCES onboarding.channels(code),
  status varchar(24) NOT NULL DEFAULT 'IN_PROGRESS',
  resume_token_hash char(64) NOT NULL UNIQUE,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamptz NULL,
  expires_at timestamptz NOT NULL,
  CONSTRAINT "FK_ONBOARDING_INSTANCE_NODE" FOREIGN KEY (current_node_id,journey_version_id)
    REFERENCES onboarding.journey_nodes(id,journey_version_id) ON DELETE RESTRICT,
  CONSTRAINT "CK_ONBOARDING_INSTANCE_STATUS" CHECK (
    status IN ('IN_PROGRESS','WAITING_EXTERNAL','MANUAL_REVIEW','COMPLETED','REJECTED','CANCELLED','EXPIRED','FAILED')
  ),
  CONSTRAINT "CK_ONBOARDING_INSTANCE_CONTEXT" CHECK (jsonb_typeof(context)='object'),
  CONSTRAINT "CK_ONBOARDING_INSTANCE_EXPIRY" CHECK (expires_at > started_at)
);

ALTER TABLE onboarding.journey_instances ADD CONSTRAINT "FK_ONBOARDING_INSTANCE_TENANT"
  FOREIGN KEY (customer_id,tenant_id)
  REFERENCES customer_registry.customers(id,tenant_id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX "UQ_ONBOARDING_ACTIVE_CUSTOMER_INSTANCE"
  ON onboarding.journey_instances(tenant_id,customer_id)
  WHERE status IN ('IN_PROGRESS','WAITING_EXTERNAL','MANUAL_REVIEW');

CREATE INDEX "IDX_ONBOARDING_INSTANCE_OPERATIONS"
  ON onboarding.journey_instances(tenant_id,status,updated_at DESC);

CREATE TABLE onboarding.step_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES onboarding.journey_instances(id) ON DELETE RESTRICT,
  node_id uuid NOT NULL REFERENCES onboarding.journey_nodes(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'STARTED',
  idempotency_key varchar(120) NULL,
  input_hash char(64) NULL,
  output jsonb NULL,
  error_code varchar(100) NULL,
  started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamptz NULL,
  CONSTRAINT "CK_ONBOARDING_STEP_STATUS" CHECK (
    status IN ('STARTED','SUCCEEDED','FAILED','WAITING','SKIPPED')
  ),
  CONSTRAINT "UQ_ONBOARDING_STEP_ATTEMPT" UNIQUE (instance_id,node_id,attempt_number),
  CONSTRAINT "UQ_ONBOARDING_STEP_IDEMPOTENCY" UNIQUE (instance_id,idempotency_key)
);

CREATE TABLE onboarding.journey_events (
  id bigserial PRIMARY KEY,
  instance_id uuid NOT NULL REFERENCES onboarding.journey_instances(id) ON DELETE RESTRICT,
  event_type varchar(80) NOT NULL,
  node_id uuid NULL REFERENCES onboarding.journey_nodes(id) ON DELETE RESTRICT,
  actor_type varchar(24) NOT NULL,
  actor_id varchar(120) NULL,
  correlation_id varchar(120) NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_ONBOARDING_EVENT_ACTOR" CHECK (
    actor_type IN ('CUSTOMER','ADMIN','SYSTEM','EXTERNAL_SERVICE')
  ),
  CONSTRAINT "CK_ONBOARDING_EVENT_PAYLOAD" CHECK (jsonb_typeof(payload)='object')
);

CREATE INDEX "IDX_ONBOARDING_EVENT_INSTANCE"
  ON onboarding.journey_events(instance_id,created_at,id);

CREATE TABLE onboarding.otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES onboarding.journey_instances(id) ON DELETE RESTRICT,
  contact_id uuid NOT NULL REFERENCES customer_registry.contacts(id) ON DELETE RESTRICT,
  policy_id uuid NOT NULL REFERENCES onboarding.otp_policies(id) ON DELETE RESTRICT,
  secret_hash char(64) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  attempt_count integer NOT NULL DEFAULT 0,
  send_count integer NOT NULL DEFAULT 1,
  provider_reference varchar(160) NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz NULL,
  CONSTRAINT "CK_ONBOARDING_OTP_STATUS" CHECK (
    status IN ('PENDING','VERIFIED','LOCKED','EXPIRED','CANCELLED')
  ),
  CONSTRAINT "CK_ONBOARDING_OTP_SECRET_HASH" CHECK (secret_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "IDX_ONBOARDING_OTP_INSTANCE"
  ON onboarding.otp_challenges(instance_id,status,created_at DESC);

CREATE TABLE onboarding.external_call_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES onboarding.journey_instances(id) ON DELETE RESTRICT,
  node_id uuid NULL REFERENCES onboarding.journey_nodes(id) ON DELETE RESTRICT,
  service_code varchar(60) NOT NULL,
  operation_code varchar(80) NOT NULL,
  idempotency_key varchar(120) NOT NULL,
  attempt_number integer NOT NULL DEFAULT 1,
  status varchar(24) NOT NULL DEFAULT 'PENDING',
  request_hash char(64) NULL,
  response_reference varchar(160) NULL,
  error_code varchar(100) NULL,
  next_retry_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamptz NULL,
  CONSTRAINT "CK_ONBOARDING_EXTERNAL_STATUS" CHECK (
    status IN ('PENDING','SUCCEEDED','RETRYABLE_FAILURE','PERMANENT_FAILURE')
  ),
  CONSTRAINT "UQ_ONBOARDING_EXTERNAL_ATTEMPT" UNIQUE (
    instance_id,service_code,operation_code,idempotency_key,attempt_number
  )
);

CREATE TABLE onboarding.kyc_links (
  instance_id uuid PRIMARY KEY REFERENCES onboarding.journey_instances(id) ON DELETE RESTRICT,
  kyc_case_id uuid NOT NULL REFERENCES kyc.cases(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(kyc_case_id)
);

CREATE TABLE onboarding.wallet_allocation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES onboarding.journey_instances(id) ON DELETE RESTRICT,
  wallet_type integer NOT NULL,
  currency char(3) NOT NULL,
  pricing_plan_code varchar(100) NULL,
  status varchar(24) NOT NULL DEFAULT 'PENDING',
  wallet_reference varchar(160) NULL,
  idempotency_key varchar(120) NOT NULL,
  error_code varchar(100) NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamptz NULL,
  CONSTRAINT "CK_ONBOARDING_WALLET_CURRENCY" CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT "CK_ONBOARDING_WALLET_STATUS" CHECK (
    status IN ('PENDING','SUCCEEDED','FAILED','COMPENSATION_REQUIRED','COMPENSATED')
  ),
  CONSTRAINT "UQ_ONBOARDING_WALLET_REQUEST" UNIQUE (instance_id,idempotency_key)
);

CREATE TABLE onboarding.credit_links (
  instance_id uuid PRIMARY KEY REFERENCES onboarding.journey_instances(id) ON DELETE RESTRICT,
  score_snapshot_id bigint NULL REFERENCES public.credit_ai_score_snapshots(id) ON DELETE RESTRICT,
  decision_execution_id uuid NULL REFERENCES public.credit_rule_executions(id) ON DELETE RESTRICT,
  facility_reference varchar(160) NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE onboarding.journey_reasons (
  id bigserial PRIMARY KEY,
  instance_id uuid NOT NULL REFERENCES onboarding.journey_instances(id) ON DELETE RESTRICT,
  reason_code varchar(80) NOT NULL REFERENCES onboarding.reason_codes(code) ON DELETE RESTRICT,
  is_primary boolean NOT NULL DEFAULT false,
  node_id uuid NULL REFERENCES onboarding.journey_nodes(id) ON DELETE RESTRICT,
  rule_code varchar(100) NULL,
  observed_value jsonb NULL,
  threshold_value jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "UQ_ONBOARDING_PRIMARY_REASON"
  ON onboarding.journey_reasons(instance_id) WHERE is_primary;

CREATE TABLE onboarding.configuration_audit (
  id bigserial PRIMARY KEY,
  journey_definition_id uuid NOT NULL REFERENCES onboarding.journey_definitions(id) ON DELETE RESTRICT,
  journey_version_id uuid NULL REFERENCES onboarding.journey_versions(id) ON DELETE RESTRICT,
  action varchar(32) NOT NULL,
  previous_state jsonb NULL,
  new_state jsonb NOT NULL,
  actor_id varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_ONBOARDING_CONFIG_AUDIT_STATE" CHECK (jsonb_typeof(new_state)='object')
);

CREATE OR REPLACE FUNCTION onboarding.select_active_journey(
  p_tenant_id uuid,
  p_country_code char(3),
  p_channel_code varchar,
  p_customer_type varchar,
  p_at timestamptz DEFAULT CURRENT_TIMESTAMP
) RETURNS TABLE(
  journey_definition_id uuid,
  journey_version_id uuid,
  entry_node_id uuid,
  priority integer
) LANGUAGE sql STABLE AS $$
  SELECT definition.id,version.id,entry_node.id,scope.priority
  FROM onboarding.journey_definitions definition
  JOIN onboarding.journey_versions version
    ON version.journey_definition_id=definition.id AND version.status='ACTIVE'
  JOIN onboarding.journey_scopes scope ON scope.journey_version_id=version.id
  JOIN onboarding.journey_nodes entry_node
    ON entry_node.journey_version_id=version.id AND entry_node.is_entry
  WHERE definition.tenant_id=p_tenant_id
    AND scope.country_code=upper(p_country_code)
    AND scope.channel_code=upper(p_channel_code)
    AND scope.customer_type=upper(p_customer_type)
    AND (scope.effective_from IS NULL OR scope.effective_from<=p_at)
    AND (scope.effective_to IS NULL OR scope.effective_to>p_at)
  ORDER BY scope.priority ASC,version.activated_at DESC,version.version_number DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION onboarding.activate_journey_version(
  p_version_id uuid,
  p_actor varchar
) RETURNS onboarding.journey_versions
LANGUAGE plpgsql AS $$
DECLARE
  v_version onboarding.journey_versions%ROWTYPE;
  v_definition onboarding.journey_definitions%ROWTYPE;
BEGIN
  SELECT * INTO v_version FROM onboarding.journey_versions
  WHERE id=p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Journey version was not found'; END IF;
  IF v_version.status<>'APPROVED' THEN
    RAISE EXCEPTION 'Only an approved journey version can be activated';
  END IF;
  SELECT * INTO v_definition FROM onboarding.journey_definitions
  WHERE id=v_version.journey_definition_id FOR UPDATE;
  IF NOT EXISTS (
    SELECT 1 FROM onboarding.journey_nodes
    WHERE journey_version_id=p_version_id AND is_entry
  ) THEN RAISE EXCEPTION 'Journey version has no entry node'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM onboarding.journey_scopes WHERE journey_version_id=p_version_id
  ) THEN RAISE EXCEPTION 'Journey version has no scope'; END IF;
  IF EXISTS (
    SELECT 1
    FROM onboarding.journey_scopes candidate
    JOIN onboarding.journey_scopes active_scope
      ON active_scope.country_code=candidate.country_code
     AND active_scope.channel_code=candidate.channel_code
     AND active_scope.customer_type=candidate.customer_type
     AND active_scope.priority=candidate.priority
    JOIN onboarding.journey_versions active_version
      ON active_version.id=active_scope.journey_version_id AND active_version.status='ACTIVE'
    JOIN onboarding.journey_definitions active_definition
      ON active_definition.id=active_version.journey_definition_id
    WHERE candidate.journey_version_id=p_version_id
      AND active_definition.tenant_id=v_definition.tenant_id
      AND active_version.id<>p_version_id
  ) THEN RAISE EXCEPTION 'An active journey already has the same scope and priority'; END IF;
  UPDATE onboarding.journey_versions
  SET status='RETIRED',retired_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
  WHERE journey_definition_id=v_version.journey_definition_id AND status='ACTIVE';
  UPDATE onboarding.journey_versions
  SET status='ACTIVE',activated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
  WHERE id=p_version_id RETURNING * INTO v_version;
  INSERT INTO onboarding.configuration_audit(
    journey_definition_id,journey_version_id,action,new_state,actor_id
  ) VALUES(
    v_version.journey_definition_id,v_version.id,'ACTIVATE',
    jsonb_build_object('status',v_version.status,'versionNumber',v_version.version_number),p_actor
  );
  RETURN v_version;
END $$;

CREATE OR REPLACE FUNCTION onboarding.start_or_resume_journey(
  p_tenant_id uuid,
  p_country_code char(3),
  p_channel_code varchar,
  p_customer_type varchar,
  p_contact_hash char(64),
  p_masked_contact varchar,
  p_contact_ciphertext bytea,
  p_resume_token_hash char(64),
  p_correlation_id varchar,
  p_expires_at timestamptz
) RETURNS TABLE(
  instance_id uuid,
  customer_id uuid,
  journey_version_id uuid,
  current_node_id uuid,
  status varchar,
  resumed boolean
) LANGUAGE plpgsql AS $$
DECLARE
  v_customer_id uuid;
  v_instance onboarding.journey_instances%ROWTYPE;
  v_version_id uuid;
  v_entry_node_id uuid;
BEGIN
  IF p_expires_at<=CURRENT_TIMESTAMP THEN RAISE EXCEPTION 'Journey expiry must be in the future'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||p_contact_hash,0));
  SELECT contact.customer_id INTO v_customer_id
  FROM customer_registry.contacts contact
  WHERE contact.tenant_id=p_tenant_id AND contact.contact_type='PHONE'
    AND contact.value_hash=p_contact_hash;
  IF v_customer_id IS NULL THEN
    INSERT INTO customer_registry.customers(
      tenant_id,home_country_code,customer_type,status
    ) VALUES(
      p_tenant_id,upper(p_country_code),upper(p_customer_type),'ONBOARDING'
    ) RETURNING id INTO v_customer_id;
    INSERT INTO customer_registry.contacts(
      tenant_id,customer_id,contact_type,value_hash,value_ciphertext,masked_value,is_primary
    ) VALUES(
      p_tenant_id,v_customer_id,'PHONE',p_contact_hash,p_contact_ciphertext,p_masked_contact,true
    );
  END IF;
  SELECT instance.* INTO v_instance FROM onboarding.journey_instances instance
  WHERE instance.tenant_id=p_tenant_id AND instance.customer_id=v_customer_id
    AND instance.status IN ('IN_PROGRESS','WAITING_EXTERNAL','MANUAL_REVIEW')
  FOR UPDATE;
  IF FOUND THEN
    IF v_instance.expires_at<=CURRENT_TIMESTAMP THEN
      UPDATE onboarding.journey_instances
      SET status='EXPIRED',updated_at=CURRENT_TIMESTAMP WHERE id=v_instance.id;
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM onboarding.journey_scopes resume_scope
        WHERE resume_scope.journey_version_id=v_instance.journey_version_id
          AND resume_scope.channel_code=upper(p_channel_code)
          AND (resume_scope.effective_from IS NULL OR resume_scope.effective_from<=CURRENT_TIMESTAMP)
          AND (resume_scope.effective_to IS NULL OR resume_scope.effective_to>CURRENT_TIMESTAMP)
      ) THEN
        RAISE EXCEPTION 'Current journey version does not support the requested resume channel';
      END IF;
      UPDATE onboarding.journey_instances
      SET current_channel_code=upper(p_channel_code),resume_token_hash=p_resume_token_hash,
          updated_at=CURRENT_TIMESTAMP
      WHERE id=v_instance.id RETURNING * INTO v_instance;
      INSERT INTO onboarding.journey_events(
        instance_id,event_type,actor_type,correlation_id,payload
      ) VALUES(
        v_instance.id,'JOURNEY_RESUMED','CUSTOMER',p_correlation_id,
        jsonb_build_object('channel',upper(p_channel_code))
      );
      RETURN QUERY SELECT v_instance.id,v_instance.customer_id,v_instance.journey_version_id,
        v_instance.current_node_id,v_instance.status::varchar,true;
      RETURN;
    END IF;
  END IF;
  SELECT selected.journey_version_id,selected.entry_node_id
  INTO v_version_id,v_entry_node_id
  FROM onboarding.select_active_journey(
    p_tenant_id,upper(p_country_code),upper(p_channel_code),upper(p_customer_type),CURRENT_TIMESTAMP
  ) selected;
  IF v_version_id IS NULL THEN RAISE EXCEPTION 'No active onboarding journey matches the requested scope'; END IF;
  INSERT INTO onboarding.journey_instances(
    tenant_id,customer_id,journey_version_id,current_node_id,
    source_channel_code,current_channel_code,resume_token_hash,expires_at
  ) VALUES(
    p_tenant_id,v_customer_id,v_version_id,v_entry_node_id,
    upper(p_channel_code),upper(p_channel_code),p_resume_token_hash,p_expires_at
  ) RETURNING * INTO v_instance;
  INSERT INTO onboarding.journey_events(
    instance_id,event_type,node_id,actor_type,correlation_id,payload
  ) VALUES(
    v_instance.id,'JOURNEY_STARTED',v_entry_node_id,'CUSTOMER',p_correlation_id,
    jsonb_build_object('channel',upper(p_channel_code),'country',upper(p_country_code))
  );
  RETURN QUERY SELECT v_instance.id,v_instance.customer_id,v_instance.journey_version_id,
    v_instance.current_node_id,v_instance.status::varchar,false;
END $$;

INSERT INTO public.admin_permissions(code,resource,action,description) VALUES
  ('onboarding_journeys.read','onboarding_journeys','read','View onboarding journeys and versions'),
  ('onboarding_journeys.make','onboarding_journeys','make','Create and submit onboarding journeys'),
  ('onboarding_journeys.check','onboarding_journeys','check','Approve and activate onboarding journeys'),
  ('onboarding_journeys.simulate','onboarding_journeys','simulate','Validate and simulate onboarding journeys'),
  ('onboarding_instances.read','onboarding_instances','read','View onboarding instances and audit events'),
  ('onboarding_instances.operate','onboarding_instances','operate','Operate and retry onboarding instances'),
  ('onboarding_instances.review','onboarding_instances','review','Perform onboarding manual review'),
  ('onboarding_sensitive_data.read','onboarding_sensitive_data','read','View protected onboarding data'),
  ('onboarding_configuration.manage','onboarding_configuration','manage','Manage onboarding channels and catalogues')
ON CONFLICT(code) DO UPDATE SET
  resource=EXCLUDED.resource,action=EXCLUDED.action,description=EXCLUDED.description;

INSERT INTO public.admin_role_permissions(role_id,permission_id)
SELECT role.id,permission.id
FROM public.admin_roles role
CROSS JOIN public.admin_permissions permission
WHERE role.code='super_admin' AND permission.code LIKE 'onboarding_%'
ON CONFLICT DO NOTHING;

COMMIT;
