DO $$
DECLARE
  v_scored integer;
  v_linked integer;
BEGIN
  SELECT count(*) INTO v_scored
  FROM public.credit_scored_customers;

  SELECT count(*) INTO v_linked
  FROM public.credit_scored_customers scored
  JOIN public."SW_TBL_PROFILE_CUST" profile
    ON profile."MSISDN" = scored.profile_msisdn;

  IF v_linked <> v_scored THEN
    RAISE EXCEPTION 'Scored/profile link verification failed: % of % linked',
      v_linked, v_scored;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'FK_CREDIT_SCORED_CUSTOMER_PROFILE'
      AND condeferrable
      AND condeferred
  ) THEN
    RAISE EXCEPTION 'Deferred scored/profile foreign key is missing';
  END IF;
END
$$;

SELECT
  count(*)::integer AS scored_rows,
  count(DISTINCT customer_msisdn)::integer AS linked_profiles
FROM public.customer_scored_profiles;
