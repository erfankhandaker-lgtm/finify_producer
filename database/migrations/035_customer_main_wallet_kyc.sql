BEGIN;

UPDATE public."SW_TBL_WALLET_TYPE"
SET "Is_Kyc_Needed"=true,
    "Modified_By"='MIGRATION_035',
    "Modified_Date"=CURRENT_TIMESTAMP,
    "Approved_By"='MIGRATION_035',
    "Approved_Date"=CURRENT_TIMESTAMP
WHERE "Wallet_ID"=103
  AND "Wallet_Type"=100;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."SW_TBL_WALLET_TYPE"
    WHERE "Wallet_ID"=103 AND "Wallet_Type"=100 AND "Status"
  ) THEN
    RAISE EXCEPTION 'Active Customer Main wallet type 103 is missing';
  END IF;
END $$;

COMMIT;
