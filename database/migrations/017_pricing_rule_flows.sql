BEGIN;

CREATE TABLE IF NOT EXISTS public.pricing_rule_flows (
  id bigserial PRIMARY KEY,
  rule_code varchar(64) NOT NULL,
  version integer NOT NULL DEFAULT 1,
  name varchar(160) NOT NULL,
  keyword varchar(100) NOT NULL,
  source_wallet_type integer NOT NULL,
  destination_wallet_type integer NULL,
  currency varchar(8) NOT NULL DEFAULT 'UGX',
  priority integer NOT NULL DEFAULT 100,
  status varchar(16) NOT NULL DEFAULT 'DRAFT',
  definition jsonb NOT NULL,
  created_by varchar(100) NOT NULL,
  modified_by varchar(100) NULL,
  approved_by varchar(100) NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at timestamp without time zone NULL,
  activated_at timestamp without time zone NULL,
  CONSTRAINT "UQ_PRICING_RULE_FLOW_VERSION" UNIQUE(rule_code,version),
  CONSTRAINT "CK_PRICING_RULE_FLOW_STATUS"
    CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','ACTIVE','RETIRED','REJECTED')),
  CONSTRAINT "CK_PRICING_RULE_FLOW_PRIORITY" CHECK (priority BETWEEN 1 AND 10000),
  CONSTRAINT "CK_PRICING_RULE_FLOW_DEFINITION" CHECK (jsonb_typeof(definition)='object')
);

CREATE INDEX IF NOT EXISTS "IDX_PRICING_RULE_FLOW_LOOKUP"
  ON public.pricing_rule_flows(keyword,source_wallet_type,currency,status,priority);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ACTIVE_PRICING_RULE_FLOW"
  ON public.pricing_rule_flows(keyword,source_wallet_type,currency)
  WHERE status='ACTIVE';

CREATE TABLE IF NOT EXISTS public.pricing_rule_flow_audit (
  id bigserial PRIMARY KEY,
  pricing_rule_flow_id bigint NOT NULL
    REFERENCES public.pricing_rule_flows(id) ON DELETE RESTRICT,
  action varchar(24) NOT NULL,
  previous_state jsonb NULL,
  new_state jsonb NOT NULL,
  actor_id varchar(100) NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_PRICING_RULE_FLOW_AUDIT_ACTION"
    CHECK (action IN ('CREATE','UPDATE','SUBMIT','APPROVE','ACTIVATE','RETIRE','REJECT'))
);

CREATE INDEX IF NOT EXISTS "IDX_PRICING_RULE_FLOW_AUDIT"
  ON public.pricing_rule_flow_audit(pricing_rule_flow_id,created_at DESC);

INSERT INTO public.admin_permissions(code,resource,action,description) VALUES
  ('pricing_rules.read','pricing_rules','read','View visual charge and commission pricing flows'),
  ('pricing_rules.make','pricing_rules','make','Create and submit visual pricing flows'),
  ('pricing_rules.check','pricing_rules','check','Approve and activate visual pricing flows'),
  ('pricing_rules.simulate','pricing_rules','simulate','Simulate visual pricing flows')
ON CONFLICT(code) DO UPDATE SET
  resource=EXCLUDED.resource,action=EXCLUDED.action,description=EXCLUDED.description;

INSERT INTO public.admin_role_permissions(role_id,permission_id)
SELECT role.id,permission.id
FROM public.admin_roles role
CROSS JOIN public.admin_permissions permission
WHERE role.code='super_admin'
  AND permission.code IN (
    'pricing_rules.read','pricing_rules.make','pricing_rules.check','pricing_rules.simulate'
  )
ON CONFLICT DO NOTHING;

COMMIT;
