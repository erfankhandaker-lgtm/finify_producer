BEGIN;

-- Every active accounting currency requires operational wallets for
-- commission funding and charge-revenue withdrawal as well as safeguarding.
INSERT INTO public."SW_TBL_WALLET" (
  "Wallet_MSISDN","Wallet_Code","Amount","Created_Date","Created_By",
  "Status",is_default,"Account_code",currency,owner_msisdn,owner_type,wallet_purpose
) VALUES
  (9800001113,113,0.00,CURRENT_TIMESTAMP,'MIGRATION_027',0,false,
   '00000000-0000-0000-0000-000000001113','GBP',9800001113,'SYSTEM','SYSTEM'),
  (9800001114,114,0.00,CURRENT_TIMESTAMP,'MIGRATION_027',0,false,
   '00000000-0000-0000-0000-000000001114','GBP',9800001114,'SYSTEM','SYSTEM'),
  (9800003113,113,0.00,CURRENT_TIMESTAMP,'MIGRATION_027',0,false,
   '00000000-0000-0000-0000-000000003113','USD',9800003113,'SYSTEM','SYSTEM'),
  (9800003114,114,0.00,CURRENT_TIMESTAMP,'MIGRATION_027',0,false,
   '00000000-0000-0000-0000-000000003114','USD',9800003114,'SYSTEM','SYSTEM')
ON CONFLICT ("Wallet_MSISDN") DO NOTHING;

COMMIT;
