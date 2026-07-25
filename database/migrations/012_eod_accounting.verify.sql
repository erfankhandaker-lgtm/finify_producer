BEGIN;

DO $verify$
DECLARE
  v_result record;
  v_master bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sw_tbl_accounting_journal'
      AND column_name='business_date'
  ) THEN
    RAISE EXCEPTION 'business_date is missing from accounting journals';
  END IF;

  SELECT master_wallet INTO v_master
  FROM public.sw_tbl_accounting_configuration
  WHERE reporting_entity='FINIFY_UK' AND currency='GBP' AND is_active;
  IF v_master <> 9800001110 THEN
    RAISE EXCEPTION 'GBP master wallet configuration is missing';
  END IF;

  SELECT * INTO v_result
  FROM public.sw_proc_accounting_close_eod(
    CURRENT_DATE + 1000, 'GBP', 'FINIFY_UK', 'MIGRATION_012_VERIFY', true, 'VERIFY-012'
  );
  IF v_result.run_id IS NULL OR v_result.run_status NOT IN ('VALIDATED','BLOCKED') THEN
    RAISE EXCEPTION 'EOD dry run did not return a structured result: %', row_to_json(v_result);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sw_fn_trial_balance(CURRENT_DATE + 1000,'GBP','FINIFY_UK')) THEN
    -- A dry run deliberately does not create snapshots; this call verifies the function signature.
    NULL;
  END IF;

  RAISE NOTICE 'Migration 012 EOD schema and dry-run verification passed: %', row_to_json(v_result);
END
$verify$;

ROLLBACK;
