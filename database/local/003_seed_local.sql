BEGIN;

INSERT INTO public."SW_TBL_KEYWORD" (
  "Keyword","Keyword_Description","Keyword_Scope","Is_Financial","Chargeable",
  "Commissionable","MINIMUM_TRAN_AMOUNT","Service_Status","Is_System_Keyword",
  "Is_Active","Created_By","Approved_By","Approved_Date"
) VALUES
  ('PMNT','Merchant payment','F',true,'Y','Y',1,true,true,true,'LOCAL_SETUP','LOCAL_SETUP',CURRENT_TIMESTAMP),
  ('SEND','Wallet transfer','F',true,'Y','Y',1,true,true,true,'LOCAL_SETUP','LOCAL_SETUP',CURRENT_TIMESTAMP),
  ('ADDM','Add money','F',true,'N','N',1,true,true,true,'LOCAL_SETUP','LOCAL_SETUP',CURRENT_TIMESTAMP)
ON CONFLICT ("Keyword") DO UPDATE SET "Is_Active"=true,"Service_Status"=true;

INSERT INTO public."SW_TBL_WALLET_TYPE" (
  "Wallet_ID","Wallet_Name","Wallet_Details","Wallet_Type","Status",
  "Created_By","Approved_By","Approved_Date"
) VALUES
  (103,'Customer Main','Customer transaction wallet',100,true,'LOCAL_SETUP','LOCAL_SETUP',CURRENT_TIMESTAMP),
  (107,'Retail Merchant','Retail merchant settlement wallet',200,true,'LOCAL_SETUP','LOCAL_SETUP',CURRENT_TIMESTAMP),
  (110,'Safeguarding','Safeguarding master wallet',900,true,'LOCAL_SETUP','LOCAL_SETUP',CURRENT_TIMESTAMP),
  (111,'Customer Main - Unverified','Restricted customer transaction wallet pending KYC verification',100,true,'LOCAL_SETUP','LOCAL_SETUP',CURRENT_TIMESTAMP),
  (113,'Charge Revenue','Finify charge revenue wallet',900,true,'LOCAL_SETUP','LOCAL_SETUP',CURRENT_TIMESTAMP),
  (114,'Commission Funding','Commission funding wallet',900,true,'LOCAL_SETUP','LOCAL_SETUP',CURRENT_TIMESTAMP),
  (124,'Verified Retailer','Verified retailer settlement wallet',200,true,'LOCAL_SETUP','LOCAL_SETUP',CURRENT_TIMESTAMP),
  (125,'Producer Merchant','Producer merchant settlement wallet',200,true,'LOCAL_SETUP','LOCAL_SETUP',CURRENT_TIMESTAMP),
  (203,'Merchant Main','Merchant transaction wallet',200,true,'LOCAL_SETUP','LOCAL_SETUP',CURRENT_TIMESTAMP),
  (105,'Temporary Reserve','Two-leg transaction reserve',900,true,'LOCAL_SETUP','LOCAL_SETUP',CURRENT_TIMESTAMP)
ON CONFLICT ("Wallet_ID") DO UPDATE SET "Status"=true;

INSERT INTO public."SW_TBL_PROFILE_CUST" (
  "MSISDN","First_Name","Last_Name","Email","ID_Type","ID_Number",
  "Gender","KYC_Status","Status","Created_By","Approved_By","Approved_Date"
) VALUES
  (447700900101,'Amina','Nsubuga','amina@example.test','NATIONAL_ID','TEST-NIN-101','female',2,0,'LOCAL_SETUP','LOCAL_SETUP',CURRENT_TIMESTAMP),
  (447700900102,'Brian','Okello','brian@example.test','NATIONAL_ID','TEST-NIN-102','male',2,0,'LOCAL_SETUP','LOCAL_SETUP',CURRENT_TIMESTAMP),
  (447700900103,'Catherine','Nabirye','catherine@example.test','NATIONAL_ID','TEST-NIN-103','female',2,0,'LOCAL_SETUP','LOCAL_SETUP',CURRENT_TIMESTAMP)
ON CONFLICT ("MSISDN") DO NOTHING;

INSERT INTO public."SW_TBL_PROFILE_MERCHANT" (
  "MSISDN","Merchant_Name","Merchant_Type","Service_URL","Status","Created_By"
) VALUES
  (447700910001,'Local Verified Retailer','Verified',NULL,0,'LOCAL_SETUP'),
  (447700910002,'Local Producer Merchant','Producer',NULL,0,'LOCAL_SETUP')
ON CONFLICT ("MSISDN") DO NOTHING;

INSERT INTO public."SW_TBL_WALLET" (
  "Wallet_MSISDN","Wallet_Code","Amount","Created_By","Status","Mobile_Number",
  is_default,"Account_code",currency,owner_msisdn,owner_type,wallet_purpose
) VALUES
  (447700900101,103,10000,'LOCAL_SETUP',0,447700900101,true,'00000000-0000-0000-0000-000000000101','UGX',447700900101,'CUSTOMER','CUSTOMER_MAIN'),
  (447700900102,103,5000,'LOCAL_SETUP',0,447700900102,true,'00000000-0000-0000-0000-000000000102','UGX',447700900102,'CUSTOMER','CUSTOMER_MAIN'),
  (447700900103,103,2500,'LOCAL_SETUP',0,447700900103,true,'00000000-0000-0000-0000-000000000103','UGX',447700900103,'CUSTOMER','CUSTOMER_MAIN'),
  (447700910001,124,0,'LOCAL_SETUP',0,447700910001,true,'00000000-0000-0000-0000-000000010001','UGX',447700910001,'MERCHANT','MERCHANT_SETTLEMENT'),
  (447700910002,125,0,'LOCAL_SETUP',0,447700910002,true,'00000000-0000-0000-0000-000000010002','UGX',447700910002,'MERCHANT','MERCHANT_SETTLEMENT'),
  (9800000105,105,0,'LOCAL_SETUP',0,9800000105,false,'00000000-0000-0000-0000-000000000105','UGX',9800000105,'SYSTEM','TEMPORARY_RESERVE'),
  (9800000110,110,1000000,'LOCAL_SETUP',0,9800000110,false,'00000000-0000-0000-0000-000000000110','USD',9800000110,'SYSTEM','SAFEGUARDING'),
  (9800000113,113,0,'LOCAL_SETUP',0,9800000113,false,'00000000-0000-0000-0000-000000000113','UGX',9800000113,'SYSTEM','SYSTEM'),
  (9800000114,114,100000,'LOCAL_SETUP',0,9800000114,false,'00000000-0000-0000-0000-000000000114','UGX',9800000114,'SYSTEM','SYSTEM')
ON CONFLICT ("Wallet_MSISDN") DO NOTHING;

INSERT INTO public.credit_scored_customers (
  _id,credit_score,credit_limit,current_credit_limit,customer_category,
  max_instalment,msisdn,current_dpd,created_at,updated_at
) VALUES
  (1001,780,15000,15000,'A',6,'447700900101',0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (1002,690,8000,6500,'B',4,'447700900102',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (1003,610,4000,2500,'C',3,'447700900103',5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT (_id) DO NOTHING;

INSERT INTO public."SW_TBL_AML" (
  "Wallet_Type","Keyword","Max_Txn_Amount","Daily_Max_Amount",
  "Daily_Transaction_Count","Monthly_Max_Amount","Monthly_Transaction_Count",
  "Created_By","Approved_By","Approved_Date","Is_Active"
) VALUES
  (103,'PMNT',5000,20000,20,200000,200,'LOCAL_SETUP','LOCAL_SETUP',CURRENT_TIMESTAMP,true),
  (103,'SEND',5000,20000,20,200000,200,'LOCAL_SETUP','LOCAL_SETUP',CURRENT_TIMESTAMP,true),
  (124,'PMNT',50000,250000,100,2500000,1000,'LOCAL_SETUP','LOCAL_SETUP',CURRENT_TIMESTAMP,true),
  (125,'PMNT',50000,250000,100,2500000,1000,'LOCAL_SETUP','LOCAL_SETUP',CURRENT_TIMESTAMP,true)
ON CONFLICT ("Wallet_Type","Keyword") DO NOTHING;

COMMIT;
