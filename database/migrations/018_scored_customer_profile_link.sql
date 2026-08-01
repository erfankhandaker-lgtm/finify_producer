BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.credit_scored_customers scored
    WHERE NULLIF(
      regexp_replace(COALESCE(scored.msisdn, ''), '[^0-9]', '', 'g'),
      ''
    ) IS NULL
  ) THEN
    RAISE EXCEPTION 'Every scored customer must have a valid MSISDN before migration 018';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.credit_scored_customers scored
    LEFT JOIN public."SW_TBL_PROFILE_CUST" profile
      ON profile."MSISDN"::text =
         regexp_replace(COALESCE(scored.msisdn, ''), '[^0-9]', '', 'g')
    WHERE profile."MSISDN" IS NULL
  ) THEN
    RAISE EXCEPTION 'Every scored customer must have a matching customer profile before migration 018';
  END IF;
END
$$;

ALTER TABLE public.credit_scored_customers
  ADD COLUMN IF NOT EXISTS profile_msisdn bigint
  GENERATED ALWAYS AS (
    NULLIF(
      regexp_replace(COALESCE(msisdn, ''), '[^0-9]', '', 'g'),
      ''
    )::bigint
  ) STORED;

ALTER TABLE public.credit_scored_customers
  ALTER COLUMN profile_msisdn SET NOT NULL;

ALTER TABLE public.credit_scored_customers
  DROP CONSTRAINT IF EXISTS "FK_CREDIT_SCORED_CUSTOMER_PROFILE";

ALTER TABLE public.credit_scored_customers
  ADD CONSTRAINT "FK_CREDIT_SCORED_CUSTOMER_PROFILE"
  FOREIGN KEY (profile_msisdn)
  REFERENCES public."SW_TBL_PROFILE_CUST"("MSISDN")
  ON UPDATE RESTRICT
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS "IDX_CREDIT_SCORED_PROFILE_MSISDN"
  ON public.credit_scored_customers(profile_msisdn, updated_at DESC, _id DESC);

COMMENT ON COLUMN public.credit_scored_customers.profile_msisdn IS
  'Normalized MSISDN relationship to SW_TBL_PROFILE_CUST.MSISDN.';

CREATE OR REPLACE VIEW public.customer_scored_profiles AS
SELECT
  profile."MSISDN" AS customer_msisdn,
  profile."Status" AS customer_status,
  profile."KYC_Status" AS kyc_status,
  scored._id AS score_id,
  scored.credit_score,
  scored.customer_category,
  scored.credit_limit,
  scored.current_credit_limit,
  scored.max_instalment,
  scored.current_dpd,
  scored.score_model_id,
  scored.score_model_version,
  scored.scored_at,
  scored.score_expires_at,
  scored.updated_at AS score_updated_at
FROM public."SW_TBL_PROFILE_CUST" profile
JOIN LATERAL (
  SELECT score.*
  FROM public.credit_scored_customers score
  WHERE score.profile_msisdn = profile."MSISDN"
  ORDER BY score.updated_at DESC, score._id DESC
  LIMIT 1
) scored ON true;

COMMIT;
