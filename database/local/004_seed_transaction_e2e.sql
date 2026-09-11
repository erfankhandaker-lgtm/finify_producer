\set ON_ERROR_STOP on

BEGIN;

INSERT INTO public."SW_TBL_PROFILE_CUST" (
  "MSISDN","First_Name","Last_Name","Email","KYC_Status","Status",
  "Fail_Attempt","User_Scope","Created_By","Approved_By","Approved_Date"
) VALUES (
  447700920001,'E2E','Customer','e2e.customer@finify.local',1,0,
  0,'CUSTOMER','LOCAL_E2E','LOCAL_E2E',CURRENT_TIMESTAMP
)
ON CONFLICT ("MSISDN") DO UPDATE SET
  "First_Name"=EXCLUDED."First_Name",
  "Last_Name"=EXCLUDED."Last_Name",
  "Email"=EXCLUDED."Email",
  "KYC_Status"=1,
  "Status"=0,
  "Fail_Attempt"=0,
  "Modified_By"='LOCAL_E2E',
  "Modified_Date"=CURRENT_TIMESTAMP;

-- Wallet type 103 is KYC-gated. The transaction fixture therefore receives a
-- dedicated approval case instead of bypassing the production database guard.
-- scripts/run-transaction-e2e.js removes this case and restores the customer
-- to unverified after every run, including failed runs.
DELETE FROM kyc.cases WHERE idempotency_key='LOCAL_E2E_TRANSACTION_APPROVAL';

WITH approved_case AS (
  INSERT INTO kyc.cases (
    customer_msisdn,document_type,issuing_country,status,
    system_recommendation,face_match_score,aml_match,
    extracted_data,screening_summary,idempotency_key,
    created_by,reviewed_by,reviewed_at
  ) VALUES (
    447700920001,'NATIONAL_ID','UGA','APPROVED',
    'APPROVED',100,false,
    '{"fixture":true}'::jsonb,'{"fixture":true}'::jsonb,
    'LOCAL_E2E_TRANSACTION_APPROVAL','LOCAL_E2E','LOCAL_E2E',CURRENT_TIMESTAMP
  )
  RETURNING id
)
INSERT INTO kyc.review_audit(
  case_id,action,previous_status,new_status,reason,actor_id
)
SELECT id,'APPROVE','MANUAL_REVIEW','APPROVED',
       'Dedicated local transaction E2E fixture','LOCAL_E2E'
FROM approved_case;

INSERT INTO public."SW_TBL_WALLET" (
  "Wallet_MSISDN","Wallet_Code","Amount","Status","Mobile_Number",
  is_default,currency,owner_msisdn,owner_type,wallet_purpose,
  "Created_By"
) VALUES (
  447700920001,103,10000,0,447700920001,true,'UGX',
  447700920001,'CUSTOMER','CUSTOMER_MAIN','LOCAL_E2E'
)
ON CONFLICT ("Wallet_MSISDN") DO UPDATE SET
  "Wallet_Code"=103,"Amount"=10000,"Balance_Before"=10000,
  "Status"=0,"Mobile_Number"=447700920001,is_default=true,
  currency='UGX',owner_msisdn=447700920001,owner_type='CUSTOMER',
  wallet_purpose='CUSTOMER_MAIN',"Modified_By"='LOCAL_E2E',
  "Modified_Date"=CURRENT_TIMESTAMP;

UPDATE public."SW_TBL_WALLET"
SET "Amount"=0,"Balance_Before"=0,"Status"=0,
    "Last_Transaction_ID"=NULL,"Last_Transaction_Amount"=NULL,
    "Modified_By"='LOCAL_E2E',"Modified_Date"=CURRENT_TIMESTAMP
WHERE "Wallet_MSISDN" IN (447700910001,447700910002,9800000105,9800000113);

UPDATE public."SW_TBL_WALLET"
SET "Amount"=100000,"Balance_Before"=100000,"Status"=0,
    "Last_Transaction_ID"=NULL,"Last_Transaction_Amount"=NULL,
    "Modified_By"='LOCAL_E2E',"Modified_Date"=CURRENT_TIMESTAMP
WHERE "Wallet_MSISDN"=9800000114;

UPDATE public."SW_TBL_PROFILE_MERCHANT"
SET "Is_Special_Merchant"=false,"Integration_Channel"=NULL,
    "Modified_By"='LOCAL_E2E',"Modified_Date"=CURRENT_TIMESTAMP
WHERE "MSISDN"=447700910001;

UPDATE public."SW_TBL_PROFILE_MERCHANT"
SET "Is_Special_Merchant"=true,"Integration_Channel"='API',
    "Modified_By"='LOCAL_E2E',"Modified_Date"=CURRENT_TIMESTAMP
WHERE "MSISDN"=447700910002;

UPDATE public."SW_TBL_KEYWORD"
SET "Chargeable"='Y',"Commissionable"='Y',"Is_System_Keyword"=false,
    "Is_Active"=true,"Modified_By"='LOCAL_E2E',"Modified_Date"=CURRENT_TIMESTAMP
WHERE "Keyword"='PMNT';

COMMIT;

SELECT 'Dedicated priced transaction E2E identities seeded' AS result;
