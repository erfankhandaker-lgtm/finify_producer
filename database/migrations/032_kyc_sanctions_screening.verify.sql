DO $$
BEGIN
  IF to_regclass('kyc.sanction_records') IS NULL THEN
    RAISE EXCEPTION 'KYC sanctions table is missing';
  END IF;
END $$;
