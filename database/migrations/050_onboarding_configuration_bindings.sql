BEGIN;

CREATE TABLE onboarding.configuration_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  configuration_type varchar(40) NOT NULL,
  code varchar(80) NOT NULL,
  name varchar(160) NOT NULL,
  description text NULL,
  created_by varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_ONBOARDING_CONFIGURATION_TYPE" CHECK (
    configuration_type IN ('CONSENT','CUSTOMER_FORM','KYC')
  ),
  CONSTRAINT "CK_ONBOARDING_CONFIGURATION_CODE" CHECK (code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  CONSTRAINT "UQ_ONBOARDING_CONFIGURATION_CODE" UNIQUE (tenant_id,configuration_type,code),
  CONSTRAINT "UQ_ONBOARDING_CONFIGURATION_ID_TENANT" UNIQUE (id,tenant_id)
);

CREATE TABLE onboarding.configuration_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  configuration_definition_id uuid NOT NULL
    REFERENCES onboarding.configuration_definitions(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'DRAFT',
  country_code char(3) NOT NULL,
  channel_code varchar(40) NULL REFERENCES onboarding.channels(code) ON DELETE RESTRICT,
  customer_type varchar(32) NOT NULL DEFAULT 'INDIVIDUAL',
  locale varchar(16) NULL,
  configuration jsonb NOT NULL,
  content_hash char(64) NOT NULL,
  effective_from timestamptz NULL,
  effective_to timestamptz NULL,
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
  CONSTRAINT "CK_ONBOARDING_CONFIGURATION_VERSION" CHECK (version_number > 0),
  CONSTRAINT "CK_ONBOARDING_CONFIGURATION_STATUS" CHECK (
    status IN ('DRAFT','SUBMITTED','APPROVED','ACTIVE','REJECTED','RETIRED')
  ),
  CONSTRAINT "CK_ONBOARDING_CONFIGURATION_COUNTRY" CHECK (country_code ~ '^[A-Z]{3}$'),
  CONSTRAINT "CK_ONBOARDING_CONFIGURATION_PAYLOAD" CHECK (jsonb_typeof(configuration)='object'),
  CONSTRAINT "CK_ONBOARDING_CONFIGURATION_HASH" CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "CK_ONBOARDING_CONFIGURATION_PERIOD" CHECK (
    effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from
  ),
  CONSTRAINT "CK_ONBOARDING_CONFIGURATION_CHECKER" CHECK (
    approved_by IS NULL OR lower(approved_by) <> lower(COALESCE(modified_by,created_by))
  ),
  CONSTRAINT "UQ_ONBOARDING_CONFIGURATION_VERSION" UNIQUE (
    configuration_definition_id,version_number
  )
);

CREATE INDEX "IDX_ONBOARDING_CONFIGURATION_LOOKUP"
  ON onboarding.configuration_versions(
    configuration_definition_id,status,country_code,channel_code,customer_type
  );

CREATE UNIQUE INDEX "UQ_ONBOARDING_CONFIGURATION_ACTIVE_SCOPE"
  ON onboarding.configuration_versions(
    configuration_definition_id,country_code,COALESCE(channel_code,''),customer_type
  ) WHERE status='ACTIVE';

ALTER TABLE onboarding.otp_policies
  ADD COLUMN code varchar(80) NULL,
  ADD COLUMN version_number integer NOT NULL DEFAULT 1,
  ADD COLUMN status varchar(24) NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN modified_by varchar(100) NULL,
  ADD COLUMN approved_by varchar(100) NULL,
  ADD COLUMN submitted_at timestamptz NULL,
  ADD COLUMN approved_at timestamptz NULL,
  ADD COLUMN activated_at timestamptz NULL,
  ADD CONSTRAINT "CK_ONBOARDING_OTP_CODE" CHECK (code IS NULL OR code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  ADD CONSTRAINT "CK_ONBOARDING_OTP_VERSION" CHECK (version_number > 0),
  ADD CONSTRAINT "CK_ONBOARDING_OTP_STATUS" CHECK (
    status IN ('DRAFT','SUBMITTED','APPROVED','ACTIVE','REJECTED','RETIRED')
  ),
  ADD CONSTRAINT "CK_ONBOARDING_OTP_CHECKER" CHECK (
    approved_by IS NULL OR lower(approved_by) <> lower(COALESCE(modified_by,created_by))
  ),
  ADD CONSTRAINT "UQ_ONBOARDING_OTP_CODE_VERSION" UNIQUE (tenant_id,code,version_number);

UPDATE onboarding.otp_policies
SET code=COALESCE(code,'LEGACY_' || replace(id::text,'-','')),
    status=CASE WHEN is_active THEN 'ACTIVE' ELSE 'DRAFT' END
WHERE code IS NULL;

ALTER TABLE onboarding.otp_policies ALTER COLUMN code SET NOT NULL;
ALTER TABLE onboarding.otp_policies
  ADD CONSTRAINT "CK_ONBOARDING_OTP_ACTIVE_STATE" CHECK (is_active=(status='ACTIVE'));

CREATE TABLE onboarding.wallet_product_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  code varchar(80) NOT NULL,
  version_number integer NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'DRAFT',
  country_code char(3) NOT NULL,
  channel_code varchar(40) NULL REFERENCES onboarding.channels(code) ON DELETE RESTRICT,
  customer_type varchar(32) NOT NULL DEFAULT 'INDIVIDUAL',
  wallet_type integer NOT NULL,
  currency char(3) NOT NULL,
  product_code varchar(100) NOT NULL,
  pricing_rule_code varchar(64) NULL,
  charge_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  commission_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  external_product_reference varchar(160) NULL,
  created_by varchar(100) NOT NULL,
  modified_by varchar(100) NULL,
  approved_by varchar(100) NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at timestamptz NULL,
  activated_at timestamptz NULL,
  CONSTRAINT "CK_ONBOARDING_WALLET_BINDING_CODE" CHECK (code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  CONSTRAINT "CK_ONBOARDING_WALLET_BINDING_VERSION" CHECK (version_number > 0),
  CONSTRAINT "CK_ONBOARDING_WALLET_BINDING_STATUS" CHECK (
    status IN ('DRAFT','SUBMITTED','APPROVED','ACTIVE','REJECTED','RETIRED')
  ),
  CONSTRAINT "CK_ONBOARDING_WALLET_BINDING_COUNTRY" CHECK (country_code ~ '^[A-Z]{3}$'),
  CONSTRAINT "CK_ONBOARDING_WALLET_BINDING_CURRENCY" CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT "CK_ONBOARDING_WALLET_BINDING_CHARGES" CHECK (jsonb_typeof(charge_codes)='array'),
  CONSTRAINT "CK_ONBOARDING_WALLET_BINDING_COMMISSIONS" CHECK (jsonb_typeof(commission_codes)='array'),
  CONSTRAINT "CK_ONBOARDING_WALLET_BINDING_CHECKER" CHECK (
    approved_by IS NULL OR lower(approved_by) <> lower(COALESCE(modified_by,created_by))
  ),
  CONSTRAINT "UQ_ONBOARDING_WALLET_BINDING_VERSION" UNIQUE (tenant_id,code,version_number)
);

CREATE UNIQUE INDEX "UQ_ONBOARDING_WALLET_BINDING_ACTIVE_SCOPE"
  ON onboarding.wallet_product_bindings(
    tenant_id,code,country_code,COALESCE(channel_code,''),customer_type
  ) WHERE status='ACTIVE';

ALTER TABLE onboarding.wallet_product_bindings ADD CONSTRAINT "FK_ONBOARDING_WALLET_BINDING_TYPE"
  FOREIGN KEY (wallet_type) REFERENCES public."SW_TBL_WALLET_TYPE"("Wallet_ID") ON DELETE RESTRICT;

INSERT INTO onboarding.otp_policies(
  id,tenant_id,code,version_number,status,country_code,channel_code,
  expiry_seconds,maximum_attempts,resend_seconds,maximum_sends_per_hour,
  is_active,created_by,modified_by,approved_by,submitted_at,approved_at,activated_at
) VALUES(
  '00000000-0000-4000-8300-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'UGA_MOBILE_CUSTOMER_OTP',1,'ACTIVE','UGA','MOBILE_APP',
  300,5,60,5,true,'bootstrap-maker','bootstrap-maker','bootstrap-checker',
  CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
) ON CONFLICT(tenant_id,country_code,channel_code) DO UPDATE SET
  code=EXCLUDED.code,version_number=EXCLUDED.version_number,status=EXCLUDED.status,
  expiry_seconds=EXCLUDED.expiry_seconds,maximum_attempts=EXCLUDED.maximum_attempts,
  resend_seconds=EXCLUDED.resend_seconds,maximum_sends_per_hour=EXCLUDED.maximum_sends_per_hour,
  is_active=EXCLUDED.is_active,modified_by=EXCLUDED.modified_by,
  approved_by=EXCLUDED.approved_by,submitted_at=EXCLUDED.submitted_at,
  approved_at=EXCLUDED.approved_at,activated_at=EXCLUDED.activated_at;

INSERT INTO onboarding.configuration_definitions(
  id,tenant_id,configuration_type,code,name,description,created_by
) VALUES
  ('00000000-0000-4000-8301-000000000001','00000000-0000-4000-8000-000000000001',
   'CONSENT','UGA_CUSTOMER_DATA_AND_CREDIT_CONSENT','Uganda customer data and credit consent',
   'Draft legal copy for identity verification, account creation and credit assessment.','bootstrap-maker'),
  ('00000000-0000-4000-8303-000000000001','00000000-0000-4000-8000-000000000001',
   'CUSTOMER_FORM','UGA_INDIVIDUAL_PROFILE','Uganda individual customer profile',
   'Pre-KYC customer-declared profile fields.','bootstrap-maker'),
  ('00000000-0000-4000-8305-000000000001','00000000-0000-4000-8000-000000000001',
   'KYC','UGA_NID_OCR_LIVENESS','Uganda NID OCR and liveness',
   'FINIFY KYC workflow requiring NID capture, OCR and liveness.','bootstrap-maker')
ON CONFLICT(tenant_id,configuration_type,code) DO NOTHING;

INSERT INTO onboarding.configuration_versions(
  id,configuration_definition_id,version_number,status,country_code,channel_code,
  customer_type,locale,configuration,content_hash,created_by,modified_by
) VALUES
  ('00000000-0000-4000-8302-000000000001','00000000-0000-4000-8301-000000000001',1,'DRAFT',
   'UGA','MOBILE_APP','INDIVIDUAL','en-UG',
   '{"title":"Customer data and credit assessment consent","purposeCodes":["IDENTITY_VERIFICATION","ACCOUNT_CREATION","CREDIT_SCORING","CREDIT_DECISION"],"requiresAffirmativeAction":true,"withdrawalSupported":true,"legalTextReviewRequired":true}'::jsonb,
   encode(digest('{"title":"Customer data and credit assessment consent","purposeCodes":["IDENTITY_VERIFICATION","ACCOUNT_CREATION","CREDIT_SCORING","CREDIT_DECISION"],"requiresAffirmativeAction":true,"withdrawalSupported":true,"legalTextReviewRequired":true}','sha256'),'hex'),
   'bootstrap-maker','bootstrap-maker'),
  ('00000000-0000-4000-8304-000000000001','00000000-0000-4000-8303-000000000001',1,'DRAFT',
   'UGA','MOBILE_APP','INDIVIDUAL','en-UG',
   '{"fields":[{"key":"givenName","type":"TEXT","required":true},{"key":"familyName","type":"TEXT","required":true},{"key":"dateOfBirth","type":"DATE","required":true},{"key":"nationality","type":"COUNTRY","required":true},{"key":"residentialAddress","type":"ADDRESS","required":true},{"key":"occupation","type":"TEXT","required":true},{"key":"sourceOfIncome","type":"SELECT","required":true}],"additionalProperties":false}'::jsonb,
   encode(digest('{"fields":[{"key":"givenName","type":"TEXT","required":true},{"key":"familyName","type":"TEXT","required":true},{"key":"dateOfBirth","type":"DATE","required":true},{"key":"nationality","type":"COUNTRY","required":true},{"key":"residentialAddress","type":"ADDRESS","required":true},{"key":"occupation","type":"TEXT","required":true},{"key":"sourceOfIncome","type":"SELECT","required":true}],"additionalProperties":false}','sha256'),'hex'),
   'bootstrap-maker','bootstrap-maker'),
  ('00000000-0000-4000-8306-000000000001','00000000-0000-4000-8305-000000000001',1,'DRAFT',
   'UGA','MOBILE_APP','INDIVIDUAL','en-UG',
   '{"documentTypes":["NATIONAL_ID"],"requiredEvidence":["ID_FRONT","ID_BACK","SELFIE"],"ocrRequired":true,"livenessRequired":true,"faceMatchRequired":true,"faceMatchThreshold":null,"sanctionsScreeningRequired":true,"manualReviewOnUncertainResult":true}'::jsonb,
   encode(digest('{"documentTypes":["NATIONAL_ID"],"requiredEvidence":["ID_FRONT","ID_BACK","SELFIE"],"ocrRequired":true,"livenessRequired":true,"faceMatchRequired":true,"faceMatchThreshold":null,"sanctionsScreeningRequired":true,"manualReviewOnUncertainResult":true}','sha256'),'hex'),
   'bootstrap-maker','bootstrap-maker')
ON CONFLICT(configuration_definition_id,version_number) DO NOTHING;

INSERT INTO onboarding.wallet_product_bindings(
  id,tenant_id,code,version_number,status,country_code,channel_code,customer_type,
  wallet_type,currency,product_code,pricing_rule_code,charge_codes,commission_codes,
  external_product_reference,created_by,modified_by
) VALUES(
  '00000000-0000-4000-8309-000000000001','00000000-0000-4000-8000-000000000001',
  'UGA_RETAIL_CUSTOMER_WALLET',1,'DRAFT','UGA','MOBILE_APP','INDIVIDUAL',
  103,'UGX','UGA_RETAIL_CREDIT',NULL,'[]'::jsonb,'[]'::jsonb,NULL,
  'bootstrap-maker','bootstrap-maker'
) ON CONFLICT(tenant_id,code,version_number) DO NOTHING;

INSERT INTO public.credit_http_integrations(
  code,name,method,url_template,request_template,auth_type,auth_header,auth_secret_env,
  timeout_ms,cache_ttl_seconds,is_active,created_by
) VALUES(
  'FINIFY_SCORE_MODEL_API','FINIFY score model API','POST',
  'http://score-model:8080/v1/scores',
  '{"customerId":"{{customerId}}","applicationId":"{{applicationId}}"}'::jsonb,
  'BEARER','Authorization','FINIFY_SCORE_MODEL_API_TOKEN',10000,0,false,'bootstrap-maker'
) ON CONFLICT(code) DO NOTHING;

INSERT INTO public.credit_score_providers(
  code,name,http_integration_id,score_response_path,category_response_path,
  model_id_response_path,model_version_response_path,reference_response_path,
  scored_at_response_path,score_min,score_max,validity_minutes,is_default,is_active,created_by
)
SELECT 'FINIFY_SCORE_MODEL_UGA_V1','FINIFY Uganda score model v1',integration.id,
       'score','grade','modelId','modelVersion','reference','scoredAt',
       NULL,NULL,43200,true,false,'bootstrap-maker'
FROM public.credit_http_integrations integration
WHERE integration.code='FINIFY_SCORE_MODEL_API'
ON CONFLICT(code) DO NOTHING;

INSERT INTO public.credit_master_rules(
  rule_code,version,name,customer_category,product_id,currency,
  base_limit,minimum_limit,maximum_limit,default_outcome,auto_approval_enabled,
  default_repayment_option_ids,score_provider_id,status,created_by
)
SELECT 'UGA_RETAIL_CREDIT_POLICY',1,'Uganda retail credit policy v1','INDIVIDUAL',
       'UGA_RETAIL_CREDIT','UGX',0,0,1,'MANUAL_REVIEW',false,'[]'::jsonb,
       provider.id,'DRAFT','bootstrap-maker'
FROM public.credit_score_providers provider
WHERE provider.code='FINIFY_SCORE_MODEL_UGA_V1'
ON CONFLICT(rule_code,version) DO NOTHING;

UPDATE public.credit_master_rules
SET rejection_reason='Configuration baseline only: approve product limits and decision-tree rules before activation.'
WHERE rule_code='UGA_RETAIL_CREDIT_POLICY' AND version=1 AND status='DRAFT';

UPDATE onboarding.journey_nodes
SET configuration=jsonb_build_object(
  'policyId',policy.id,
  'policyCode',policy.code,
  'policyVersion',policy.version_number
)
FROM onboarding.otp_policies policy
WHERE journey_version_id='00000000-0000-4000-8004-000000000001' AND node_key='otp'
  AND policy.tenant_id='00000000-0000-4000-8000-000000000001'
  AND policy.code='UGA_MOBILE_CUSTOMER_OTP' AND policy.version_number=1;

UPDATE onboarding.journey_nodes
SET configuration='{"consentVersionId":"00000000-0000-4000-8302-000000000001"}'::jsonb
WHERE journey_version_id='00000000-0000-4000-8004-000000000001' AND node_key='consent';

UPDATE onboarding.journey_nodes
SET configuration='{"formVersionId":"00000000-0000-4000-8304-000000000001"}'::jsonb
WHERE journey_version_id='00000000-0000-4000-8004-000000000001' AND node_key='profile';

UPDATE onboarding.journey_nodes
SET configuration='{"kycConfigurationVersionId":"00000000-0000-4000-8306-000000000001"}'::jsonb
WHERE journey_version_id='00000000-0000-4000-8004-000000000001' AND node_key='kyc';

UPDATE onboarding.journey_nodes
SET configuration='{"walletProductBindingId":"00000000-0000-4000-8309-000000000001","walletType":103,"currency":"UGX","productCode":"UGA_RETAIL_CREDIT"}'::jsonb
WHERE journey_version_id='00000000-0000-4000-8004-000000000001' AND node_key='wallet';

UPDATE onboarding.journey_nodes
SET configuration='{"providerCode":"FINIFY_SCORE_MODEL_UGA_V1"}'::jsonb
WHERE journey_version_id='00000000-0000-4000-8004-000000000001' AND node_key='score';

UPDATE onboarding.journey_nodes
SET configuration='{"policyCode":"UGA_RETAIL_CREDIT_POLICY","policyVersion":1}'::jsonb
WHERE journey_version_id='00000000-0000-4000-8004-000000000001' AND node_key='policy';

UPDATE onboarding.journey_versions
SET revision=revision+1,
    change_summary='Bound to governed UGA onboarding configuration baselines. Consent, form, KYC, wallet/product, score provider and credit policy require approval before journey submission.',
    modified_by='bootstrap-maker',updated_at=CURRENT_TIMESTAMP
WHERE id='00000000-0000-4000-8004-000000000001' AND status='DRAFT';

COMMIT;
