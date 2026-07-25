BEGIN;

DROP FUNCTION IF EXISTS public.sw_proc_aml_finalize(bigint, varchar, varchar, integer, bigint);
DROP FUNCTION IF EXISTS public.sw_proc_aml_reserve(bigint, bigint, varchar, numeric);
DROP TABLE IF EXISTS public.sw_tbl_aml_transaction_reservation;

COMMIT;
