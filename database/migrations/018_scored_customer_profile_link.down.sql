BEGIN;

DROP VIEW IF EXISTS public.customer_scored_profiles;

ALTER TABLE public.credit_scored_customers
  DROP CONSTRAINT IF EXISTS "FK_CREDIT_SCORED_CUSTOMER_PROFILE";

DROP INDEX IF EXISTS public."IDX_CREDIT_SCORED_PROFILE_MSISDN";

ALTER TABLE public.credit_scored_customers
  DROP COLUMN IF EXISTS profile_msisdn;

COMMIT;
