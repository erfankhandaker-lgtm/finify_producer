BEGIN;

DROP TABLE IF EXISTS public.credit_rule_execution_steps;
DROP TABLE IF EXISTS public.credit_rule_executions;
DROP TABLE IF EXISTS public.credit_rule_change_requests;
DROP TABLE IF EXISTS public.credit_rules;
DROP TABLE IF EXISTS public.credit_master_rules;
DROP TABLE IF EXISTS public.credit_ai_score_snapshots;
DROP TABLE IF EXISTS public.credit_score_providers;
DROP TABLE IF EXISTS public.credit_http_integrations;

DELETE FROM public.admin_role_permissions
WHERE permission_id IN (
  SELECT id FROM public.admin_permissions
  WHERE code IN (
    'credit_rules.read','credit_rules.make','credit_rules.check',
    'credit_rules.simulate','credit_decisions.evaluate','credit_decisions.read'
  )
);

DELETE FROM public.admin_permissions
WHERE code IN (
  'credit_rules.read','credit_rules.make','credit_rules.check',
  'credit_rules.simulate','credit_decisions.evaluate','credit_decisions.read'
);

COMMIT;
