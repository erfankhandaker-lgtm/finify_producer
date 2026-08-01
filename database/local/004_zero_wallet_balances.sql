\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.sw_tbl_accounting_entry)
     OR EXISTS (SELECT 1 FROM public.sw_tbl_accounting_journal)
     OR EXISTS (SELECT 1 FROM public."SW_TBL_TRANSACTION_REQUEST")
     OR EXISTS (SELECT 1 FROM public.treasury_funding_requests) THEN
    RAISE EXCEPTION
      'Operational financial data must be cleared with 003_reset_transaction_test_data.sql before wallet balances are zeroed';
  END IF;
END
$guard$;

UPDATE public."SW_TBL_WALLET"
SET "Amount"=0,
    "Balance_Before"=0,
    commission_balance=0,
    "Last_Transaction_ID"=NULL,
    "Last_Transaction_Amount"=NULL,
    "Modified_By"='LOCAL_FULL_FINANCIAL_RESET',
    "Modified_Date"=CURRENT_TIMESTAMP;

COMMIT;

SELECT count(*)::int AS wallets_zeroed
FROM public."SW_TBL_WALLET"
WHERE "Amount"=0
  AND COALESCE("Balance_Before",0)=0
  AND COALESCE(commission_balance,0)=0;
