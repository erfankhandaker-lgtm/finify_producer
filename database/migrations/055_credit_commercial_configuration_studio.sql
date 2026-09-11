BEGIN;

ALTER TABLE public.credit_product_bindings
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS environment_scope varchar(16) NOT NULL DEFAULT 'PRODUCTION',
  ADD COLUMN IF NOT EXISTS fineract_tenant varchar(100) NULL,
  ADD COLUMN IF NOT EXISTS fineract_product_id bigint NULL,
  ADD COLUMN IF NOT EXISTS fineract_product_name varchar(200) NULL,
  ADD COLUMN IF NOT EXISTS nominal_interest_rate numeric(12,8) NULL,
  ADD COLUMN IF NOT EXISTS interest_rate_period varchar(16) NULL,
  ADD COLUMN IF NOT EXISTS repayment_frequency integer NULL,
  ADD COLUMN IF NOT EXISTS repayment_frequency_type varchar(16) NULL,
  ADD COLUMN IF NOT EXISTS minimum_repayments integer NULL,
  ADD COLUMN IF NOT EXISTS default_repayments integer NULL,
  ADD COLUMN IF NOT EXISTS maximum_repayments integer NULL,
  ADD COLUMN IF NOT EXISTS modified_by text NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS rejected_by text NULL,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text NULL;

ALTER TABLE public.credit_product_bindings DROP CONSTRAINT IF EXISTS "CK_CREDIT_BINDING_STATUS";
ALTER TABLE public.credit_product_bindings ADD CONSTRAINT "CK_CREDIT_BINDING_STATUS"
  CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','TEST_ACTIVE','ACTIVE','REJECTED','RETIRED'));
ALTER TABLE public.credit_product_bindings DROP CONSTRAINT IF EXISTS "CK_CREDIT_BINDING_ENVIRONMENT";
ALTER TABLE public.credit_product_bindings ADD CONSTRAINT "CK_CREDIT_BINDING_ENVIRONMENT"
  CHECK (environment_scope IN ('TEST','PRODUCTION'));
ALTER TABLE public.credit_product_bindings DROP CONSTRAINT IF EXISTS "CK_CREDIT_BINDING_RATE_PERIOD";
ALTER TABLE public.credit_product_bindings ADD CONSTRAINT "CK_CREDIT_BINDING_RATE_PERIOD"
  CHECK (interest_rate_period IS NULL OR interest_rate_period IN ('DAILY','MONTHLY','ANNUAL'));
ALTER TABLE public.credit_product_bindings DROP CONSTRAINT IF EXISTS "CK_CREDIT_BINDING_REPAYMENT";
ALTER TABLE public.credit_product_bindings ADD CONSTRAINT "CK_CREDIT_BINDING_REPAYMENT" CHECK (
  repayment_frequency IS NULL OR (
    repayment_frequency > 0
    AND repayment_frequency_type IN ('DAYS','WEEKS','MONTHS')
    AND minimum_repayments > 0
    AND default_repayments BETWEEN minimum_repayments AND maximum_repayments
  )
);
ALTER TABLE public.credit_product_bindings DROP CONSTRAINT IF EXISTS "CK_CREDIT_BINDING_ACTIVE_COMPLETE";
ALTER TABLE public.credit_product_bindings ADD CONSTRAINT "CK_CREDIT_BINDING_ACTIVE_COMPLETE" CHECK (
  status NOT IN ('ACTIVE','TEST_ACTIVE') OR (
    lender_id IS NOT NULL AND pricing_rule_code IS NOT NULL AND interest_method IS NOT NULL
    AND annual_interest_rate IS NOT NULL AND nominal_interest_rate IS NOT NULL
    AND interest_rate_period IS NOT NULL AND fineract_product_id IS NOT NULL
    AND early_settlement_allowed IS NOT NULL AND jsonb_array_length(activation_blockers)=0
    AND ((environment_scope='PRODUCTION' AND status='ACTIVE') OR (environment_scope='TEST' AND status='TEST_ACTIVE'))
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_CREDIT_BINDING_TEST_ACTIVE_SCOPE"
  ON public.credit_product_bindings(product_id,country_code,currency,COALESCE(channel,''))
  WHERE status='TEST_ACTIVE';

CREATE TABLE IF NOT EXISTS public.credit_commercial_configuration_audit (
  id bigserial PRIMARY KEY,
  binding_id uuid NOT NULL REFERENCES public.credit_product_bindings(id) ON DELETE RESTRICT,
  action varchar(30) NOT NULL,
  actor_id text NOT NULL,
  previous_state jsonb NULL,
  new_state jsonb NOT NULL,
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "IDX_CREDIT_COMMERCIAL_AUDIT_BINDING"
  ON public.credit_commercial_configuration_audit(binding_id,created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION public.credit_commercial_configuration_view(p_binding_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT to_jsonb(result) FROM (
    SELECT binding.id::text AS id,binding.code,binding.version,binding.revision,
      binding.status,binding.environment_scope AS "environmentScope",
      binding.product_id AS "productId",binding.country_code AS "countryCode",binding.currency,
      binding.channel,binding.wallet_type_code::integer AS "customerWalletTypeCode",
      lender.settlement_wallet_type_code AS "settlementWalletTypeCode",
      merchant.id::text AS "merchantId",merchant.code AS "merchantCode",merchant.display_name AS "merchantName",
      lender.id::text AS "lenderId",lender.code AS "lenderCode",lender.name AS "lenderName",
      lender.allocation_weight AS "allocationWeight",
      binding.fineract_tenant AS "fineractTenant",binding.fineract_product_id AS "fineractProductId",
      binding.fineract_product_name AS "fineractProductName",binding.pricing_rule_code AS "pricingRuleCode",
      binding.interest_method AS "interestMethod",binding.nominal_interest_rate AS "nominalInterestRate",
      binding.interest_rate_period AS "interestRatePeriod",binding.annual_interest_rate AS "annualInterestRate",
      binding.repayment_frequency AS "repaymentFrequency",
      binding.repayment_frequency_type AS "repaymentFrequencyType",
      binding.minimum_repayments AS "minimumRepayments",binding.default_repayments AS "defaultRepayments",
      binding.maximum_repayments AS "maximumRepayments",
      binding.processing_fee_type AS "processingFeeType",binding.processing_fee_value AS "processingFeeValue",
      binding.late_fee_type AS "lateFeeType",binding.late_fee_value AS "lateFeeValue",
      binding.early_settlement_allowed AS "earlySettlementAllowed",
      binding.early_settlement_fee_type AS "earlySettlementFeeType",
      binding.early_settlement_fee_value AS "earlySettlementFeeValue",
      binding.charge_codes AS "chargeCodes",binding.commission_codes AS "commissionCodes",
      binding.activation_blockers AS "activationBlockers",binding.source_reference AS "sourceReference",
      binding.created_by AS "createdBy",binding.created_at AS "createdAt",
      binding.modified_by AS "modifiedBy",binding.updated_at AS "updatedAt",
      binding.approved_by AS "approvedBy",binding.approved_at AS "approvedAt",
      binding.activated_by AS "activatedBy",binding.activated_at AS "activatedAt",
      binding.rejected_by AS "rejectedBy",binding.rejected_at AS "rejectedAt",
      binding.rejection_reason AS "rejectionReason"
    FROM public.credit_product_bindings binding
    LEFT JOIN public.credit_lenders lender ON lender.id=binding.lender_id
    LEFT JOIN public.business_merchants merchant ON merchant.id=lender.merchant_id
    WHERE binding.id=p_binding_id
  ) result
$$;

CREATE OR REPLACE FUNCTION public.apply_credit_commercial_configuration(
  p_binding_id uuid,p_expected_revision integer,p_actor text,p_configuration jsonb
) RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE
  v_binding public.credit_product_bindings%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
  v_merchant public.business_merchants%ROWTYPE;
  v_lender public.credit_lenders%ROWTYPE;
  v_customer_wallet integer;
  v_settlement_wallet integer;
  v_rate numeric;
  v_rate_period text;
  v_annual_rate numeric;
  v_charge_codes jsonb;
  v_commission_codes jsonb;
  v_blockers jsonb := '[]'::jsonb;
BEGIN
  IF COALESCE(btrim(p_actor),'')='' THEN RAISE EXCEPTION 'Actor is required' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_configuration)<>'object' THEN RAISE EXCEPTION 'Configuration must be a JSON object' USING ERRCODE='22023'; END IF;

  SELECT * INTO v_binding FROM public.credit_product_bindings WHERE id=p_binding_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commercial configuration was not found' USING ERRCODE='P0002'; END IF;
  IF v_binding.revision<>p_expected_revision THEN
    RAISE EXCEPTION 'Commercial configuration changed; current revision is %',v_binding.revision USING ERRCODE='40001';
  END IF;
  IF v_binding.status NOT IN ('DRAFT','REJECTED','TEST_ACTIVE') THEN
    RAISE EXCEPTION 'Only draft, rejected, or test-active configurations can be edited' USING ERRCODE='55000';
  END IF;
  v_before:=public.credit_commercial_configuration_view(p_binding_id);

  SELECT * INTO v_merchant FROM public.business_merchants
   WHERE id=(p_configuration->>'merchantId')::uuid AND merchant_type_code='BANK' AND status='ACTIVE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'An active bank merchant is required' USING ERRCODE='23503'; END IF;
  SELECT * INTO v_lender FROM public.credit_lenders
   WHERE id=(p_configuration->>'lenderId')::uuid AND merchant_id=v_merchant.id AND status='ACTIVE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'An active lender belonging to the selected bank is required' USING ERRCODE='23503'; END IF;
  IF v_merchant.country_code<>upper(p_configuration->>'countryCode') OR v_lender.country_code<>upper(p_configuration->>'countryCode') THEN
    RAISE EXCEPTION 'Bank, lender, and product binding must use the same country' USING ERRCODE='23514';
  END IF;

  v_customer_wallet:=(p_configuration->>'customerWalletTypeCode')::integer;
  v_settlement_wallet:=(p_configuration->>'settlementWalletTypeCode')::integer;
  IF NOT EXISTS(SELECT 1 FROM public."SW_TBL_WALLET_TYPE" WHERE "Wallet_ID"=v_customer_wallet AND "Status" AND "Wallet_Type"=100) THEN
    RAISE EXCEPTION 'An active customer wallet type is required' USING ERRCODE='23503';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public."SW_TBL_WALLET_TYPE" WHERE "Wallet_ID"=v_settlement_wallet AND "Status" AND "Wallet_Type"=200) THEN
    RAISE EXCEPTION 'An active merchant settlement wallet type is required' USING ERRCODE='23503';
  END IF;

  v_rate:=(p_configuration->>'nominalInterestRate')::numeric;
  v_rate_period:=upper(p_configuration->>'interestRatePeriod');
  IF v_rate<0 OR v_rate_period NOT IN ('DAILY','MONTHLY','ANNUAL') THEN
    RAISE EXCEPTION 'Interest rate and period are invalid' USING ERRCODE='22023';
  END IF;
  v_annual_rate:=CASE v_rate_period WHEN 'DAILY' THEN v_rate*365 WHEN 'MONTHLY' THEN v_rate*12 ELSE v_rate END;
  v_charge_codes:=COALESCE(p_configuration->'chargeCodes','[]'::jsonb);
  v_commission_codes:=COALESCE(p_configuration->'commissionCodes','[]'::jsonb);
  IF jsonb_typeof(v_charge_codes)<>'array' OR jsonb_typeof(v_commission_codes)<>'array' THEN
    RAISE EXCEPTION 'Charge and commission codes must be arrays' USING ERRCODE='22023';
  END IF;

  IF NULLIF(p_configuration->>'fineractProductId','') IS NULL THEN v_blockers:=v_blockers||'"FINERACT_PRODUCT_NOT_SELECTED"'::jsonb; END IF;
  IF COALESCE(btrim(p_configuration->>'pricingRuleCode'),'')='' THEN v_blockers:=v_blockers||'"PRICING_RULE_NOT_DEFINED"'::jsonb; END IF;
  IF NULLIF(p_configuration->>'processingFeeValue','') IS NULL THEN v_blockers:=v_blockers||'"PROCESSING_FEE_NOT_DEFINED"'::jsonb; END IF;
  IF NULLIF(p_configuration->>'lateFeeValue','') IS NULL THEN v_blockers:=v_blockers||'"LATE_FEE_NOT_DEFINED"'::jsonb; END IF;
  IF NOT (p_configuration ? 'earlySettlementAllowed') THEN v_blockers:=v_blockers||'"EARLY_SETTLEMENT_NOT_DEFINED"'::jsonb; END IF;
  IF jsonb_array_length(v_charge_codes)=0 THEN v_blockers:=v_blockers||'"CHARGES_NOT_DEFINED"'::jsonb; END IF;
  IF jsonb_array_length(v_commission_codes)=0 THEN v_blockers:=v_blockers||'"COMMISSION_NOT_DEFINED"'::jsonb; END IF;

  UPDATE public.business_merchants SET default_wallet_type_code=v_settlement_wallet,
    updated_by=p_actor,updated_at=CURRENT_TIMESTAMP WHERE id=v_merchant.id;
  UPDATE public.credit_lenders SET settlement_wallet_type_code=v_settlement_wallet,
    allocation_weight=(p_configuration->>'allocationWeight')::numeric WHERE id=v_lender.id;
  UPDATE public.credit_product_bindings SET
    product_id=upper(p_configuration->>'productId'),country_code=upper(p_configuration->>'countryCode'),
    currency=upper(p_configuration->>'currency'),channel=NULLIF(upper(p_configuration->>'channel'),'ALL'),
    wallet_type_code=v_customer_wallet::text,lender_id=v_lender.id,
    environment_scope=upper(p_configuration->>'environmentScope'),
    fineract_tenant=NULLIF(p_configuration->>'fineractTenant',''),
    fineract_product_id=NULLIF(p_configuration->>'fineractProductId','')::bigint,
    fineract_product_name=NULLIF(p_configuration->>'fineractProductName',''),
    pricing_rule_code=NULLIF(upper(p_configuration->>'pricingRuleCode'),''),
    interest_method=upper(p_configuration->>'interestMethod'),nominal_interest_rate=v_rate,
    interest_rate_period=v_rate_period,annual_interest_rate=v_annual_rate,
    repayment_frequency=(p_configuration->>'repaymentFrequency')::integer,
    repayment_frequency_type=upper(p_configuration->>'repaymentFrequencyType'),
    minimum_repayments=(p_configuration->>'minimumRepayments')::integer,
    default_repayments=(p_configuration->>'defaultRepayments')::integer,
    maximum_repayments=(p_configuration->>'maximumRepayments')::integer,
    processing_fee_type=upper(p_configuration->>'processingFeeType'),
    processing_fee_value=(p_configuration->>'processingFeeValue')::numeric,
    late_fee_type=upper(p_configuration->>'lateFeeType'),late_fee_value=(p_configuration->>'lateFeeValue')::numeric,
    early_settlement_allowed=(p_configuration->>'earlySettlementAllowed')::boolean,
    early_settlement_fee_type=upper(p_configuration->>'earlySettlementFeeType'),
    early_settlement_fee_value=(p_configuration->>'earlySettlementFeeValue')::numeric,
    charge_codes=v_charge_codes,commission_codes=v_commission_codes,activation_blockers=v_blockers,
    source_reference=p_configuration->>'sourceReference',status='DRAFT',revision=revision+1,
    modified_by=p_actor,updated_at=CURRENT_TIMESTAMP,approved_by=NULL,approved_at=NULL,
    activated_by=NULL,activated_at=NULL,rejected_by=NULL,rejected_at=NULL,rejection_reason=NULL
  WHERE id=p_binding_id;

  v_after:=public.credit_commercial_configuration_view(p_binding_id);
  INSERT INTO public.credit_commercial_configuration_audit(binding_id,action,actor_id,previous_state,new_state)
  VALUES(p_binding_id,'SAVE',p_actor,v_before,v_after);
  RETURN v_after;
END $$;

CREATE OR REPLACE FUNCTION public.transition_credit_commercial_configuration(
  p_binding_id uuid,p_expected_revision integer,p_action text,p_actor text,p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_binding public.credit_product_bindings%ROWTYPE;v_before jsonb;v_after jsonb;v_target text;v_action text:=upper(p_action);
BEGIN
  SELECT * INTO v_binding FROM public.credit_product_bindings WHERE id=p_binding_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commercial configuration was not found' USING ERRCODE='P0002'; END IF;
  IF v_binding.revision<>p_expected_revision THEN RAISE EXCEPTION 'Commercial configuration changed; current revision is %',v_binding.revision USING ERRCODE='40001'; END IF;
  IF COALESCE(btrim(p_actor),'')='' THEN RAISE EXCEPTION 'Actor is required' USING ERRCODE='22023'; END IF;
  v_before:=public.credit_commercial_configuration_view(p_binding_id);
  IF v_action='SUBMIT' THEN
    IF v_binding.status NOT IN ('DRAFT','REJECTED') THEN RAISE EXCEPTION 'Only draft or rejected configurations can be submitted' USING ERRCODE='55000'; END IF;
    IF jsonb_array_length(v_binding.activation_blockers)>0 THEN RAISE EXCEPTION 'Resolve all activation blockers before submission' USING ERRCODE='23514'; END IF;
    v_target:='PENDING_APPROVAL';
  ELSIF v_action='APPROVE' THEN
    IF v_binding.status<>'PENDING_APPROVAL' THEN RAISE EXCEPTION 'Only pending configurations can be approved' USING ERRCODE='55000'; END IF;
    IF lower(p_actor)=lower(COALESCE(v_binding.modified_by,v_binding.created_by)) THEN RAISE EXCEPTION 'Maker and checker must be different administrators' USING ERRCODE='42501'; END IF;
    v_target:='APPROVED';
  ELSIF v_action='ACTIVATE' THEN
    IF v_binding.status<>'APPROVED' THEN RAISE EXCEPTION 'Only approved configurations can be activated' USING ERRCODE='55000'; END IF;
    IF jsonb_array_length(v_binding.activation_blockers)>0 THEN RAISE EXCEPTION 'Blocked configurations cannot be activated' USING ERRCODE='23514'; END IF;
    v_target:=CASE WHEN v_binding.environment_scope='TEST' THEN 'TEST_ACTIVE' ELSE 'ACTIVE' END;
    UPDATE public.credit_product_bindings SET status='RETIRED',revision=revision+1,updated_at=CURRENT_TIMESTAMP
     WHERE id<>p_binding_id AND product_id=v_binding.product_id AND country_code=v_binding.country_code
       AND currency=v_binding.currency AND COALESCE(channel,'')=COALESCE(v_binding.channel,'') AND status=v_target;
  ELSIF v_action='REJECT' THEN
    IF v_binding.status<>'PENDING_APPROVAL' THEN RAISE EXCEPTION 'Only pending configurations can be rejected' USING ERRCODE='55000'; END IF;
    IF lower(p_actor)=lower(COALESCE(v_binding.modified_by,v_binding.created_by)) THEN RAISE EXCEPTION 'Maker and checker must be different administrators' USING ERRCODE='42501'; END IF;
    IF COALESCE(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'A rejection reason is required' USING ERRCODE='22023'; END IF;
    v_target:='REJECTED';
  ELSIF v_action='RETIRE' THEN
    IF v_binding.status NOT IN ('ACTIVE','TEST_ACTIVE','APPROVED') THEN RAISE EXCEPTION 'Only approved or active configurations can be retired' USING ERRCODE='55000'; END IF;
    v_target:='RETIRED';
  ELSE RAISE EXCEPTION 'Unsupported commercial configuration transition' USING ERRCODE='22023';
  END IF;

  UPDATE public.credit_product_bindings SET status=v_target,revision=revision+1,updated_at=CURRENT_TIMESTAMP,
    approved_by=CASE WHEN v_action='APPROVE' THEN p_actor ELSE approved_by END,
    approved_at=CASE WHEN v_action='APPROVE' THEN CURRENT_TIMESTAMP ELSE approved_at END,
    activated_by=CASE WHEN v_action='ACTIVATE' THEN p_actor ELSE activated_by END,
    activated_at=CASE WHEN v_action='ACTIVATE' THEN CURRENT_TIMESTAMP ELSE activated_at END,
    rejected_by=CASE WHEN v_action='REJECT' THEN p_actor ELSE rejected_by END,
    rejected_at=CASE WHEN v_action='REJECT' THEN CURRENT_TIMESTAMP ELSE rejected_at END,
    rejection_reason=CASE WHEN v_action='REJECT' THEN btrim(p_reason) ELSE rejection_reason END
  WHERE id=p_binding_id;
  v_after:=public.credit_commercial_configuration_view(p_binding_id);
  INSERT INTO public.credit_commercial_configuration_audit(binding_id,action,actor_id,previous_state,new_state,reason)
  VALUES(p_binding_id,v_action,p_actor,v_before,v_after,NULLIF(btrim(p_reason),''));
  RETURN v_after;
END $$;

CREATE OR REPLACE FUNCTION public.create_credit_commercial_configuration(
  p_code text,p_actor text,p_configuration jsonb
) RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_id uuid;v_version integer;
BEGIN
  IF COALESCE(btrim(p_code),'')='' OR COALESCE(btrim(p_actor),'')='' THEN
    RAISE EXCEPTION 'Configuration code and actor are required' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(upper(btrim(p_code))));
  SELECT COALESCE(max(version),0)+1 INTO v_version FROM public.credit_product_bindings
   WHERE code=upper(btrim(p_code));
  INSERT INTO public.credit_product_bindings(
    code,version,product_id,country_code,currency,channel,wallet_type_code,
    source_reference,activation_blockers,status,created_by,modified_by
  ) VALUES(
    upper(btrim(p_code)),v_version,upper(p_configuration->>'productId'),
    upper(p_configuration->>'countryCode'),upper(p_configuration->>'currency'),
    NULLIF(upper(p_configuration->>'channel'),'ALL'),
    (p_configuration->>'customerWalletTypeCode')::integer::text,
    p_configuration->>'sourceReference','["CONFIGURATION_NOT_VALIDATED"]'::jsonb,
    'DRAFT',p_actor,p_actor
  ) RETURNING id INTO v_id;
  RETURN public.apply_credit_commercial_configuration(v_id,1,p_actor,p_configuration);
END $$;

INSERT INTO public.admin_permissions(code,resource,action,description) VALUES
('credit_commercial.read','credit_commercial','read','View lending commercial configurations'),
('credit_commercial.make','credit_commercial','make','Create and edit lending commercial configurations'),
('credit_commercial.check','credit_commercial','check','Approve and activate lending commercial configurations'),
('credit_commercial.simulate','credit_commercial','simulate','Simulate lending commercial configuration resolution')
ON CONFLICT(code) DO UPDATE SET description=EXCLUDED.description;
INSERT INTO public.admin_role_permissions(role_id,permission_id)
SELECT role.id,permission.id FROM public.admin_roles role CROSS JOIN public.admin_permissions permission
WHERE role.code='super_admin' AND permission.code LIKE 'credit_commercial.%' ON CONFLICT DO NOTHING;

UPDATE public.credit_product_bindings binding SET
  environment_scope='TEST',fineract_tenant='default',fineract_product_id=1,
  fineract_product_name='DTB Uganda Test Credit',pricing_rule_code='DTB_TEST_FLAT_5_MONTHLY',
  interest_method='FLAT',nominal_interest_rate=5,interest_rate_period='MONTHLY',annual_interest_rate=60,
  repayment_frequency=1,repayment_frequency_type='MONTHS',minimum_repayments=1,default_repayments=3,maximum_repayments=12,
  processing_fee_type='PERCENT',processing_fee_value=1,late_fee_type='PERCENT',late_fee_value=2,
  early_settlement_allowed=true,early_settlement_fee_type='FLAT',early_settlement_fee_value=0,
  charge_codes='["FINERACT:1","FINERACT:2"]'::jsonb,commission_codes='["NONE"]'::jsonb,
  lender_id=(SELECT id FROM public.credit_lenders WHERE code='DTB_UGA'),wallet_type_code='103',
  activation_blockers='[]'::jsonb,status='TEST_ACTIVE',revision=revision+1,
  modified_by='commercial-config-maker',updated_at=CURRENT_TIMESTAMP,
  approved_by='commercial-config-checker',approved_at=CURRENT_TIMESTAMP,
  activated_by='commercial-config-activator',activated_at=CURRENT_TIMESTAMP
WHERE binding.code='UGA_RETAIL_CREDIT_COMMERCIAL' AND binding.version=1;

INSERT INTO public.credit_commercial_configuration_audit(binding_id,action,actor_id,new_state,reason)
SELECT id,'MIGRATE_TEST_CONFIGURATION','migration-055',public.credit_commercial_configuration_view(id),
  'Synthetic non-production DTB/Fineract configuration for UI and integration testing'
FROM public.credit_product_bindings WHERE code='UGA_RETAIL_CREDIT_COMMERCIAL' AND version=1
AND NOT EXISTS(SELECT 1 FROM public.credit_commercial_configuration_audit audit
  WHERE audit.binding_id=credit_product_bindings.id AND audit.action='MIGRATE_TEST_CONFIGURATION');

COMMIT;
