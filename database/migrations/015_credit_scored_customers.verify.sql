DO $$
DECLARE
  missing_columns text;
  actual_columns integer;
BEGIN
  IF to_regclass('public.credit_scored_customers') IS NULL THEN
    RAISE EXCEPTION 'Missing table public.credit_scored_customers';
  END IF;

  SELECT string_agg(required.column_name,', ' ORDER BY required.column_name)
  INTO missing_columns
  FROM (
    VALUES
      ('_id'),('customer_id'),('msisdn'),('partner_id'),
      ('credit_score'),('customer_category'),('credit_limit'),
      ('current_credit_limit'),('max_instalment'),('current_dpd'),
      ('max_dpd_12_months'),('highest_cash_flow'),('bank_score'),
      ('bureau_status'),('score_model_id'),('score_model_version'),
      ('scored_at'),('score_expires_at'),('data'),
      ('user_interaction_timestamps'),('created_at'),('updated_at')
  ) AS required(column_name)
  LEFT JOIN information_schema.columns existing
    ON existing.table_schema='public'
   AND existing.table_name='credit_scored_customers'
   AND existing.column_name=required.column_name
  WHERE existing.column_name IS NULL;

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Missing scored-customer columns: %',missing_columns;
  END IF;

  SELECT count(*)
  INTO actual_columns
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='credit_scored_customers';

  IF actual_columns <> 274 THEN
    RAISE EXCEPTION
      'credit_scored_customers should have 274 columns, found %',
      actual_columns;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND tablename='credit_scored_customers'
      AND indexname='IDX_CREDIT_SCORED_CUSTOMER'
  ) THEN
    RAISE EXCEPTION 'Missing customer lookup index';
  END IF;
END $$;
