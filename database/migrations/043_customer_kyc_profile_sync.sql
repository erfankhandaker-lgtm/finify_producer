BEGIN;

ALTER TABLE public."SW_TBL_PROFILE_CUST"
  ADD COLUMN IF NOT EXISTS "KYC_Case_ID" uuid NULL,
  ADD COLUMN IF NOT EXISTS "KYC_Verified_Date" timestamp without time zone NULL,
  ADD COLUMN IF NOT EXISTS "KYC_Verified_By" varchar(100) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='FK_CUSTOMER_PROFILE_APPROVED_KYC_CASE'
      AND conrelid='public."SW_TBL_PROFILE_CUST"'::regclass
  ) THEN
    ALTER TABLE public."SW_TBL_PROFILE_CUST"
      ADD CONSTRAINT "FK_CUSTOMER_PROFILE_APPROVED_KYC_CASE"
      FOREIGN KEY ("KYC_Case_ID") REFERENCES kyc.cases(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IDX_CUSTOMER_PROFILE_KYC_CASE"
  ON public."SW_TBL_PROFILE_CUST"("KYC_Case_ID")
  WHERE "KYC_Case_ID" IS NOT NULL;

WITH latest_approved AS (
  SELECT DISTINCT ON (cases.customer_msisdn)
         cases.customer_msisdn,cases.id,cases.reviewed_at,cases.reviewed_by
  FROM kyc.cases
  WHERE cases.status='APPROVED'
  ORDER BY cases.customer_msisdn,cases.reviewed_at DESC NULLS LAST,cases.created_at DESC
)
UPDATE public."SW_TBL_PROFILE_CUST" profile
SET "KYC_Case_ID"=approved.id,
    "KYC_Verified_Date"=approved.reviewed_at,
    "KYC_Verified_By"=approved.reviewed_by
FROM latest_approved approved
WHERE profile."KYC_Status"=1
  AND approved.customer_msisdn=profile."MSISDN"
  AND profile."KYC_Case_ID" IS NULL;

COMMENT ON COLUMN public."SW_TBL_PROFILE_CUST"."KYC_Case_ID" IS
  'Approved KYC case whose verified identity data was synchronized to this customer profile.';

COMMIT;
