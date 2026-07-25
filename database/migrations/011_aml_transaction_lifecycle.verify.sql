DO $verify$
BEGIN
  IF to_regclass('public.sw_tbl_aml_transaction_reservation') IS NULL THEN
    RAISE EXCEPTION 'AML transaction reservation table is missing';
  END IF;
  IF to_regprocedure('public.sw_proc_aml_reserve(bigint,bigint,character varying,numeric)') IS NULL THEN
    RAISE EXCEPTION 'AML reservation function is missing';
  END IF;
  IF to_regprocedure('public.sw_proc_aml_finalize(bigint,character varying,character varying,integer,bigint)') IS NULL THEN
    RAISE EXCEPTION 'AML finalization function is missing';
  END IF;
  IF (SELECT count(*) FROM pg_constraint
      WHERE conrelid='public.sw_tbl_aml_transaction_reservation'::regclass
        AND conname IN ('FK_AML_RESERVATION_TRANSACTION','FK_AML_RESERVATION_WALLET_CODE',
                        'FK_AML_RESERVATION_KEYWORD','CK_AML_RESERVATION_AMOUNT',
                        'CK_AML_RESERVATION_STATUS')) <> 5 THEN
    RAISE EXCEPTION 'AML transaction reservation constraints are incomplete';
  END IF;
END
$verify$;

SELECT 'AML transaction lifecycle migration verified' AS result;
