BEGIN;

ALTER TABLE public."SW_TBL_PROFILE_MERCHANT"
  ADD COLUMN IF NOT EXISTS "PIN" text NULL,
  ADD COLUMN IF NOT EXISTS "Fail_Attempt" smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "Reset_Pin_Attempt" smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "User_Scope" text NOT NULL DEFAULT 'BUSINESS';

CREATE OR REPLACE FUNCTION public.walletpindetail(
  p_msisdn text,
  p_action text,
  p_pin text DEFAULT NULL::text
)
RETURNS TABLE(pin_out text,failed_attempt_out integer,account_status_out integer)
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_action='UpdateWalletPin' THEN
    UPDATE public."SW_TBL_PROFILE_CUST" SET "PIN"=p_pin
    WHERE "MSISDN"=p_msisdn::bigint;
    IF NOT FOUND THEN
      UPDATE public."SW_TBL_PROFILE_MERCHANT" SET "PIN"=p_pin,"Modified_Date"=CURRENT_TIMESTAMP
      WHERE "MSISDN"=p_msisdn::bigint;
    END IF;
  ELSIF p_action='FailedWalletPin' THEN
    UPDATE public."SW_TBL_PROFILE_CUST" SET "Fail_Attempt"=COALESCE("Fail_Attempt",0)+1
    WHERE "MSISDN"=p_msisdn::bigint;
    IF NOT FOUND THEN
      UPDATE public."SW_TBL_PROFILE_MERCHANT" SET "Fail_Attempt"=COALESCE("Fail_Attempt",0)+1,
        "Modified_Date"=CURRENT_TIMESTAMP WHERE "MSISDN"=p_msisdn::bigint;
    END IF;
  ELSIF p_action='FailAttemptReset' THEN
    UPDATE public."SW_TBL_PROFILE_CUST" SET "Fail_Attempt"=0
    WHERE "MSISDN"=p_msisdn::bigint;
    IF NOT FOUND THEN
      UPDATE public."SW_TBL_PROFILE_MERCHANT" SET "Fail_Attempt"=0,
        "Modified_Date"=CURRENT_TIMESTAMP WHERE "MSISDN"=p_msisdn::bigint;
    END IF;
  END IF;

  RETURN QUERY
  SELECT credentials.pin,credentials.failed_attempts,credentials.account_status
  FROM (
    SELECT customer."PIN" AS pin,COALESCE(customer."Fail_Attempt",0)::integer AS failed_attempts,
           customer."Status"::integer AS account_status,1 AS priority
    FROM public."SW_TBL_PROFILE_CUST" customer
    WHERE customer."MSISDN"=p_msisdn::bigint
    UNION ALL
    SELECT merchant."PIN",COALESCE(merchant."Fail_Attempt",0)::integer,
           merchant."Status"::integer,2
    FROM public."SW_TBL_PROFILE_MERCHANT" merchant
    WHERE merchant."MSISDN"=p_msisdn::bigint
  ) credentials
  ORDER BY credentials.priority
  LIMIT 1;
END $$;

CREATE OR REPLACE VIEW public."SW_VIEW_ALLUSER" AS
SELECT wallet."Wallet_MSISDN" AS "MSISDN",wallet."Amount",
       concat_ws(' ',profile."First_Name",profile."Last_Name") AS "Full_Name",
       wallet."Account_code"::text AS "Acc_Code",profile."Email",
       profile."ID_Type",profile."ID_Number",profile."Created_Date",
       profile."PIN",profile."Modified_Date",profile."Approved_Date",
       wallet_type."Wallet_Type",profile."Status",profile."Fail_Attempt",
       profile."User_Scope",wallet."Parent" AS "PARENT_MSISDN",
       profile."SMSNotification",profile."Approved_By",profile."Modified_By",
       profile."Created_By",profile."Reset_Pin_Attempt",profile."Image",
       NULL::smallint AS "CHARGERULE",NULL::smallint AS "COMMISSIONRULE",
       wallet."Wallet_Code"::smallint AS "Wallet_Code",wallet.is_default,
       wallet."Mobile_Number"
FROM public."SW_TBL_WALLET" wallet
LEFT JOIN public."SW_TBL_PROFILE_CUST" profile
  ON profile."MSISDN"=wallet.owner_msisdn
LEFT JOIN public."SW_TBL_WALLET_TYPE" wallet_type
  ON wallet_type."Wallet_ID"=wallet."Wallet_Code"
WHERE wallet.owner_type='CUSTOMER'
UNION ALL
SELECT wallet."Wallet_MSISDN",wallet."Amount",merchant."Merchant_Name",
       wallet."Account_code"::text,merchant."Email",
       NULL::varchar,NULL::varchar,merchant."Created_Date",
       merchant."PIN",merchant."Modified_Date",NULL::timestamp,
       wallet_type."Wallet_Type",merchant."Status",merchant."Fail_Attempt",
       merchant."User_Scope",wallet."Parent",true,NULL::text,merchant."Modified_By",
       merchant."Created_By",merchant."Reset_Pin_Attempt",NULL::text,
       NULL::smallint,NULL::smallint,wallet."Wallet_Code"::smallint,wallet.is_default,
       wallet."Mobile_Number"
FROM public."SW_TBL_WALLET" wallet
JOIN public."SW_TBL_PROFILE_MERCHANT" merchant
  ON merchant."MSISDN"=wallet.owner_msisdn
LEFT JOIN public."SW_TBL_WALLET_TYPE" wallet_type
  ON wallet_type."Wallet_ID"=wallet."Wallet_Code"
WHERE wallet.owner_type='MERCHANT';

COMMIT;
