BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_account_opening_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_msisdn bigint NOT NULL UNIQUE
    REFERENCES public."SW_TBL_PROFILE_CUST"("MSISDN") ON DELETE RESTRICT,
  wallet_code integer NOT NULL
    REFERENCES public."SW_TBL_WALLET_TYPE"("Wallet_ID") ON DELETE RESTRICT,
  currency varchar(3) NOT NULL,
  iban varchar(34) NULL,
  swift_bic varchar(11) NULL,
  kyc_required boolean NOT NULL,
  kyc_case_id uuid NULL REFERENCES kyc.cases(id) ON DELETE SET NULL,
  status varchar(24) NOT NULL,
  wallet_msisdn bigint NULL,
  requested_by varchar(100) NOT NULL,
  completed_by varchar(100) NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamp without time zone NULL,
  CONSTRAINT "CK_CUSTOMER_ACCOUNT_OPENING_STATUS" CHECK (
    status IN ('PENDING_KYC','READY_TO_OPEN','KYC_REJECTED','OPENED','CANCELLED')
  ),
  CONSTRAINT "CK_CUSTOMER_ACCOUNT_OPENING_CURRENCY" CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX IF NOT EXISTS "IDX_CUSTOMER_ACCOUNT_OPENING_QUEUE"
  ON public.customer_account_opening_requests(status,created_at);

CREATE OR REPLACE FUNCTION public.sw_fn_enforce_wallet_kyc()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_kyc_required boolean := false;
BEGIN
  IF NEW.owner_type IS DISTINCT FROM 'CUSTOMER' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE("Is_Kyc_Needed",false)
  INTO v_kyc_required
  FROM public."SW_TBL_WALLET_TYPE"
  WHERE "Wallet_ID"=NEW."Wallet_Code";

  IF v_kyc_required AND NOT EXISTS (
    SELECT 1 FROM kyc.cases
    WHERE customer_msisdn=NEW.owner_msisdn AND status='APPROVED'
  ) THEN
    RAISE EXCEPTION 'KYC approval is required for customer % and wallet type %',
      NEW.owner_msisdn,NEW."Wallet_Code"
      USING ERRCODE='23514',CONSTRAINT='CK_CUSTOMER_WALLET_KYC_APPROVED';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "TRG_CUSTOMER_WALLET_KYC" ON public."SW_TBL_WALLET";
CREATE TRIGGER "TRG_CUSTOMER_WALLET_KYC"
BEFORE INSERT OR UPDATE OF "Wallet_Code",owner_msisdn,owner_type
ON public."SW_TBL_WALLET"
FOR EACH ROW EXECUTE FUNCTION public.sw_fn_enforce_wallet_kyc();

ALTER TABLE public.customer_profile_operation_audit
  DROP CONSTRAINT IF EXISTS "CK_CUSTOMER_PROFILE_AUDIT_OPERATION";
ALTER TABLE public.customer_profile_operation_audit
  ADD CONSTRAINT "CK_CUSTOMER_PROFILE_AUDIT_OPERATION"
  CHECK (operation IN (
    'CUSTOMER_CREATE','STATUS_CHANGE','PROFILE_UPDATE','KYC_UPDATE',
    'ACCOUNT_OPENING_REQUEST','ACCOUNT_OPENING_COMPLETE'
  ));

COMMIT;
