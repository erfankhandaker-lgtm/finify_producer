BEGIN;

ALTER TABLE public.credit_score_providers
  ADD COLUMN IF NOT EXISTS provider_mode varchar(16) NOT NULL DEFAULT 'HTTP';
ALTER TABLE public.credit_score_providers DROP CONSTRAINT IF EXISTS "CK_CREDIT_SCORE_PROVIDER_MODE";
ALTER TABLE public.credit_score_providers ADD CONSTRAINT "CK_CREDIT_SCORE_PROVIDER_MODE"
  CHECK (provider_mode IN ('HTTP','SUBMITTED'));

ALTER TABLE public.credit_rule_executions
  ADD COLUMN IF NOT EXISTS decision_inputs jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.credit_rules DROP CONSTRAINT IF EXISTS "CK_CREDIT_RULE_SOURCE";
ALTER TABLE public.credit_rules ADD CONSTRAINT "CK_CREDIT_RULE_SOURCE"
  CHECK (source_type IN ('AI_RESULT','DECISION_INPUT','POSTGRES','HTTP_API'));
ALTER TABLE public.credit_rules DROP CONSTRAINT IF EXISTS "CK_CREDIT_RULE_SOURCE_FIELDS";
ALTER TABLE public.credit_rules ADD CONSTRAINT "CK_CREDIT_RULE_SOURCE_FIELDS" CHECK (
  (source_type='AI_RESULT' AND ai_result_field IS NOT NULL)
  OR (source_type='DECISION_INPUT')
  OR (source_type='POSTGRES' AND schema_name IS NOT NULL AND table_name IS NOT NULL
    AND lookup_column IS NOT NULL AND value_column IS NOT NULL AND read_mode IS NOT NULL)
  OR (source_type='HTTP_API' AND http_integration_id IS NOT NULL AND response_path IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.credit_reason_catalogue (
  code varchar(100) PRIMARY KEY,
  category varchar(50) NOT NULL,
  decision_type varchar(24) NOT NULL,
  customer_message text NOT NULL,
  internal_reason text NOT NULL,
  analytics_dimension varchar(100) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_CREDIT_REASON_TYPE" CHECK (decision_type IN ('REJECT','MANUAL_REVIEW','TECHNICAL')),
  CONSTRAINT "CK_CREDIT_REASON_CHECKER" CHECK (approved_by<>created_by)
);

CREATE TABLE IF NOT EXISTS public.credit_lenders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code varchar(100) NOT NULL UNIQUE,name varchar(200) NOT NULL,
  country_code char(3) NOT NULL,allocation_weight numeric(9,6) NOT NULL DEFAULT 1,
  status varchar(24) NOT NULL DEFAULT 'DRAFT',created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by text NULL,approved_at timestamptz NULL,activated_by text NULL,activated_at timestamptz NULL,
  CONSTRAINT "CK_CREDIT_LENDER_STATUS" CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','ACTIVE','SUSPENDED','RETIRED')),
  CONSTRAINT "CK_CREDIT_LENDER_WEIGHT" CHECK (allocation_weight>0),
  CONSTRAINT "CK_CREDIT_LENDER_CHECKER" CHECK (approved_by IS NULL OR approved_by<>created_by)
);

CREATE TABLE IF NOT EXISTS public.credit_product_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code varchar(100) NOT NULL,version integer NOT NULL,
  product_id varchar(100) NOT NULL,country_code char(3) NOT NULL,currency char(3) NOT NULL,
  channel varchar(30) NULL,wallet_type_code varchar(100) NOT NULL,lender_id uuid NULL REFERENCES public.credit_lenders(id),
  pricing_rule_code varchar(100) NULL,interest_method varchar(30) NULL,annual_interest_rate numeric(12,8) NULL,
  processing_fee_type varchar(20) NULL,processing_fee_value numeric(24,6) NULL,
  late_fee_type varchar(20) NULL,late_fee_value numeric(24,6) NULL,
  early_settlement_allowed boolean NULL,early_settlement_fee_type varchar(20) NULL,
  early_settlement_fee_value numeric(24,6) NULL,charge_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  commission_codes jsonb NOT NULL DEFAULT '[]'::jsonb,activation_blockers jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_reference text NOT NULL,status varchar(24) NOT NULL DEFAULT 'DRAFT',created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,approved_by text NULL,approved_at timestamptz NULL,
  activated_by text NULL,activated_at timestamptz NULL,
  UNIQUE(code,version),
  CONSTRAINT "CK_CREDIT_BINDING_STATUS" CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','ACTIVE','REJECTED','RETIRED')),
  CONSTRAINT "CK_CREDIT_BINDING_INTEREST" CHECK (annual_interest_rate IS NULL OR annual_interest_rate>=0),
  CONSTRAINT "CK_CREDIT_BINDING_CHECKER" CHECK (approved_by IS NULL OR approved_by<>created_by),
  CONSTRAINT "CK_CREDIT_BINDING_ACTIVE_COMPLETE" CHECK (status<>'ACTIVE' OR
    (lender_id IS NOT NULL AND pricing_rule_code IS NOT NULL AND interest_method IS NOT NULL
     AND annual_interest_rate IS NOT NULL AND early_settlement_allowed IS NOT NULL
     AND jsonb_array_length(activation_blockers)=0))
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_CREDIT_BINDING_ACTIVE_SCOPE"
  ON public.credit_product_bindings(product_id,country_code,currency,COALESCE(channel,'')) WHERE status='ACTIVE';

CREATE TABLE IF NOT EXISTS public.credit_manual_review_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code varchar(100) NOT NULL UNIQUE,name varchar(200) NOT NULL,
  country_code char(3) NULL,product_id varchar(100) NULL,sla_minutes integer NOT NULL,
  required_approvals integer NOT NULL DEFAULT 2,reviewer_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by text NOT NULL,approved_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_CREDIT_REVIEW_QUEUE_STATUS" CHECK (status IN ('ACTIVE','INACTIVE')),
  CONSTRAINT "CK_CREDIT_REVIEW_QUEUE_APPROVALS" CHECK (required_approvals BETWEEN 2 AND 5),
  CONSTRAINT "CK_CREDIT_REVIEW_QUEUE_CHECKER" CHECK (approved_by<>created_by)
);

CREATE TABLE IF NOT EXISTS public.credit_manual_review_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),execution_id uuid NOT NULL UNIQUE REFERENCES public.credit_rule_executions(id),
  queue_id uuid NOT NULL REFERENCES public.credit_manual_review_queues(id),status varchar(24) NOT NULL DEFAULT 'PENDING',
  assigned_to text NULL,recommendation varchar(16) NULL,recommendation_reason_code varchar(100) NULL,
  recommendation_comment text NULL,recommended_limit numeric(24,2) NULL,recommended_by text NULL,recommended_at timestamptz NULL,
  final_reason_code varchar(100) NULL,final_comment text NULL,approved_limit numeric(24,2) NULL,
  decided_by text NULL,decided_at timestamptz NULL,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_CREDIT_REVIEW_CASE_STATUS" CHECK (status IN ('PENDING','IN_REVIEW','RECOMMENDED','APPROVED','REJECTED','CANCELLED')),
  CONSTRAINT "CK_CREDIT_REVIEW_RECOMMENDATION" CHECK (recommendation IS NULL OR recommendation IN ('APPROVE','REJECT')),
  CONSTRAINT "CK_CREDIT_REVIEW_DIFFERENT_APPROVER" CHECK (decided_by IS NULL OR recommended_by IS NULL OR decided_by<>recommended_by)
);
CREATE INDEX IF NOT EXISTS "IDX_CREDIT_REVIEW_WORKLIST" ON public.credit_manual_review_cases(queue_id,status,created_at);

CREATE TABLE IF NOT EXISTS public.credit_manual_review_actions (
  id bigserial PRIMARY KEY,case_id uuid NOT NULL REFERENCES public.credit_manual_review_cases(id),
  action varchar(30) NOT NULL,actor_id text NOT NULL,reason_code varchar(100) NULL,comment text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO public.credit_reason_catalogue(code,category,decision_type,customer_message,internal_reason,analytics_dimension,created_by,approved_by) VALUES
('KYC_NOT_VERIFIED','KYC','REJECT','We could not confirm your identity. Please complete identity verification.','KYC status was not VERIFIED at decision time.','kyc','credit-policy-maker','credit-risk-checker'),
('AGE_BELOW_MINIMUM','ELIGIBILITY','REJECT','You do not meet the minimum age requirement for this credit product.','Applicant age was below 21 years.','age','credit-policy-maker','credit-risk-checker'),
('AGE_ABOVE_MAXIMUM','ELIGIBILITY','REJECT','You do not meet the age requirement for this credit product.','Applicant age exceeded 70 years.','age','credit-policy-maker','credit-risk-checker'),
('BUREAU_FAILED','BUREAU','REJECT','We are unable to offer credit based on the credit-reference assessment.','Bureau status was FAIL.','bureau_status','credit-policy-maker','credit-risk-checker'),
('BUREAU_30_PLUS_COUNT_EXCEEDED','BUREAU','REJECT','Your recent repayment history does not meet this product’s requirements.','Two or more 30+ DPD occurrences were recorded in six months.','dpd_frequency_6m','credit-policy-maker','credit-risk-checker'),
('BUREAU_MAX_DPD_6M_EXCEEDED','BUREAU','REJECT','Your recent repayment history does not meet this product’s requirements.','Maximum DPD in six months exceeded 60.','max_dpd_6m','credit-policy-maker','credit-risk-checker'),
('CURRENT_DPD_EXCEEDED','BUREAU','REJECT','Please regularise your existing repayment before applying again.','Current DPD exceeded 30.','current_dpd','credit-policy-maker','credit-risk-checker'),
('BUREAU_MAX_DPD_12M_EXCEEDED','BUREAU','REJECT','Your repayment history does not meet this product’s requirements.','Maximum DPD in twelve months exceeded 90.','max_dpd_12m','credit-policy-maker','credit-risk-checker'),
('OPEN_LOANS_EXCEEDED','AFFORDABILITY','REJECT','We cannot offer another loan at this time.','Current open-loan count exceeded two.','open_loans','credit-policy-maker','credit-risk-checker'),
('CASHFLOW_BELOW_MINIMUM','AFFORDABILITY','REJECT','Your recent account activity is not yet sufficient for this credit product.','Dominant monthly cash flow was below UGX 50,000 for bureau customers or below the applicable no-record threshold.','cash_flow','credit-policy-maker','credit-risk-checker'),
('TELECOM_TENURE_TOO_SHORT','TENURE','REJECT','Your account history is not yet long enough for this credit product.','Telecom age-on-network did not meet the channel/no-bureau threshold.','telecom_tenure','credit-policy-maker','credit-risk-checker'),
('SCHOOL_PAYMENT_REQUIRED','CHANNEL','REJECT','Complete at least one eligible school payment before applying through this channel.','USSD applicant had no completed Schoolaggregator term payment.','school_payment','credit-policy-maker','credit-risk-checker'),
('DORMANT_LIMIT_REVIEW','DORMANCY','MANUAL_REVIEW','Your application needs an additional review.','A previous allocated limit was never utilised; route for dormancy review.','dormancy','credit-policy-maker','credit-risk-checker'),
('CHURN_BAND_REVIEW','MODEL','MANUAL_REVIEW','Your application needs an additional review.','Churn band was outside the policy-backed low-risk bands 1 and 2.','churn','credit-policy-maker','credit-risk-checker'),
('SCORE_GRADE_MISMATCH','MODEL','MANUAL_REVIEW','Your application needs an additional review.','Submitted decision-input grade did not match the immutable score snapshot grade.','score_integrity','credit-policy-maker','credit-risk-checker'),
('SCORE_GRADE_NOT_ELIGIBLE','MODEL','REJECT','We are unable to offer credit under the current policy.','No A-J decision-tree leaf matched the verified inputs.','score_grade','credit-policy-maker','credit-risk-checker'),
('COMMERCIAL_BINDING_INACTIVE','COMMERCIAL','MANUAL_REVIEW','Your application has passed initial assessment and is awaiting final product confirmation.','No active maker-checker-approved lender and commercial product binding matched country, currency and channel.','commercial_binding','credit-policy-maker','credit-risk-checker'),
('POLICY_OFFER_MATCHED','POLICY','TECHNICAL','Your eligible offer has been calculated.','A workbook-backed A-J decision-tree leaf produced the limit.','policy_leaf','credit-policy-maker','credit-risk-checker'),
('MANUAL_APPROVED','MANUAL_REVIEW','TECHNICAL','Your application was approved after review.','A second authorised reviewer approved the recommendation.','manual_review','credit-policy-maker','credit-risk-checker'),
('MANUAL_REJECTED','MANUAL_REVIEW','REJECT','We are unable to offer credit following additional review.','A second authorised reviewer rejected the recommendation.','manual_review','credit-policy-maker','credit-risk-checker'),
('DATA_SOURCE_UNAVAILABLE','TECHNICAL','MANUAL_REVIEW','Your application needs an additional review.','A required decision data source could not be read.','data_quality','credit-policy-maker','credit-risk-checker'),
('AI_SCORE_UNAVAILABLE','MODEL','MANUAL_REVIEW','We could not complete the credit assessment at this time.','No valid score was available from the configured provider.','score_availability','credit-policy-maker','credit-risk-checker')
ON CONFLICT(code) DO UPDATE SET customer_message=EXCLUDED.customer_message,internal_reason=EXCLUDED.internal_reason,
  analytics_dimension=EXCLUDED.analytics_dimension,is_active=true;

INSERT INTO public.credit_manual_review_queues(code,name,country_code,product_id,sla_minutes,required_approvals,reviewer_roles,created_by,approved_by)
VALUES('UGA_RETAIL_CREDIT_REVIEW','Uganda Retail Credit Review','UGA','UGA_RETAIL_CREDIT',240,2,
  '["credit_reviewer","credit_approver"]','credit-operations-maker','credit-risk-checker')
ON CONFLICT(code) DO UPDATE SET status='ACTIVE',sla_minutes=EXCLUDED.sla_minutes,required_approvals=2;

INSERT INTO public.credit_lenders(code,name,country_code,status,created_by)
VALUES('UNASSIGNED_UGA_LENDER','Lender selection required','UGA','DRAFT','migration-052')
ON CONFLICT(code) DO NOTHING;

INSERT INTO public.credit_product_bindings(code,version,product_id,country_code,currency,channel,wallet_type_code,
  source_reference,activation_blockers,status,created_by)
VALUES('UGA_RETAIL_CREDIT_COMMERCIAL',1,'UGA_RETAIL_CREDIT','UGA','UGX',NULL,'103',
  'Credit Policy recco-T1_2026_V4.xlsx; New Policy 300326',
  '["LENDER_NOT_SELECTED","INTEREST_RATE_NOT_APPROVED","PROCESSING_FEE_NOT_APPROVED","LATE_FEE_NOT_APPROVED","EARLY_SETTLEMENT_TERMS_NOT_APPROVED","CHARGES_NOT_APPROVED","COMMISSION_NOT_APPROVED"]','DRAFT','migration-052')
ON CONFLICT(code,version) DO NOTHING;

UPDATE public.credit_score_providers SET provider_mode='SUBMITTED',is_active=true,is_default=true,
  approved_by=CASE WHEN created_by='credit-risk-checker' THEN 'credit-policy-checker' ELSE 'credit-risk-checker' END,
  approved_at=CURRENT_TIMESTAMP,updated_by='migration-052',updated_at=CURRENT_TIMESTAMP
WHERE code='FINIFY_SCORE_MODEL_UGA_V1';

UPDATE public.credit_master_rules SET status='SUPERSEDED',effective_to=CURRENT_TIMESTAMP
WHERE rule_code='UGA_RETAIL_CREDIT_POLICY' AND status='ACTIVE';

INSERT INTO public.credit_master_rules(rule_code,version,name,customer_category,product_id,currency,
  base_limit,minimum_limit,maximum_limit,default_outcome,auto_approval_enabled,score_provider_id,status,
  effective_from,created_by,approved_by,approved_at,activated_by,activated_at)
SELECT 'UGA_RETAIL_CREDIT_POLICY',2,'Uganda Retail A-J Credit Policy 30-Mar-2026','ANY','UGA_RETAIL_CREDIT','UGX',
  0,400000,1500000,'REJECTED',true,provider.id,'ACTIVE',CURRENT_TIMESTAMP,
  'credit-policy-maker','credit-risk-checker',CURRENT_TIMESTAMP,'credit-risk-activator',CURRENT_TIMESTAMP
FROM public.credit_score_providers provider WHERE provider.code='FINIFY_SCORE_MODEL_UGA_V1'
ON CONFLICT(rule_code,version) DO UPDATE SET status='ACTIVE',score_provider_id=EXCLUDED.score_provider_id,
  effective_from=CURRENT_TIMESTAMP,effective_to=NULL,auto_approval_enabled=true;

DELETE FROM public.credit_rules WHERE master_rule_id=(SELECT id FROM public.credit_master_rules
  WHERE rule_code='UGA_RETAIL_CREDIT_POLICY' AND version=2);

CREATE OR REPLACE FUNCTION pg_temp.seed_credit_rule(p_priority integer,p_name text,p_condition jsonb,p_action jsonb)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.credit_rules(master_rule_id,name,description,priority,source_type,data_type,condition_json,
    action_on_match,action_on_no_match,source_failure_action,stop_on_match,created_by)
  SELECT id,p_name,'Workbook-backed decision-tree rule',p_priority,'DECISION_INPUT','STRING',p_condition,p_action,
    '{"type":"CONTINUE"}'::jsonb,'{"type":"MANUAL_REVIEW","reasonCode":"DATA_SOURCE_UNAVAILABLE"}'::jsonb,true,'migration-052'
  FROM public.credit_master_rules WHERE rule_code='UGA_RETAIL_CREDIT_POLICY' AND version=2
$$;

SELECT pg_temp.seed_credit_rule(10,'Reject unverified KYC','{"field":"kycStatus","operator":"NOT_EQUALS","value":"VERIFIED"}',
  '{"type":"REJECT","reasonCode":"KYC_NOT_VERIFIED"}');
SELECT pg_temp.seed_credit_rule(20,'Reject age below 21','{"field":"ageYears","dataType":"INTEGER","operator":"LESS_THAN","value":21}',
  '{"type":"REJECT","reasonCode":"AGE_BELOW_MINIMUM"}');
SELECT pg_temp.seed_credit_rule(21,'Reject age above 70','{"field":"ageYears","dataType":"INTEGER","operator":"GREATER_THAN","value":70}',
  '{"type":"REJECT","reasonCode":"AGE_ABOVE_MAXIMUM"}');
SELECT pg_temp.seed_credit_rule(30,'Reject bureau fail','{"field":"bureauStatus","operator":"EQUALS","value":"FAIL"}',
  '{"type":"REJECT","reasonCode":"BUREAU_FAILED"}');
SELECT pg_temp.seed_credit_rule(31,'Reject bureau 30 plus frequency','{"all":[{"field":"bureauStatus","operator":"EQUALS","value":"PASS"},{"field":"count30PlusDpd6Months","dataType":"INTEGER","operator":"GREATER_THAN_OR_EQUAL","value":2}]}',
  '{"type":"REJECT","reasonCode":"BUREAU_30_PLUS_COUNT_EXCEEDED"}');
SELECT pg_temp.seed_credit_rule(32,'Reject bureau six month max DPD','{"all":[{"field":"bureauStatus","operator":"EQUALS","value":"PASS"},{"field":"maxDpd6Months","dataType":"INTEGER","operator":"GREATER_THAN","value":60}]}',
  '{"type":"REJECT","reasonCode":"BUREAU_MAX_DPD_6M_EXCEEDED"}');
SELECT pg_temp.seed_credit_rule(33,'Reject current DPD','{"all":[{"field":"bureauStatus","operator":"EQUALS","value":"PASS"},{"field":"currentDpd","dataType":"INTEGER","operator":"GREATER_THAN","value":30}]}',
  '{"type":"REJECT","reasonCode":"CURRENT_DPD_EXCEEDED"}');
SELECT pg_temp.seed_credit_rule(34,'Reject twelve month max DPD','{"all":[{"field":"bureauStatus","operator":"EQUALS","value":"PASS"},{"field":"maxDpd12Months","dataType":"INTEGER","operator":"GREATER_THAN","value":90}]}',
  '{"type":"REJECT","reasonCode":"BUREAU_MAX_DPD_12M_EXCEEDED"}');
SELECT pg_temp.seed_credit_rule(35,'Reject excessive open loans','{"all":[{"field":"bureauStatus","operator":"EQUALS","value":"PASS"},{"field":"currentOpenLoans","dataType":"INTEGER","operator":"GREATER_THAN","value":2}]}',
  '{"type":"REJECT","reasonCode":"OPEN_LOANS_EXCEEDED"}');
SELECT pg_temp.seed_credit_rule(40,'Route dormant allocation','{"field":"dormantAfterAllocation","dataType":"BOOLEAN","operator":"EQUALS","value":true}',
  '{"type":"MANUAL_REVIEW","reasonCode":"DORMANT_LIMIT_REVIEW"}');
SELECT pg_temp.seed_credit_rule(41,'Route elevated churn band','{"field":"churnBand","dataType":"INTEGER","operator":"GREATER_THAN","value":2}',
  '{"type":"MANUAL_REVIEW","reasonCode":"CHURN_BAND_REVIEW"}');
SELECT pg_temp.seed_credit_rule(50,'USSD requires school payment','{"all":[{"field":"channel","operator":"EQUALS","value":"USSD"},{"field":"schoolAggregatorTermPaid","dataType":"BOOLEAN","operator":"EQUALS","value":false}]}',
  '{"type":"REJECT","reasonCode":"SCHOOL_PAYMENT_REQUIRED"}');

SELECT pg_temp.seed_credit_rule(100,'APP bureau high cashflow ABC','{"all":[{"field":"channel","operator":"EQUALS","value":"APP"},{"field":"bureauStatus","operator":"EQUALS","value":"PASS"},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"GREATER_THAN","value":300000},{"field":"grade","operator":"IN","values":["A","B","C"]}]}',
  '{"type":"SET_LIMIT_FROM_INPUT_MULTIPLIER","inputField":"modelProposedLimit","multiplier":1,"floor":400000,"cap":1500000,"reasonCode":"POLICY_OFFER_MATCHED"}');
SELECT pg_temp.seed_credit_rule(101,'APP bureau high cashflow DEF','{"all":[{"field":"channel","operator":"EQUALS","value":"APP"},{"field":"bureauStatus","operator":"EQUALS","value":"PASS"},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"GREATER_THAN","value":300000},{"field":"grade","operator":"IN","values":["D","E","F"]}]}',
  '{"type":"SET_LIMIT_FROM_INPUT_MULTIPLIER","inputField":"modelProposedLimit","multiplier":0.8,"floor":400000,"cap":1500000,"reasonCode":"POLICY_OFFER_MATCHED"}');
SELECT pg_temp.seed_credit_rule(102,'APP bureau high cashflow GHI','{"all":[{"field":"channel","operator":"EQUALS","value":"APP"},{"field":"bureauStatus","operator":"EQUALS","value":"PASS"},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"GREATER_THAN","value":300000},{"field":"grade","operator":"IN","values":["G","H","I"]}]}',
  '{"type":"SET_LIMIT_FROM_INPUT_MULTIPLIER","inputField":"modelProposedLimit","multiplier":0.6,"floor":400000,"cap":1500000,"reasonCode":"POLICY_OFFER_MATCHED"}');
SELECT pg_temp.seed_credit_rule(103,'APP bureau high cashflow J','{"all":[{"field":"channel","operator":"EQUALS","value":"APP"},{"field":"bureauStatus","operator":"EQUALS","value":"PASS"},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"GREATER_THAN","value":300000},{"field":"grade","operator":"EQUALS","value":"J"}]}',
  '{"type":"SET_LIMIT_FIXED","value":400000,"reasonCode":"POLICY_OFFER_MATCHED"}');
SELECT pg_temp.seed_credit_rule(110,'APP bureau medium cashflow ABC','{"all":[{"field":"channel","operator":"EQUALS","value":"APP"},{"field":"bureauStatus","operator":"EQUALS","value":"PASS"},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"RANGE","lowerValue":100000,"upperValue":300000,"lowerInclusive":true,"upperInclusive":true},{"field":"grade","operator":"IN","values":["A","B","C"]}]}',
  '{"type":"SET_LIMIT_FROM_INPUT_MULTIPLIER","inputField":"modelProposedLimit","multiplier":0.8,"floor":400000,"cap":1500000,"reasonCode":"POLICY_OFFER_MATCHED"}');
SELECT pg_temp.seed_credit_rule(111,'APP bureau medium cashflow DEF','{"all":[{"field":"channel","operator":"EQUALS","value":"APP"},{"field":"bureauStatus","operator":"EQUALS","value":"PASS"},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"RANGE","lowerValue":100000,"upperValue":300000,"lowerInclusive":true,"upperInclusive":true},{"field":"grade","operator":"IN","values":["D","E","F"]}]}',
  '{"type":"SET_LIMIT_FROM_INPUT_MULTIPLIER","inputField":"modelProposedLimit","multiplier":0.6,"floor":400000,"cap":1500000,"reasonCode":"POLICY_OFFER_MATCHED"}');
SELECT pg_temp.seed_credit_rule(112,'APP bureau medium cashflow GHI','{"all":[{"field":"channel","operator":"EQUALS","value":"APP"},{"field":"bureauStatus","operator":"EQUALS","value":"PASS"},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"RANGE","lowerValue":100000,"upperValue":300000,"lowerInclusive":true,"upperInclusive":true},{"field":"grade","operator":"IN","values":["G","H","I"]}]}',
  '{"type":"SET_LIMIT_FROM_INPUT_MULTIPLIER","inputField":"modelProposedLimit","multiplier":0.5,"floor":400000,"cap":1500000,"reasonCode":"POLICY_OFFER_MATCHED"}');
SELECT pg_temp.seed_credit_rule(113,'APP bureau medium cashflow J','{"all":[{"field":"channel","operator":"EQUALS","value":"APP"},{"field":"bureauStatus","operator":"EQUALS","value":"PASS"},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"RANGE","lowerValue":100000,"upperValue":300000,"lowerInclusive":true,"upperInclusive":true},{"field":"grade","operator":"EQUALS","value":"J"}]}',
  '{"type":"SET_LIMIT_FIXED","value":400000,"reasonCode":"POLICY_OFFER_MATCHED"}');
SELECT pg_temp.seed_credit_rule(120,'APP bureau low eligible cashflow','{"all":[{"field":"channel","operator":"EQUALS","value":"APP"},{"field":"bureauStatus","operator":"EQUALS","value":"PASS"},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"RANGE","lowerValue":50000,"upperValue":100000,"lowerInclusive":true,"upperInclusive":false},{"field":"grade","operator":"IN","values":["A","B","C","D","E","F","G","H","I","J"]}]}',
  '{"type":"SET_LIMIT_FIXED","value":400000,"reasonCode":"POLICY_OFFER_MATCHED"}');

SELECT pg_temp.seed_credit_rule(200,'APP no-record high ABC','{"all":[{"field":"channel","operator":"EQUALS","value":"APP"},{"field":"bureauStatus","operator":"EQUALS","value":"NO_RECORD"},{"field":"telecomTenureMonths","dataType":"INTEGER","operator":"GREATER_THAN","value":6},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"GREATER_THAN","value":150000},{"field":"grade","operator":"IN","values":["A","B","C"]}]}',
  '{"type":"SET_LIMIT_FROM_INPUT_MULTIPLIER","inputField":"modelProposedLimit","multiplier":0.6,"floor":400000,"cap":1500000,"reasonCode":"POLICY_OFFER_MATCHED"}');
SELECT pg_temp.seed_credit_rule(201,'APP no-record high DEF','{"all":[{"field":"channel","operator":"EQUALS","value":"APP"},{"field":"bureauStatus","operator":"EQUALS","value":"NO_RECORD"},{"field":"telecomTenureMonths","dataType":"INTEGER","operator":"GREATER_THAN","value":6},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"GREATER_THAN","value":150000},{"field":"grade","operator":"IN","values":["D","E","F"]}]}',
  '{"type":"SET_LIMIT_FROM_INPUT_MULTIPLIER","inputField":"modelProposedLimit","multiplier":0.4,"floor":400000,"cap":1500000,"reasonCode":"POLICY_OFFER_MATCHED"}');
SELECT pg_temp.seed_credit_rule(202,'APP no-record high G-J','{"all":[{"field":"channel","operator":"EQUALS","value":"APP"},{"field":"bureauStatus","operator":"EQUALS","value":"NO_RECORD"},{"field":"telecomTenureMonths","dataType":"INTEGER","operator":"GREATER_THAN","value":6},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"GREATER_THAN","value":150000},{"field":"grade","operator":"IN","values":["G","H","I","J"]}]}',
  '{"type":"SET_LIMIT_FIXED","value":400000,"reasonCode":"POLICY_OFFER_MATCHED"}');
SELECT pg_temp.seed_credit_rule(210,'APP no-record 100-150 A-F','{"all":[{"field":"channel","operator":"EQUALS","value":"APP"},{"field":"bureauStatus","operator":"EQUALS","value":"NO_RECORD"},{"field":"telecomTenureMonths","dataType":"INTEGER","operator":"GREATER_THAN","value":6},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"RANGE","lowerValue":100000,"upperValue":150000,"lowerInclusive":true,"upperInclusive":true},{"field":"grade","operator":"IN","values":["A","B","C","D","E","F"]}]}',
  '{"type":"SET_LIMIT_FIXED","value":400000,"reasonCode":"POLICY_OFFER_MATCHED"}');

SELECT pg_temp.seed_credit_rule(300,'USSD bureau high ABC-DEF','{"all":[{"field":"channel","operator":"EQUALS","value":"USSD"},{"field":"bureauStatus","operator":"EQUALS","value":"PASS"},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"GREATER_THAN","value":300000},{"field":"grade","operator":"IN","values":["A","B","C","D","E","F"]}]}',
  '{"type":"SET_LIMIT_FIXED","value":1000000,"reasonCode":"POLICY_OFFER_MATCHED"}');
SELECT pg_temp.seed_credit_rule(301,'USSD bureau high GHI','{"all":[{"field":"channel","operator":"EQUALS","value":"USSD"},{"field":"bureauStatus","operator":"EQUALS","value":"PASS"},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"GREATER_THAN","value":300000},{"field":"grade","operator":"IN","values":["G","H","I"]}]}',
  '{"type":"SET_LIMIT_FIXED","value":750000,"reasonCode":"POLICY_OFFER_MATCHED"}');
SELECT pg_temp.seed_credit_rule(302,'USSD bureau high J','{"all":[{"field":"channel","operator":"EQUALS","value":"USSD"},{"field":"bureauStatus","operator":"EQUALS","value":"PASS"},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"GREATER_THAN","value":300000},{"field":"grade","operator":"EQUALS","value":"J"}]}',
  '{"type":"SET_LIMIT_FIXED","value":500000,"reasonCode":"POLICY_OFFER_MATCHED"}');
SELECT pg_temp.seed_credit_rule(310,'USSD bureau medium ABC','{"all":[{"field":"channel","operator":"EQUALS","value":"USSD"},{"field":"bureauStatus","operator":"EQUALS","value":"PASS"},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"RANGE","lowerValue":150000,"upperValue":300000,"lowerInclusive":true,"upperInclusive":true},{"field":"grade","operator":"IN","values":["A","B","C"]}]}',
  '{"type":"SET_LIMIT_FIXED","value":1000000,"reasonCode":"POLICY_OFFER_MATCHED"}');
SELECT pg_temp.seed_credit_rule(311,'USSD bureau medium DEF','{"all":[{"field":"channel","operator":"EQUALS","value":"USSD"},{"field":"bureauStatus","operator":"EQUALS","value":"PASS"},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"RANGE","lowerValue":150000,"upperValue":300000,"lowerInclusive":true,"upperInclusive":true},{"field":"grade","operator":"IN","values":["D","E","F"]}]}',
  '{"type":"SET_LIMIT_FIXED","value":750000,"reasonCode":"POLICY_OFFER_MATCHED"}');
SELECT pg_temp.seed_credit_rule(312,'USSD bureau medium GHI','{"all":[{"field":"channel","operator":"EQUALS","value":"USSD"},{"field":"bureauStatus","operator":"EQUALS","value":"PASS"},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"RANGE","lowerValue":150000,"upperValue":300000,"lowerInclusive":true,"upperInclusive":true},{"field":"grade","operator":"IN","values":["G","H","I"]}]}',
  '{"type":"SET_LIMIT_FIXED","value":500000,"reasonCode":"POLICY_OFFER_MATCHED"}');
SELECT pg_temp.seed_credit_rule(313,'USSD bureau medium J','{"all":[{"field":"channel","operator":"EQUALS","value":"USSD"},{"field":"bureauStatus","operator":"EQUALS","value":"PASS"},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"RANGE","lowerValue":150000,"upperValue":300000,"lowerInclusive":true,"upperInclusive":true},{"field":"grade","operator":"EQUALS","value":"J"}]}',
  '{"type":"SET_LIMIT_FIXED","value":400000,"reasonCode":"POLICY_OFFER_MATCHED"}');
SELECT pg_temp.seed_credit_rule(320,'USSD bureau low','{"all":[{"field":"channel","operator":"EQUALS","value":"USSD"},{"field":"bureauStatus","operator":"EQUALS","value":"PASS"},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"RANGE","lowerValue":50000,"upperValue":150000,"lowerInclusive":true,"upperInclusive":false}]}',
  '{"type":"SET_LIMIT_FIXED","value":400000,"reasonCode":"POLICY_OFFER_MATCHED"}');
SELECT pg_temp.seed_credit_rule(330,'USSD no-record high ABC','{"all":[{"field":"channel","operator":"EQUALS","value":"USSD"},{"field":"bureauStatus","operator":"EQUALS","value":"NO_RECORD"},{"field":"telecomTenureMonths","dataType":"INTEGER","operator":"GREATER_THAN","value":12},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"GREATER_THAN","value":300000},{"field":"grade","operator":"IN","values":["A","B","C"]}]}',
  '{"type":"SET_LIMIT_FIXED","value":700000,"reasonCode":"POLICY_OFFER_MATCHED"}');
SELECT pg_temp.seed_credit_rule(331,'USSD no-record high D-I','{"all":[{"field":"channel","operator":"EQUALS","value":"USSD"},{"field":"bureauStatus","operator":"EQUALS","value":"NO_RECORD"},{"field":"telecomTenureMonths","dataType":"INTEGER","operator":"GREATER_THAN","value":12},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"GREATER_THAN","value":300000},{"field":"grade","operator":"IN","values":["D","E","F","G","H","I"]}]}',
  '{"type":"SET_LIMIT_FIXED","value":400000,"reasonCode":"POLICY_OFFER_MATCHED"}');
SELECT pg_temp.seed_credit_rule(340,'USSD no-record medium ABC','{"all":[{"field":"channel","operator":"EQUALS","value":"USSD"},{"field":"bureauStatus","operator":"EQUALS","value":"NO_RECORD"},{"field":"telecomTenureMonths","dataType":"INTEGER","operator":"GREATER_THAN","value":24},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"RANGE","lowerValue":150000,"upperValue":300000,"lowerInclusive":true,"upperInclusive":true},{"field":"grade","operator":"IN","values":["A","B","C"]}]}',
  '{"type":"SET_LIMIT_FIXED","value":600000,"reasonCode":"POLICY_OFFER_MATCHED"}');
SELECT pg_temp.seed_credit_rule(341,'USSD no-record medium D-I','{"all":[{"field":"channel","operator":"EQUALS","value":"USSD"},{"field":"bureauStatus","operator":"EQUALS","value":"NO_RECORD"},{"field":"telecomTenureMonths","dataType":"INTEGER","operator":"GREATER_THAN","value":24},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"RANGE","lowerValue":150000,"upperValue":300000,"lowerInclusive":true,"upperInclusive":true},{"field":"grade","operator":"IN","values":["D","E","F","G","H","I"]}]}',
  '{"type":"SET_LIMIT_FIXED","value":400000,"reasonCode":"POLICY_OFFER_MATCHED"}');
SELECT pg_temp.seed_credit_rule(342,'USSD no-record 100-150 A-F','{"all":[{"field":"channel","operator":"EQUALS","value":"USSD"},{"field":"bureauStatus","operator":"EQUALS","value":"NO_RECORD"},{"field":"telecomTenureMonths","dataType":"INTEGER","operator":"GREATER_THAN","value":24},{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"RANGE","lowerValue":100000,"upperValue":150000,"lowerInclusive":true,"upperInclusive":true},{"field":"grade","operator":"IN","values":["A","B","C","D","E","F"]}]}',
  '{"type":"SET_LIMIT_FIXED","value":400000,"reasonCode":"POLICY_OFFER_MATCHED"}');

SELECT pg_temp.seed_credit_rule(900,'Reject insufficient cash flow','{"field":"dominantCashFlow","dataType":"DECIMAL","operator":"LESS_THAN","value":50000}',
  '{"type":"REJECT","reasonCode":"CASHFLOW_BELOW_MINIMUM"}');
SELECT pg_temp.seed_credit_rule(910,'Reject insufficient no-record tenure','{"all":[{"field":"bureauStatus","operator":"EQUALS","value":"NO_RECORD"},{"field":"telecomTenureMonths","dataType":"INTEGER","operator":"LESS_THAN_OR_EQUAL","value":6}]}',
  '{"type":"REJECT","reasonCode":"TELECOM_TENURE_TOO_SHORT"}');
SELECT pg_temp.seed_credit_rule(999,'Reject unmatched policy leaf','{"field":"grade","operator":"IN","values":["A","B","C","D","E","F","G","H","I","J"]}',
  '{"type":"REJECT","reasonCode":"SCORE_GRADE_NOT_ELIGIBLE"}');

CREATE OR REPLACE FUNCTION public.create_credit_manual_review_case() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_queue uuid;
BEGIN
  IF NEW.outcome='MANUAL_REVIEW' AND (OLD.outcome IS DISTINCT FROM NEW.outcome) AND NOT NEW.simulation THEN
    SELECT id INTO v_queue FROM public.credit_manual_review_queues
    WHERE status='ACTIVE' AND (country_code IS NULL OR country_code=COALESCE(NEW.decision_inputs->>'countryCode',''))
      AND (product_id IS NULL OR product_id=NEW.product_id)
    ORDER BY CASE WHEN product_id=NEW.product_id THEN 0 ELSE 1 END LIMIT 1;
    IF v_queue IS NOT NULL THEN
      INSERT INTO public.credit_manual_review_cases(execution_id,queue_id) VALUES(NEW.id,v_queue)
      ON CONFLICT(execution_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS credit_execution_manual_review_case ON public.credit_rule_executions;
CREATE TRIGGER credit_execution_manual_review_case AFTER UPDATE OF outcome ON public.credit_rule_executions
FOR EACH ROW EXECUTE FUNCTION public.create_credit_manual_review_case();

INSERT INTO public.admin_permissions(code,resource,action,description) VALUES
('credit_reviews.read','credit_reviews','read','View credit manual-review cases and audit history'),
('credit_reviews.recommend','credit_reviews','recommend','Submit a credit manual-review recommendation'),
('credit_reviews.decide','credit_reviews','decide','Approve or reject a recommendation as an independent checker')
ON CONFLICT(code) DO UPDATE SET description=EXCLUDED.description;
INSERT INTO public.admin_role_permissions(role_id,permission_id)
SELECT role.id,permission.id FROM public.admin_roles role CROSS JOIN public.admin_permissions permission
WHERE role.code='super_admin' AND permission.code LIKE 'credit_reviews.%' ON CONFLICT DO NOTHING;

COMMIT;
