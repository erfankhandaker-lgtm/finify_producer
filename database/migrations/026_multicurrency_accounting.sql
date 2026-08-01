BEGIN;

-- Register a dedicated UGX safeguarding wallet without manufacturing a bank
-- balance. Treasury funding remains the only route that changes its balance.
INSERT INTO public."SW_TBL_WALLET" (
  "Wallet_MSISDN","Wallet_Code","Amount","Created_Date","Created_By",
  "Status",is_default,"Account_code",currency,owner_msisdn,owner_type,wallet_purpose
) VALUES (
  9800002110,110,0.00,CURRENT_TIMESTAMP,'MIGRATION_026',
  0,false,'00000000-0000-0000-0000-000000002110','UGX',
  9800002110,'SYSTEM','SAFEGUARDING'
)
ON CONFLICT ("Wallet_MSISDN") DO NOTHING;

INSERT INTO public.sw_tbl_accounting_configuration (
  reporting_entity,currency,base_currency,business_timezone,cutoff_time,
  master_wallet,strict_safeguarding,effective_from,created_by,approved_by
) VALUES (
  'FINIFY_UK','UGX','GBP','Europe/London','00:00:00',
  9800002110,true,CURRENT_DATE,'MIGRATION_026','MIGRATION_026'
)
ON CONFLICT DO NOTHING;

COMMIT;
