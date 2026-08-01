BEGIN;

UPDATE public.sw_tbl_accounting_configuration
SET is_active=false,effective_to=CURRENT_DATE
WHERE currency='UGX' AND reporting_entity='FINIFY_UK' AND created_by='MIGRATION_026';

UPDATE public."SW_TBL_WALLET"
SET "Status"=1,"Modified_By"='MIGRATION_026_DOWN',"Modified_Date"=CURRENT_TIMESTAMP
WHERE "Wallet_MSISDN"=9800002110 AND "Created_By"='MIGRATION_026';

COMMIT;
