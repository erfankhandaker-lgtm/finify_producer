\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE transaction_wallet_net AS
SELECT accountnumber,
       round(sum("Credit")-sum("Debit"),2) AS net_movement
FROM public.sw_tbl_accounting_entry
GROUP BY accountnumber;

UPDATE public."SW_TBL_WALLET" wallet
SET "Amount"=wallet."Amount"-net.net_movement,
    "Balance_Before"=wallet."Amount"-net.net_movement,
    "Last_Transaction_ID"=NULL,
    "Last_Transaction_Amount"=NULL,
    "Modified_By"='LOCAL_TRANSACTION_RESET',
    "Modified_Date"=CURRENT_TIMESTAMP
FROM transaction_wallet_net net
WHERE wallet."Wallet_MSISDN"=net.accountnumber;

CREATE TEMP TABLE treasury_wallet_net AS
SELECT wallet_msisdn,
       round(sum(CASE WHEN direction='CREDIT' THEN amount ELSE -amount END),2) AS net_movement
FROM public.treasury_funding_requests
WHERE status='APPROVED'
GROUP BY wallet_msisdn;

UPDATE public."SW_TBL_WALLET" wallet
SET "Amount"=wallet."Amount"-net.net_movement,
    "Balance_Before"=wallet."Amount"-net.net_movement,
    "Last_Transaction_ID"=NULL,
    "Last_Transaction_Amount"=NULL,
    "Modified_By"='LOCAL_ACCOUNTING_RESET',
    "Modified_Date"=CURRENT_TIMESTAMP
FROM treasury_wallet_net net
WHERE wallet."Wallet_MSISDN"=net.wallet_msisdn;

-- Preserve uploaded MinIO evidence while detaching it from reset movement rows.
UPDATE public.treasury_documents
SET treasury_request_id=NULL,status='UPLOADED',attached_at=NULL
WHERE treasury_request_id IS NOT NULL;

DELETE FROM public.treasury_funding_requests;
DELETE FROM public.sw_tbl_wallet_operation_audit
WHERE operation IN ('TREASURY_FUNDING','TREASURY_WITHDRAWAL');

DELETE FROM public.sw_tbl_merchant_refund;
DELETE FROM public.sw_tbl_merchant_confirmation;
DELETE FROM public.sw_tbl_merchant_integration_attempt;
DELETE FROM public.sw_tbl_transaction_dispute;
DELETE FROM public.aml_cases;
DELETE FROM public.sw_tbl_aml_transaction_reservation;
DELETE FROM public.sw_tbl_charge_account_history;
DELETE FROM public.sw_tbl_comission_account_history;
DELETE FROM public."SW_TBL_TRANSACTION_DETAILS";
DELETE FROM public."SW_TBL_TRANSACTION_TEMP";
DELETE FROM public.sw_tbl_transaction_entry;
DELETE FROM public.sw_tbl_accounting_entry;
DELETE FROM public.sw_tbl_accounting_journal;
DELETE FROM public."SW_TBL_TRANSACTION_REQUEST";

DELETE FROM public.sw_tbl_daily_gl_balance;
DELETE FROM public.sw_tbl_daily_wallet_balance;
DELETE FROM public.sw_tbl_eod_exception;
DELETE FROM public.sw_tbl_eod_run_step;
DELETE FROM public.sw_tbl_eod_run;
DELETE FROM public.sw_tbl_eod_batch;
DELETE FROM public.sw_tbl_accounting_period;
DELETE FROM public.sw_tbl_eod_fx_rate;

UPDATE public."SW_TBL_AML_SUMMARY"
SET "Monthly_Amount"=0::money,
    "Monthly_Transaction"=0,
    "Daily_Amount"=0::money,
    "Daily_Transaction"=0,
    "Last_Update_Date"=CURRENT_TIMESTAMP;

COMMIT;

SELECT 'Local transaction, accounting, EOD, and treasury test data cleared; wallet effects unwound' AS result;
