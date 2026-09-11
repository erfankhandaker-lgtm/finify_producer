DO $$
DECLARE v_rules integer;v_active_provider integer;v_active_policy integer;
BEGIN
  SELECT count(*) INTO v_active_provider FROM public.credit_score_providers
   WHERE code='FINIFY_SCORE_MODEL_UGA_V1' AND is_active AND provider_mode='SUBMITTED';
  IF v_active_provider<>1 THEN RAISE EXCEPTION 'Submitted score provider is not active'; END IF;
  SELECT count(*) INTO v_active_policy FROM public.credit_master_rules
   WHERE rule_code='UGA_RETAIL_CREDIT_POLICY' AND version=2 AND status='ACTIVE';
  IF v_active_policy<>1 THEN RAISE EXCEPTION 'A-J credit policy is not active'; END IF;
  SELECT count(*) INTO v_rules FROM public.credit_rules rule JOIN public.credit_master_rules master ON master.id=rule.master_rule_id
   WHERE master.rule_code='UGA_RETAIL_CREDIT_POLICY' AND master.version=2 AND rule.is_active;
  IF v_rules<30 THEN RAISE EXCEPTION 'Expected at least 30 active decision-tree rules, found %',v_rules; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.credit_product_bindings WHERE code='UGA_RETAIL_CREDIT_COMMERCIAL'
    AND status='DRAFT' AND jsonb_array_length(activation_blockers)>0) THEN
    RAISE EXCEPTION 'Safe commercial activation gate is missing';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.credit_manual_review_queues WHERE code='UGA_RETAIL_CREDIT_REVIEW' AND status='ACTIVE') THEN
    RAISE EXCEPTION 'Manual review queue is missing';
  END IF;
END $$;
