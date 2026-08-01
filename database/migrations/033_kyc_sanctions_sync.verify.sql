DO $$
BEGIN
  IF to_regclass('kyc.sanction_sync_runs') IS NULL THEN
    RAISE EXCEPTION 'KYC sanctions sync audit table is missing';
  END IF;
END $$;
