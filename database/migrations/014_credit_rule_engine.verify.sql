DO $verify$
DECLARE
  missing_tables integer;
  missing_permissions integer;
BEGIN
  SELECT count(*) INTO missing_tables
  FROM (VALUES
    ('credit_http_integrations'),
    ('credit_score_providers'),
    ('credit_ai_score_snapshots'),
    ('credit_master_rules'),
    ('credit_rules'),
    ('credit_rule_change_requests'),
    ('credit_rule_executions'),
    ('credit_rule_execution_steps')
  ) AS required(table_name)
  WHERE to_regclass('public.' || required.table_name) IS NULL;

  IF missing_tables > 0 THEN
    RAISE EXCEPTION 'credit-rule tables are incomplete: % missing',missing_tables;
  END IF;

  SELECT count(*) INTO missing_permissions
  FROM (VALUES
    ('credit_rules.read'),('credit_rules.make'),('credit_rules.check'),
    ('credit_rules.simulate'),('credit_decisions.evaluate'),('credit_decisions.read')
  ) AS required(code)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.admin_permissions permission WHERE permission.code=required.code
  );

  IF missing_permissions > 0 THEN
    RAISE EXCEPTION 'credit-rule permissions are incomplete: % missing',missing_permissions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='UQ_CREDIT_RULE_PRIORITY'
  ) THEN
    RAISE EXCEPTION 'credit-rule priority uniqueness is missing';
  END IF;
END
$verify$;
