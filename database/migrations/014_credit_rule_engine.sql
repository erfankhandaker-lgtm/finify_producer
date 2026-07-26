BEGIN;

CREATE TABLE IF NOT EXISTS public.credit_http_integrations (
  id bigserial PRIMARY KEY,
  code varchar(100) NOT NULL UNIQUE,
  name varchar(200) NOT NULL,
  method varchar(8) NOT NULL DEFAULT 'GET',
  url_template text NOT NULL,
  request_template jsonb NULL,
  auth_type varchar(20) NOT NULL DEFAULT 'NONE',
  auth_header varchar(100) NULL,
  auth_secret_env varchar(150) NULL,
  timeout_ms integer NOT NULL DEFAULT 5000,
  cache_ttl_seconds integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  created_by text NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by text NULL,
  updated_at timestamp without time zone NULL,
  approved_by text NULL,
  approved_at timestamp without time zone NULL,
  CONSTRAINT "CK_CREDIT_HTTP_METHOD"
    CHECK (method IN ('GET','POST','PUT','PATCH')),
  CONSTRAINT "CK_CREDIT_HTTP_AUTH"
    CHECK (auth_type IN ('NONE','API_KEY','BEARER')),
  CONSTRAINT "CK_CREDIT_HTTP_TIMEOUT"
    CHECK (timeout_ms BETWEEN 100 AND 120000),
  CONSTRAINT "CK_CREDIT_HTTP_CACHE"
    CHECK (cache_ttl_seconds BETWEEN 0 AND 86400),
  CONSTRAINT "CK_CREDIT_HTTP_DIFFERENT_CHECKER"
    CHECK (approved_by IS NULL OR approved_by <> created_by)
);

CREATE TABLE IF NOT EXISTS public.credit_score_providers (
  id bigserial PRIMARY KEY,
  code varchar(100) NOT NULL UNIQUE,
  name varchar(200) NOT NULL,
  http_integration_id bigint NOT NULL
    REFERENCES public.credit_http_integrations(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  score_response_path varchar(300) NOT NULL,
  category_response_path varchar(300) NOT NULL,
  model_id_response_path varchar(300) NULL,
  model_version_response_path varchar(300) NULL,
  reference_response_path varchar(300) NULL,
  scored_at_response_path varchar(300) NULL,
  score_min numeric(18,4) NULL,
  score_max numeric(18,4) NULL,
  validity_minutes integer NOT NULL DEFAULT 43200,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT false,
  created_by text NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by text NULL,
  updated_at timestamp without time zone NULL,
  approved_by text NULL,
  approved_at timestamp without time zone NULL,
  CONSTRAINT "CK_CREDIT_SCORE_RANGE"
    CHECK (score_min IS NULL OR score_max IS NULL OR score_max >= score_min),
  CONSTRAINT "CK_CREDIT_SCORE_VALIDITY"
    CHECK (validity_minutes BETWEEN 1 AND 525600),
  CONSTRAINT "CK_CREDIT_SCORE_DIFFERENT_CHECKER"
    CHECK (approved_by IS NULL OR approved_by <> created_by)
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_CREDIT_SCORE_DEFAULT"
  ON public.credit_score_providers(is_default)
  WHERE is_default AND is_active;

CREATE TABLE IF NOT EXISTS public.credit_ai_score_snapshots (
  id bigserial PRIMARY KEY,
  customer_id varchar(150) NOT NULL,
  provider_id bigint NOT NULL
    REFERENCES public.credit_score_providers(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  score numeric(18,4) NOT NULL,
  customer_category varchar(100) NOT NULL,
  model_id varchar(150) NULL,
  model_version varchar(100) NULL,
  external_reference varchar(200) NULL,
  scored_at timestamp with time zone NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  raw_response_hash varchar(64) NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_CREDIT_SCORE_EXPIRY" CHECK (expires_at > scored_at)
);

CREATE INDEX IF NOT EXISTS "IDX_CREDIT_SCORE_CUSTOMER"
  ON public.credit_ai_score_snapshots(customer_id,provider_id,expires_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_CREDIT_SCORE_EXTERNAL_REFERENCE"
  ON public.credit_ai_score_snapshots(provider_id,external_reference)
  WHERE external_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.credit_master_rules (
  id bigserial PRIMARY KEY,
  rule_code varchar(100) NOT NULL,
  version integer NOT NULL,
  name varchar(200) NOT NULL,
  customer_category varchar(100) NOT NULL,
  product_id varchar(100) NOT NULL,
  currency varchar(3) NULL,
  minimum_score numeric(18,4) NULL,
  maximum_score numeric(18,4) NULL,
  base_limit numeric(24,2) NOT NULL DEFAULT 0,
  minimum_limit numeric(24,2) NOT NULL DEFAULT 0,
  maximum_limit numeric(24,2) NOT NULL,
  default_outcome varchar(30) NOT NULL DEFAULT 'REJECTED',
  auto_approval_enabled boolean NOT NULL DEFAULT false,
  default_repayment_option_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  score_provider_id bigint NULL
    REFERENCES public.credit_score_providers(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  status varchar(24) NOT NULL DEFAULT 'DRAFT',
  effective_from timestamp with time zone NULL,
  effective_to timestamp with time zone NULL,
  created_by text NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by text NULL,
  updated_at timestamp without time zone NULL,
  approved_by text NULL,
  approved_at timestamp without time zone NULL,
  activated_by text NULL,
  activated_at timestamp without time zone NULL,
  rejection_reason text NULL,
  CONSTRAINT "UQ_CREDIT_MASTER_VERSION" UNIQUE(rule_code,version),
  CONSTRAINT "CK_CREDIT_MASTER_SCORE_RANGE"
    CHECK (minimum_score IS NULL OR maximum_score IS NULL OR maximum_score >= minimum_score),
  CONSTRAINT "CK_CREDIT_MASTER_LIMITS"
    CHECK (
      base_limit >= 0 AND minimum_limit >= 0 AND maximum_limit > 0
      AND maximum_limit >= minimum_limit
    ),
  CONSTRAINT "CK_CREDIT_MASTER_OUTCOME"
    CHECK (default_outcome IN ('REJECTED','MANUAL_REVIEW')),
  CONSTRAINT "CK_CREDIT_MASTER_STATUS"
    CHECK (status IN (
      'DRAFT','PENDING_APPROVAL','APPROVED','ACTIVE',
      'REJECTED','SUPERSEDED','RETIRED'
    )),
  CONSTRAINT "CK_CREDIT_MASTER_PERIOD"
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  CONSTRAINT "CK_CREDIT_MASTER_DIFFERENT_CHECKER"
    CHECK (approved_by IS NULL OR approved_by <> created_by),
  CONSTRAINT "CK_CREDIT_MASTER_CURRENCY"
    CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$')
);

CREATE INDEX IF NOT EXISTS "IDX_CREDIT_MASTER_LOOKUP"
  ON public.credit_master_rules(product_id,customer_category,status,minimum_score,maximum_score);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_CREDIT_MASTER_ACTIVE_VERSION"
  ON public.credit_master_rules(rule_code)
  WHERE status='ACTIVE';

CREATE TABLE IF NOT EXISTS public.credit_rules (
  id bigserial PRIMARY KEY,
  master_rule_id bigint NOT NULL
    REFERENCES public.credit_master_rules(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  description text NULL,
  priority integer NOT NULL,
  exclusive_group varchar(100) NULL,
  source_type varchar(20) NOT NULL,
  ai_result_field varchar(100) NULL,
  schema_name varchar(100) NULL,
  table_name varchar(150) NULL,
  lookup_column varchar(150) NULL,
  value_column varchar(150) NULL,
  read_mode varchar(20) NULL,
  order_by_column varchar(150) NULL,
  http_integration_id bigint NULL
    REFERENCES public.credit_http_integrations(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  response_path varchar(300) NULL,
  data_type varchar(20) NOT NULL,
  condition_json jsonb NOT NULL,
  action_on_match jsonb NOT NULL,
  action_on_no_match jsonb NOT NULL DEFAULT '{"type":"CONTINUE"}'::jsonb,
  source_failure_action jsonb NOT NULL DEFAULT '{"type":"MANUAL_REVIEW","reasonCode":"DATA_SOURCE_UNAVAILABLE"}'::jsonb,
  stop_on_match boolean NOT NULL DEFAULT false,
  stop_on_no_match boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by text NULL,
  updated_at timestamp without time zone NULL,
  CONSTRAINT "UQ_CREDIT_RULE_PRIORITY" UNIQUE(master_rule_id,priority),
  CONSTRAINT "CK_CREDIT_RULE_PRIORITY" CHECK (priority BETWEEN 1 AND 100000),
  CONSTRAINT "CK_CREDIT_RULE_SOURCE"
    CHECK (source_type IN ('AI_RESULT','POSTGRES','HTTP_API')),
  CONSTRAINT "CK_CREDIT_RULE_READ_MODE"
    CHECK (read_mode IS NULL OR read_mode IN (
      'SINGLE','LATEST','SUM','AVERAGE','COUNT','MINIMUM','MAXIMUM','EXISTS'
    )),
  CONSTRAINT "CK_CREDIT_RULE_DATA_TYPE"
    CHECK (data_type IN ('STRING','DECIMAL','INTEGER','BOOLEAN','DATE','DATETIME')),
  CONSTRAINT "CK_CREDIT_RULE_SOURCE_FIELDS"
    CHECK (
      (source_type='AI_RESULT' AND ai_result_field IS NOT NULL)
      OR
      (source_type='POSTGRES' AND schema_name IS NOT NULL AND table_name IS NOT NULL
        AND lookup_column IS NOT NULL AND value_column IS NOT NULL AND read_mode IS NOT NULL)
      OR
      (source_type='HTTP_API' AND http_integration_id IS NOT NULL AND response_path IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS "IDX_CREDIT_RULE_EXECUTION_ORDER"
  ON public.credit_rules(master_rule_id,is_active,priority);

CREATE TABLE IF NOT EXISTS public.credit_rule_change_requests (
  id bigserial PRIMARY KEY,
  master_rule_id bigint NOT NULL
    REFERENCES public.credit_master_rules(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  action varchar(20) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  maker_id text NOT NULL,
  maker_comment text NULL,
  checker_id text NULL,
  checker_comment text NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at timestamp without time zone NULL,
  CONSTRAINT "CK_CREDIT_CHANGE_ACTION"
    CHECK (action IN ('PUBLISH','ACTIVATE','RETIRE')),
  CONSTRAINT "CK_CREDIT_CHANGE_STATUS"
    CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  CONSTRAINT "CK_CREDIT_CHANGE_DIFFERENT_CHECKER"
    CHECK (checker_id IS NULL OR checker_id <> maker_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_CREDIT_CHANGE_PENDING"
  ON public.credit_rule_change_requests(master_rule_id,action)
  WHERE status='PENDING';

CREATE TABLE IF NOT EXISTS public.credit_rule_executions (
  id uuid PRIMARY KEY,
  customer_id varchar(150) NOT NULL,
  application_id varchar(150) NULL,
  product_id varchar(100) NOT NULL,
  currency varchar(3) NULL,
  master_rule_id bigint NULL
    REFERENCES public.credit_master_rules(id) ON UPDATE RESTRICT ON DELETE SET NULL,
  master_rule_code varchar(100) NULL,
  master_rule_version integer NULL,
  ai_score_snapshot_id bigint NULL
    REFERENCES public.credit_ai_score_snapshots(id) ON UPDATE RESTRICT ON DELETE SET NULL,
  ai_score numeric(18,4) NULL,
  customer_category varchar(100) NULL,
  requested_amount numeric(24,2) NOT NULL,
  existing_exposure numeric(24,2) NOT NULL DEFAULT 0,
  pending_reservations numeric(24,2) NOT NULL DEFAULT 0,
  allocated_limit numeric(24,2) NOT NULL DEFAULT 0,
  available_limit numeric(24,2) NOT NULL DEFAULT 0,
  eligible_repayment_option_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcome varchar(30) NOT NULL,
  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  simulation boolean NOT NULL DEFAULT false,
  started_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamp with time zone NULL,
  duration_ms integer NULL,
  CONSTRAINT "CK_CREDIT_EXECUTION_OUTCOME"
    CHECK (outcome IN (
      'PROCESSING','AUTO_APPROVED','COUNTER_OFFER','MANUAL_REVIEW','REJECTED',
      'RESCORE_REQUIRED','NO_MASTER_RULE','DATA_SOURCE_UNAVAILABLE'
    )),
  CONSTRAINT "CK_CREDIT_EXECUTION_AMOUNTS"
    CHECK (
      requested_amount >= 0 AND existing_exposure >= 0 AND pending_reservations >= 0
      AND allocated_limit >= 0 AND available_limit >= 0
    )
);

CREATE INDEX IF NOT EXISTS "IDX_CREDIT_EXECUTION_CUSTOMER"
  ON public.credit_rule_executions(customer_id,started_at DESC);

CREATE INDEX IF NOT EXISTS "IDX_CREDIT_EXECUTION_APPLICATION"
  ON public.credit_rule_executions(application_id)
  WHERE application_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.credit_rule_execution_steps (
  id bigserial PRIMARY KEY,
  execution_id uuid NOT NULL
    REFERENCES public.credit_rule_executions(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  rule_id bigint NOT NULL
    REFERENCES public.credit_rules(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  priority integer NOT NULL,
  source_type varchar(20) NOT NULL,
  source_reference text NULL,
  source_value jsonb NULL,
  condition_result boolean NULL,
  applied_action jsonb NULL,
  limit_before numeric(24,2) NOT NULL,
  limit_after numeric(24,2) NOT NULL,
  outcome_after varchar(30) NULL,
  reason_code varchar(150) NULL,
  error_message text NULL,
  duration_ms integer NOT NULL DEFAULT 0,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "IDX_CREDIT_EXECUTION_STEPS"
  ON public.credit_rule_execution_steps(execution_id,priority,id);

INSERT INTO public.admin_permissions(code,resource,action,description) VALUES
  ('credit_rules.read','credit_rules','read','View credit policies, rules, integrations, and execution history'),
  ('credit_rules.make','credit_rules','make','Create and submit credit-policy changes'),
  ('credit_rules.check','credit_rules','check','Approve, activate, reject, or retire credit policies'),
  ('credit_rules.simulate','credit_rules','simulate','Simulate draft credit policies'),
  ('credit_decisions.evaluate','credit_decisions','evaluate','Execute production credit decisions'),
  ('credit_decisions.read','credit_decisions','read','View credit decisions and rule traces')
ON CONFLICT(code) DO UPDATE SET
  resource=EXCLUDED.resource,action=EXCLUDED.action,description=EXCLUDED.description;

INSERT INTO public.admin_role_permissions(role_id,permission_id)
SELECT role.id,permission.id
FROM public.admin_roles role
CROSS JOIN public.admin_permissions permission
WHERE role.code='super_admin'
  AND permission.code IN (
    'credit_rules.read','credit_rules.make','credit_rules.check',
    'credit_rules.simulate','credit_decisions.evaluate','credit_decisions.read'
  )
ON CONFLICT DO NOTHING;

COMMIT;
