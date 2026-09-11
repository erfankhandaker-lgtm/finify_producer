DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.business_merchants merchant
    JOIN public.business_merchant_types type ON type.code=merchant.merchant_type_code
    WHERE merchant.code='DTB' AND merchant.status='ACTIVE'
      AND merchant.country_code='UGA' AND type.code='BANK' AND type.is_active
      AND merchant.created_by<>merchant.approved_by
  ) THEN RAISE EXCEPTION 'DTB active bank-type merchant was not configured'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.credit_lenders lender
    JOIN public.business_merchants merchant ON merchant.id=lender.merchant_id
    WHERE lender.code='DTB_UGA' AND lender.status='ACTIVE' AND merchant.code='DTB'
      AND lender.created_by<>lender.approved_by
  ) THEN RAISE EXCEPTION 'DTB active credit lender link was not configured'; END IF;
END $$;
