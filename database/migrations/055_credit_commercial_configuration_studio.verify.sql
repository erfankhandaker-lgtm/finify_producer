DO $$
DECLARE v_binding uuid;v_result jsonb;
BEGIN
  IF to_regprocedure('public.apply_credit_commercial_configuration(uuid,integer,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Atomic commercial configuration function is missing';
  END IF;
  IF to_regprocedure('public.transition_credit_commercial_configuration(uuid,integer,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Commercial lifecycle function is missing';
  END IF;
  IF to_regprocedure('public.create_credit_commercial_configuration(text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Atomic commercial configuration creation function is missing';
  END IF;
  IF to_regclass('public.credit_commercial_configuration_audit') IS NULL THEN
    RAISE EXCEPTION 'Commercial configuration audit is missing';
  END IF;
  SELECT id INTO v_binding FROM public.credit_product_bindings
   WHERE code='UGA_RETAIL_CREDIT_COMMERCIAL' AND version=1 AND status='TEST_ACTIVE'
     AND environment_scope='TEST' AND fineract_product_id=1
     AND nominal_interest_rate=5 AND interest_rate_period='MONTHLY'
     AND jsonb_array_length(activation_blockers)=0;
  IF v_binding IS NULL THEN RAISE EXCEPTION 'Governed DTB test configuration is incomplete'; END IF;
  v_result:=public.credit_commercial_configuration_view(v_binding);
  IF v_result->>'merchantCode'<>'DTB' OR (v_result->>'settlementWalletTypeCode')::integer<>205 THEN
    RAISE EXCEPTION 'DTB merchant/lender/wallet composition failed';
  END IF;
  IF (SELECT count(*) FROM public.admin_permissions WHERE code LIKE 'credit_commercial.%')<>4 THEN
    RAISE EXCEPTION 'Commercial configuration permissions are incomplete';
  END IF;
END $$;
