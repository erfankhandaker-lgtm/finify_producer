DO $verify$
BEGIN
  IF to_regclass('public.pricing_rule_flows') IS NULL THEN
    RAISE EXCEPTION 'pricing_rule_flows is missing';
  END IF;
  IF to_regclass('public.pricing_rule_flow_audit') IS NULL THEN
    RAISE EXCEPTION 'pricing_rule_flow_audit is missing';
  END IF;
  IF (SELECT count(*) FROM public.admin_permissions
      WHERE code IN ('pricing_rules.read','pricing_rules.make','pricing_rules.check','pricing_rules.simulate')) <> 4 THEN
    RAISE EXCEPTION 'pricing rule permissions are incomplete';
  END IF;
END
$verify$;

SELECT 'Pricing rule flow migration verified' AS result;
