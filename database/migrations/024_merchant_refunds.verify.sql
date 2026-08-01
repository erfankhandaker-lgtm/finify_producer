DO $verify$
BEGIN
  IF to_regclass('public.sw_tbl_merchant_refund') IS NULL THEN
    RAISE EXCEPTION 'Merchant refund table is missing';
  END IF;
  IF to_regprocedure('public.sw_proc_full_merchant_refund(bigint,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Merchant refund function is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='UQ_MERCHANT_REFUND_ORIGINAL'
  ) THEN
    RAISE EXCEPTION 'One-full-refund constraint is missing';
  END IF;
END
$verify$;

SELECT 'Merchant refund schema verified' AS result;
