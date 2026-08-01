BEGIN;

DROP VIEW IF EXISTS public."SW_VIEW_ALLUSER";

CREATE VIEW public."SW_VIEW_ALLUSER" AS
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
  ON profile."MSISDN"=wallet."Mobile_Number"
LEFT JOIN public."SW_TBL_WALLET_TYPE" wallet_type
  ON wallet_type."Wallet_ID"=wallet."Wallet_Code";

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
  ELSIF p_action='FailedWalletPin' THEN
    UPDATE public."SW_TBL_PROFILE_CUST" SET "Fail_Attempt"=COALESCE("Fail_Attempt",0)+1
    WHERE "MSISDN"=p_msisdn::bigint;
  ELSIF p_action='FailAttemptReset' THEN
    UPDATE public."SW_TBL_PROFILE_CUST" SET "Fail_Attempt"=0
    WHERE "MSISDN"=p_msisdn::bigint;
  END IF;

  RETURN QUERY
  SELECT customer."PIN",COALESCE(customer."Fail_Attempt",0)::integer,
         customer."Status"::integer
  FROM public."SW_TBL_PROFILE_CUST" customer
  WHERE customer."MSISDN"=p_msisdn::bigint
  LIMIT 1;
END $$;

ALTER TABLE public."SW_TBL_PROFILE_MERCHANT"
  DROP COLUMN IF EXISTS "PIN",
  DROP COLUMN IF EXISTS "Fail_Attempt",
  DROP COLUMN IF EXISTS "Reset_Pin_Attempt",
  DROP COLUMN IF EXISTS "User_Scope";

COMMIT;
