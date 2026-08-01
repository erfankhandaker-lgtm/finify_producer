BEGIN;

UPDATE public."SW_TBL_WALLET_TYPE"
SET "Is_Kyc_Needed"=false,
    "Modified_By"='MIGRATION_035_ROLLBACK',
    "Modified_Date"=CURRENT_TIMESTAMP,
    "Approved_By"='MIGRATION_035_ROLLBACK',
    "Approved_Date"=CURRENT_TIMESTAMP
WHERE "Wallet_ID"=103
  AND "Wallet_Type"=100;

COMMIT;
