BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.users (
  id bigserial PRIMARY KEY,
  name varchar(100),
  email varchar(100),
  password text,
  gender varchar(10) NOT NULL CHECK (gender IN ('male','female'))
);

CREATE TABLE public."Logs" (
  id bigserial PRIMARY KEY,
  level varchar(255),
  message text,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  appname text NOT NULL DEFAULT 'nestjs_core',
  transactionid text
);

CREATE TABLE public."SW_TBL_KEYWORD" (
  "Keyword" varchar PRIMARY KEY,
  "Keyword_Description" varchar,
  "Keyword_Scope" char(1),
  "Created_By" varchar,
  "Created_Date" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "Modified_By" varchar,
  "Modified_Date" timestamp,
  "Approved_By" varchar,
  "Approved_Date" timestamp,
  "Is_Financial" boolean,
  "Chargeable" char(1),
  "Kc_Id_Lookup" char(1),
  "Commissionable" char(1),
  "Kcm_Id_Lookup" char(1),
  "MINIMUM_TRAN_AMOUNT" numeric(12,2) NOT NULL DEFAULT 1,
  "INVOLVED_PARTY" varchar,
  "ApplyTds" boolean,
  "Is_Reward_Applicable" boolean NOT NULL DEFAULT false,
  "Is_System_Keyword" boolean NOT NULL DEFAULT false,
  "Service_Status" boolean NOT NULL DEFAULT false,
  vat_source char(1) NOT NULL DEFAULT 'D',
  "VatId" smallint NOT NULL DEFAULT 1,
  "Keyword_Description_Local" text,
  "Is_category_service" boolean NOT NULL DEFAULT false,
  priority integer,
  "RKEYWORD" varchar,
  "Is_Active" boolean NOT NULL DEFAULT false
);

CREATE TABLE public."SW_TBL_WALLET_TYPE" (
  "Wallet_ID" integer PRIMARY KEY,
  "Wallet_Name" varchar,
  "Wallet_Details" varchar,
  "Created_By" varchar,
  "Created_Date" timestamp DEFAULT CURRENT_TIMESTAMP,
  "Modified_By" varchar,
  "Modified_Date" timestamp,
  "Approved_By" varchar,
  "Approved_Date" timestamp,
  "Is_Kyc_Needed" boolean DEFAULT false,
  "Default_Comission_Id" integer,
  "Default_Charge_Id" integer,
  "Wallet_Type" smallint,
  "Is_Charge" boolean DEFAULT false,
  "Fee" numeric DEFAULT 0,
  "Hierarchy" integer,
  "Status" boolean DEFAULT true,
  "Wallet_Name_Local" text
);

-- References required by migrations 010-012. The richer local seed runs after
-- every migration, but these keys must exist while foreign keys are installed.
INSERT INTO public."SW_TBL_KEYWORD" (
  "Keyword","Keyword_Description","Is_Financial","Chargeable",
  "Commissionable","Service_Status","Is_Active","Created_By"
) VALUES
  ('ADDM','Add money',true,'N','N',true,true,'LOCAL_BASELINE'),
  ('PMNT','Merchant payment',true,'Y','Y',true,true,'LOCAL_BASELINE'),
  ('SEND','Wallet transfer',true,'Y','Y',true,true,'LOCAL_BASELINE');

INSERT INTO public."SW_TBL_WALLET_TYPE" (
  "Wallet_ID","Wallet_Name","Wallet_Details","Wallet_Type","Status","Created_By"
) VALUES
  (103,'Customer Main','Customer transaction wallet',100,true,'LOCAL_BASELINE'),
  (105,'Temporary Reserve','Two-leg transaction reserve',900,true,'LOCAL_BASELINE'),
  (110,'Safeguarding','Safeguarding master wallet',900,true,'LOCAL_BASELINE'),
  (111,'Customer Main - Unverified','Restricted customer transaction wallet pending KYC verification',100,true,'LOCAL_BASELINE'),
  (113,'Charge Revenue','Finify charge revenue wallet',900,true,'LOCAL_BASELINE'),
  (114,'Commission Funding','Commission funding wallet',900,true,'LOCAL_BASELINE'),
  (203,'Merchant Main','Merchant transaction wallet',200,true,'LOCAL_BASELINE');

CREATE TABLE public."SW_TBL_PROFILE_CUST" (
  "MSISDN" bigint PRIMARY KEY,
  "First_Name" varchar,
  "Last_Name" varchar,
  "Email" varchar,
  "ID_Type" varchar,
  "ID_Number" varchar,
  "Gender" varchar,
  "DOB" date,
  "Address" text,
  "KYC_Status" smallint NOT NULL DEFAULT 0,
  "Status" smallint NOT NULL DEFAULT 0,
  "PIN" text,
  "Fail_Attempt" smallint DEFAULT 0,
  "User_Scope" text,
  "SMSNotification" boolean DEFAULT true,
  "Reset_Pin_Attempt" smallint DEFAULT 0,
  "Image" text,
  "Created_By" varchar,
  "Created_Date" timestamp DEFAULT CURRENT_TIMESTAMP,
  "Modified_By" varchar,
  "Modified_Date" timestamp,
  "Approved_By" varchar,
  "Approved_Date" timestamp
);

CREATE TABLE public."SW_TBL_PROFILE_MERCHANT" (
  "MSISDN" bigint PRIMARY KEY,
  "Merchant_Name" text,
  "Merchant_Type" text,
  "Service_URL" text,
  "Email" text,
  "Status" smallint NOT NULL DEFAULT 0,
  "Created_By" text,
  "Created_Date" timestamp DEFAULT CURRENT_TIMESTAMP,
  "Modified_By" text,
  "Modified_Date" timestamp
);

CREATE TABLE public."SW_TBL_WALLET" (
  "Wallet_MSISDN" bigint PRIMARY KEY,
  "Wallet_Code" integer REFERENCES public."SW_TBL_WALLET_TYPE"("Wallet_ID"),
  "Amount" numeric(20,2) DEFAULT 0,
  "Created_Date" timestamp DEFAULT CURRENT_TIMESTAMP,
  "Created_By" varchar,
  "Status" smallint DEFAULT 0,
  "Last_Transaction_ID" bigint,
  "Last_Transaction_Amount" numeric(20,2),
  "Balance_Before" numeric(20,2),
  "Modified_Date" timestamp,
  "Modified_By" varchar,
  "Current_Year_Reward_Point" numeric DEFAULT 0,
  "Last_Year_Reward_Point" numeric DEFAULT 0,
  "Parent" bigint,
  "Mobile_Number" bigint,
  "Is_Subcription" boolean DEFAULT false,
  hold_transfer_day bigint DEFAULT 0,
  is_hold_transfer boolean DEFAULT false,
  hold_transfer_day_update_at timestamp,
  hold_transfer_day_update_by text,
  commission_balance numeric(20,2) DEFAULT 0,
  pin text,
  is_default boolean NOT NULL DEFAULT false,
  "Account_code" uuid NOT NULL DEFAULT gen_random_uuid(),
  currency text NOT NULL DEFAULT 'UGX'
);

-- Migration 012 adds the GBP safeguarding wallet and configures both it and
-- this pre-existing USD master wallet.
INSERT INTO public."SW_TBL_WALLET" (
  "Wallet_MSISDN","Wallet_Code","Amount","Created_By","Status",is_default,
  "Account_code",currency
) VALUES (
  9800000110,110,1000000,'LOCAL_BASELINE',0,false,
  '00000000-0000-0000-0000-000000000110','USD'
);

CREATE TABLE public."SW_TBL_CHARGE" (
  "ROW_ID" serial NOT NULL,
  "Charge_ID" smallint PRIMARY KEY,
  "Charge_Type" smallint,
  "Expiry_On" date,
  "Status" smallint,
  "Def_Charge_ID" smallint,
  "Created_By" varchar,
  "Created_Date" timestamp,
  "Modified_By" varchar,
  "Modified_Date" timestamp,
  "Approved_By" varchar,
  "Approved_Date" timestamp,
  "Charge_Description" varchar
);

CREATE TABLE public."SW_TBL_CHARGE_DETAILS" (
  "Row_ID" serial PRIMARY KEY,
  "Charge_ID" smallint,
  "Charge_Type" varchar,
  "Charge_Value" numeric,
  "Start_Range" numeric,
  "End_Range" numeric,
  "Min_Charge" numeric,
  "Max_Charge" numeric
);

CREATE TABLE public."SW_TBL_CHARGE_MAPPING" (
  "RowId" serial PRIMARY KEY,
  "Keyword_Charge_Id" integer,
  "Description" varchar,
  "Is_Default" smallint DEFAULT 0,
  "Status" smallint,
  "Created_By" varchar,
  "Created_Date" timestamp,
  "Modified_By" varchar,
  "Modified_Date" timestamp,
  "Approved_By" varchar,
  "Approved_Date" timestamp,
  "OperationType" char
);
CREATE UNIQUE INDEX "UQ_CHARGE_MAPPING_KEYWORD_CHARGE_ID"
  ON public."SW_TBL_CHARGE_MAPPING"("Keyword_Charge_Id")
  WHERE "Keyword_Charge_Id" IS NOT NULL;

CREATE TABLE public."SW_TBL_KEYWORD_CHARGE" (
  "Row_Id" serial PRIMARY KEY,
  "Keywod_Charge_Id" integer,
  "Keyword" varchar,
  "Charge_Id" smallint,
  "Payer" char,
  "Description" varchar,
  "Created_BY" varchar,
  "Created_Date" timestamp,
  "Modified_BY" varchar,
  "Modified_Date" timestamp,
  "Approved_BY" varchar,
  "Approved_Date" timestamp,
  "Is_Default" smallint DEFAULT 0,
  "Charge_Map_Id" integer,
  "Status" smallint DEFAULT 1
);

CREATE TABLE public."SW_TBL_COMMISSION" (
  "ROW_ID" serial NOT NULL,
  "Commission_ID" smallint PRIMARY KEY,
  "Description" varchar,
  "Commission_Type" smallint,
  "Expiry_On" date,
  "Status" smallint,
  "Def_Commission_ID" smallint,
  "Created_By" varchar,
  "Created_Date" timestamp,
  "Modified_By" varchar,
  "Modified_Date" timestamp,
  "Approved_By" varchar,
  "Approved_Date" timestamp,
  "Distributor_Commission" double precision
);

CREATE TABLE public."SW_TBL_COMMISSION_DETAIL" (
  "Row_ID" serial PRIMARY KEY,
  "Commission_ID" smallint,
  "Comission_Type" varchar,
  "Comission_Value" double precision,
  "Start_Range" money,
  "End_Range" money,
  "Min_Comission" money,
  "Max_Comission" money
);

CREATE TABLE public."SW_TBL_COMMISSION_MAPPING" (
  "RowId" serial PRIMARY KEY,
  "Keyword_Commission_Id" integer,
  "Description" varchar,
  "Is_Default" smallint DEFAULT 0,
  "Status" smallint,
  "Created_By" varchar,
  "Created_Date" timestamp,
  "Modified_By" varchar,
  "Modified_Date" timestamp,
  "Approved_By" varchar,
  "Approved_Date" timestamp,
  "OperationType" char
);

CREATE TABLE public."SW_TBL_KEYWORD_COMMISSION" (
  "Row_ID" serial PRIMARY KEY,
  "Keyword_Commission_ID" smallint,
  "Keyword" varchar,
  "Commission_ID" smallint,
  "Description" varchar,
  "Receiver" char,
  "Created_BY" varchar,
  "Created_Date" timestamp,
  "Modified_BY" varchar,
  "Modified_Date" timestamp,
  "Approved_BY" varchar,
  "Approved_Date" timestamp,
  "Is_Default" smallint DEFAULT 0,
  "Commission_Map_Id" integer,
  "Status" smallint DEFAULT 1
);

CREATE TABLE public."SW_TBL_TRANSACTION_REQUEST" (
  "Transaction_ID" bigint PRIMARY KEY,
  "Keyword" varchar,
  "Source_Wallet_ID" bigint,
  "Dest_Wallet_ID" bigint,
  "Amount" numeric,
  "Created_Date" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "Transaction_Fee" money DEFAULT 0,
  "Transaction_Comm" money DEFAULT 0,
  "Transaction_Status" bigint DEFAULT 1,
  "Reference_ID" text DEFAULT '',
  "Fee_Payer" bigint DEFAULT 0,
  "Commission_Receiver" bigint DEFAULT 0,
  "TransactionDate" timestamp DEFAULT CURRENT_TIMESTAMP,
  "Currency" varchar DEFAULT 'UGX',
  "Transactionstatus" smallint DEFAULT 0,
  "Pin" varchar DEFAULT '0',
  "Dest_Wallet_Fullname" text DEFAULT '',
  remarks varchar,
  "TRNID" varchar
);

CREATE TABLE public.sw_tbl_accounting_category (
  id bigserial PRIMARY KEY,
  accountname text NOT NULL,
  accounttype varchar(20) NOT NULL
);

CREATE TABLE public.sw_tbl_accounting_entry (
  id serial PRIMARY KEY,
  transactionid bigint,
  "Debit" numeric(20,2) DEFAULT 0,
  "Credit" numeric(20,2) DEFAULT 0,
  entrydate timestamp DEFAULT CURRENT_TIMESTAMP,
  accounttype bigint,
  accountnumber bigint
);

CREATE TABLE public.sw_tbl_transaction_entry (
  id serial PRIMARY KEY,
  transactionid bigint,
  "Debit" numeric(20,2) DEFAULT 0,
  "Credit" numeric(20,2) DEFAULT 0,
  entrydate timestamp,
  accounttype bigint,
  accountnumber bigint,
  wallet_code bigint,
  balance numeric(20,2),
  "TRNID" text
);

CREATE TABLE public."SW_TBL_TRANSACTION_DETAILS" (
  "Row_ID" bigserial PRIMARY KEY,
  "Transaction_ID" bigint,
  "Keyword" varchar,
  "Source_Wallet_ID" bigint,
  "Dest_Wallet_ID" bigint,
  "Amount" money,
  "Souce_Balance_Before" money,
  "Source_Balance_After" money,
  "Dest_Balance_Before" money,
  "Dest_Balance_After" money,
  "Transaction_Fee" money,
  "Transaction_Comm" money,
  "Status" smallint,
  "Reference_ID" text,
  "Fee_Payer" bigint,
  "Commission_Receiver" bigint,
  "Currency" varchar,
  "Charge_Account_Balance_Before" money,
  "Charge_Account_Balance_After" money,
  "Comission_Account_Balance_Before" money,
  "Comission_Account_Balance_After" money,
  "Type_Of_Transaction" varchar,
  "Temp_Account_balance_before" money,
  "Temp_Account_balance_After" money,
  "Source_Amount" numeric,
  "Dest_Amount" numeric,
  "Temp_Account" bigint,
  "TRNID" text
);

CREATE TABLE public."SW_TBL_TRANSACTION_TEMP" (
  "Transaction_ID" bigint PRIMARY KEY,
  "Keyword" varchar,
  "Source_Wallet_ID" bigint,
  "Dest_Wallet_ID" bigint,
  "Amount" numeric,
  "Souce_Balance_Before" numeric,
  "Source_Balance_After" numeric,
  "Dest_Balance_Before" numeric,
  "Dest_Balance_After" numeric,
  "Transaction_Fee" numeric,
  "Transaction_Comm" numeric,
  "Status" smallint
);

CREATE TABLE public.sw_tbl_charge_account_history (
  id bigserial PRIMARY KEY,
  transactionid bigint,
  chargepayer bigint,
  charge numeric,
  chargeaccount bigint,
  receiveamount numeric,
  keyword varchar,
  reference text,
  transactionstatus smallint
);

CREATE TABLE public.sw_tbl_comission_account_history (
  id bigserial PRIMARY KEY,
  transactionid bigint,
  comissionpayer bigint,
  comission numeric,
  receiveraccount bigint,
  receiveamount numeric,
  keyword varchar,
  reference text,
  transactionstatus smallint
);

CREATE TABLE public."SW_TBL_AML" (
  "Row_Id" bigserial PRIMARY KEY,
  "Wallet_Type" smallint,
  "Keyword" varchar,
  "Max_Txn_Amount" numeric,
  "Daily_Max_Amount" numeric,
  "Daily_Transaction_Count" numeric,
  "Monthly_Max_Amount" numeric,
  "Monthly_Transaction_Count" numeric,
  "Created_By" varchar,
  "Created_Date" timestamp DEFAULT CURRENT_TIMESTAMP,
  "Modified_By" varchar,
  "Modified_Date" timestamp,
  "Approved_By" varchar,
  "Approved_Date" timestamp
);

CREATE TABLE public."SW_TBL_AML_SUMMARY" (
  "Wallet_MSISDN" bigint NOT NULL,
  "Keyword" varchar NOT NULL,
  "Monthly_Amount" money DEFAULT 0,
  "Monthly_Transaction" bigint DEFAULT 0,
  "Daily_Amount" money DEFAULT 0,
  "Daily_Transaction" bigint DEFAULT 0,
  "Last_Update_Date" timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("Wallet_MSISDN","Keyword")
);

CREATE VIEW public.walletdetail AS
SELECT wallet."Wallet_MSISDN", wallet_type."Wallet_Details", wallet."Amount",
       wallet.commission_balance, wallet."Wallet_Code", wallet_type."Wallet_Type",
       wallet_type."Wallet_Name", wallet_type."Wallet_Name_Local", wallet."Parent",
       wallet."Created_Date", wallet."Status", wallet.hold_transfer_day,
       wallet.is_hold_transfer
FROM public."SW_TBL_WALLET" wallet
LEFT JOIN public."SW_TBL_WALLET_TYPE" wallet_type
  ON wallet_type."Wallet_ID"=wallet."Wallet_Code";

CREATE VIEW public."SW_VIEW_ALLUSER" AS
SELECT wallet."Wallet_MSISDN" AS "MSISDN", wallet."Amount",
       concat_ws(' ',profile."First_Name",profile."Last_Name") AS "Full_Name",
       wallet."Account_code"::text AS "Acc_Code", profile."Email",
       profile."ID_Type", profile."ID_Number", profile."Created_Date",
       profile."PIN", profile."Modified_Date", profile."Approved_Date",
       wallet_type."Wallet_Type", profile."Status", profile."Fail_Attempt",
       profile."User_Scope", wallet."Parent" AS "PARENT_MSISDN",
       profile."SMSNotification", profile."Approved_By", profile."Modified_By",
       profile."Created_By", profile."Reset_Pin_Attempt", profile."Image",
       NULL::smallint AS "CHARGERULE", NULL::smallint AS "COMMISSIONRULE",
       wallet."Wallet_Code"::smallint AS "Wallet_Code", wallet.is_default,
       wallet."Mobile_Number"
FROM public."SW_TBL_WALLET" wallet
LEFT JOIN public."SW_TBL_PROFILE_CUST" profile
  ON profile."MSISDN"=wallet."Mobile_Number"
LEFT JOIN public."SW_TBL_WALLET_TYPE" wallet_type
  ON wallet_type."Wallet_ID"=wallet."Wallet_Code";

CREATE VIEW public.view_tbl_transaction_entry AS
SELECT entry.id,entry.transactionid,entry."Debit",entry."Credit",entry.entrydate,
       entry.accounttype,entry.accountnumber,entry.wallet_code,entry.balance,
       entry."TRNID",request."Keyword",request."Transaction_Status"
FROM public.sw_tbl_transaction_entry entry
LEFT JOIN public."SW_TBL_TRANSACTION_REQUEST" request
  ON request."Transaction_ID"=entry.transactionid;

COMMIT;
