BEGIN;
DROP FUNCTION IF EXISTS public.sw_proc_full_merchant_refund(bigint,text,text,text);
DROP TABLE IF EXISTS public.sw_tbl_merchant_refund;
DROP SEQUENCE IF EXISTS public.sw_seq_merchant_refund_transaction;
COMMIT;
