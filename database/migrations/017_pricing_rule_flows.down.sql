BEGIN;

DELETE FROM public.admin_role_permissions
WHERE permission_id IN (
  SELECT id FROM public.admin_permissions
  WHERE code IN ('pricing_rules.read','pricing_rules.make','pricing_rules.check','pricing_rules.simulate')
);

DELETE FROM public.admin_permissions
WHERE code IN ('pricing_rules.read','pricing_rules.make','pricing_rules.check','pricing_rules.simulate');

DROP TABLE IF EXISTS public.pricing_rule_flow_audit;
DROP TABLE IF EXISTS public.pricing_rule_flows;

COMMIT;
