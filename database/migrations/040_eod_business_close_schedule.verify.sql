DO $$
BEGIN
  IF to_regclass('public.sw_tbl_eod_schedule') IS NULL THEN
    RAISE EXCEPTION 'EOD schedule table is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sw_tbl_eod_schedule
    WHERE reporting_entity='FINIFY_UK' AND enabled
      AND business_timezone='Europe/London'
  ) THEN
    RAISE EXCEPTION 'Default FINIFY_UK EOD schedule is missing or disabled';
  END IF;
END $$;
