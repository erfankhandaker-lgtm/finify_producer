BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_profile_operation_audit (
  id bigserial PRIMARY KEY,
  customer_msisdn bigint NOT NULL REFERENCES public."SW_TBL_PROFILE_CUST"("MSISDN"),
  operation varchar(32) NOT NULL,
  previous_state jsonb NULL,
  new_state jsonb NOT NULL,
  reason text NOT NULL,
  actor_id varchar(100) NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_CUSTOMER_PROFILE_AUDIT_OPERATION"
    CHECK (operation IN ('STATUS_CHANGE','PROFILE_UPDATE','KYC_UPDATE'))
);

CREATE INDEX IF NOT EXISTS "IDX_CUSTOMER_PROFILE_AUDIT_CUSTOMER"
  ON public.customer_profile_operation_audit(customer_msisdn,created_at DESC);

CREATE TABLE IF NOT EXISTS public.aml_cases (
  id bigserial PRIMARY KEY,
  reservation_id bigint NULL UNIQUE
    REFERENCES public.sw_tbl_aml_transaction_reservation(transactionid) ON DELETE SET NULL,
  customer_msisdn bigint NULL,
  source_wallet bigint NULL,
  reason_code varchar(100) NOT NULL,
  summary text NOT NULL,
  risk_level varchar(16) NOT NULL DEFAULT 'MEDIUM',
  status varchar(20) NOT NULL DEFAULT 'OPEN',
  assigned_to varchar(100) NULL,
  resolution text NULL,
  created_by varchar(100) NOT NULL,
  resolved_by varchar(100) NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at timestamp without time zone NULL,
  CONSTRAINT "CK_AML_CASE_RISK"
    CHECK (risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  CONSTRAINT "CK_AML_CASE_STATUS"
    CHECK (status IN ('OPEN','IN_REVIEW','CLEARED','ESCALATED','CLOSED'))
);

CREATE INDEX IF NOT EXISTS "IDX_AML_CASE_QUEUE"
  ON public.aml_cases(status,risk_level,created_at DESC);

INSERT INTO public.admin_permissions(code,resource,action,description) VALUES
  ('customers.manage','customers','manage','Manage customer profile operational status'),
  ('charges.read','charges','read','View charge configuration'),
  ('charges.make','charges','make','Create and change charge configuration'),
  ('charges.check','charges','check','Approve charge configuration'),
  ('commissions.read','commissions','read','View commission configuration'),
  ('commissions.make','commissions','make','Create and change commission configuration'),
  ('commissions.check','commissions','check','Approve commission configuration'),
  ('accounting.read','accounting','read','View accounting reports and operations'),
  ('accounting.operate','accounting','operate','Run accounting operational processes'),
  ('aml.read','aml','read','View AML configurations, activity, and cases'),
  ('aml.make','aml','make','Create and update AML cases and configurations'),
  ('aml.check','aml','check','Review and resolve AML cases and configurations')
ON CONFLICT(code) DO UPDATE SET
  resource=EXCLUDED.resource,action=EXCLUDED.action,description=EXCLUDED.description;

INSERT INTO public.admin_role_permissions(role_id,permission_id)
SELECT role.id,permission.id
FROM public.admin_roles role
CROSS JOIN public.admin_permissions permission
WHERE role.code='super_admin'
  AND permission.code IN (
    'customers.manage','charges.read','charges.make','charges.check',
    'commissions.read','commissions.make','commissions.check',
    'accounting.read','accounting.operate','aml.read','aml.make','aml.check'
  )
ON CONFLICT DO NOTHING;

COMMIT;
