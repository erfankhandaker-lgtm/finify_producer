BEGIN;
UPDATE public.credit_product_bindings SET status='DRAFT',activation_blockers=
  '["INTEREST_RATE_NOT_APPROVED","PROCESSING_FEE_NOT_APPROVED","LATE_FEE_NOT_APPROVED","EARLY_SETTLEMENT_TERMS_NOT_APPROVED","CHARGES_NOT_APPROVED","COMMISSION_NOT_APPROVED"]'::jsonb
WHERE status='TEST_ACTIVE';
DROP FUNCTION IF EXISTS public.transition_credit_commercial_configuration(uuid,integer,text,text,text);
DROP FUNCTION IF EXISTS public.create_credit_commercial_configuration(text,text,jsonb);
DROP FUNCTION IF EXISTS public.apply_credit_commercial_configuration(uuid,integer,text,jsonb);
DROP FUNCTION IF EXISTS public.credit_commercial_configuration_view(uuid);
DROP TABLE IF EXISTS public.credit_commercial_configuration_audit;
DROP INDEX IF EXISTS public."UQ_CREDIT_BINDING_TEST_ACTIVE_SCOPE";
DELETE FROM public.admin_role_permissions WHERE permission_id IN
  (SELECT id FROM public.admin_permissions WHERE code LIKE 'credit_commercial.%');
DELETE FROM public.admin_permissions WHERE code LIKE 'credit_commercial.%';
ALTER TABLE public.credit_product_bindings DROP CONSTRAINT IF EXISTS "CK_CREDIT_BINDING_ACTIVE_COMPLETE";
ALTER TABLE public.credit_product_bindings DROP CONSTRAINT IF EXISTS "CK_CREDIT_BINDING_REPAYMENT";
ALTER TABLE public.credit_product_bindings DROP CONSTRAINT IF EXISTS "CK_CREDIT_BINDING_RATE_PERIOD";
ALTER TABLE public.credit_product_bindings DROP CONSTRAINT IF EXISTS "CK_CREDIT_BINDING_ENVIRONMENT";
ALTER TABLE public.credit_product_bindings DROP CONSTRAINT IF EXISTS "CK_CREDIT_BINDING_STATUS";
ALTER TABLE public.credit_product_bindings ADD CONSTRAINT "CK_CREDIT_BINDING_STATUS"
  CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','ACTIVE','REJECTED','RETIRED'));
ALTER TABLE public.credit_product_bindings ADD CONSTRAINT "CK_CREDIT_BINDING_ACTIVE_COMPLETE" CHECK (status<>'ACTIVE' OR
  (lender_id IS NOT NULL AND pricing_rule_code IS NOT NULL AND interest_method IS NOT NULL
   AND annual_interest_rate IS NOT NULL AND early_settlement_allowed IS NOT NULL
   AND jsonb_array_length(activation_blockers)=0));
ALTER TABLE public.credit_product_bindings
  DROP COLUMN IF EXISTS revision,DROP COLUMN IF EXISTS environment_scope,
  DROP COLUMN IF EXISTS fineract_tenant,DROP COLUMN IF EXISTS fineract_product_id,
  DROP COLUMN IF EXISTS fineract_product_name,DROP COLUMN IF EXISTS nominal_interest_rate,
  DROP COLUMN IF EXISTS interest_rate_period,DROP COLUMN IF EXISTS repayment_frequency,
  DROP COLUMN IF EXISTS repayment_frequency_type,DROP COLUMN IF EXISTS minimum_repayments,
  DROP COLUMN IF EXISTS default_repayments,DROP COLUMN IF EXISTS maximum_repayments,
  DROP COLUMN IF EXISTS modified_by,DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS rejected_by,DROP COLUMN IF EXISTS rejected_at,DROP COLUMN IF EXISTS rejection_reason;
COMMIT;
