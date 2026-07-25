BEGIN;

CREATE TABLE IF NOT EXISTS public.sw_tbl_aml_transaction_reservation (
  transactionid bigint PRIMARY KEY,
  wallet_msisdn bigint NOT NULL,
  wallet_code integer NOT NULL,
  keyword varchar(5) NOT NULL,
  amount numeric(20,2) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'PENDING',
  reserved_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finalized_at timestamp without time zone NULL,
  consumer_topic varchar(255) NULL,
  consumer_partition integer NULL,
  consumer_offset bigint NULL,
  last_error text NULL,
  CONSTRAINT "FK_AML_RESERVATION_TRANSACTION"
    FOREIGN KEY (transactionid) REFERENCES public."SW_TBL_TRANSACTION_REQUEST"("Transaction_ID")
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "FK_AML_RESERVATION_WALLET_CODE"
    FOREIGN KEY (wallet_code) REFERENCES public."SW_TBL_WALLET_TYPE"("Wallet_ID")
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "FK_AML_RESERVATION_KEYWORD"
    FOREIGN KEY (keyword) REFERENCES public."SW_TBL_KEYWORD"("Keyword")
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "CK_AML_RESERVATION_AMOUNT" CHECK (amount > 0),
  CONSTRAINT "CK_AML_RESERVATION_STATUS"
    CHECK (status IN ('PENDING', 'COMPLETED', 'RELEASED', 'REVERSED'))
);

CREATE INDEX IF NOT EXISTS "IDX_AML_RESERVATION_USAGE"
  ON public.sw_tbl_aml_transaction_reservation
  (wallet_msisdn, keyword, status, reserved_at);

CREATE OR REPLACE FUNCTION public.sw_proc_aml_reserve(
  p_transactionid bigint,
  p_wallet_msisdn bigint,
  p_keyword varchar,
  p_amount numeric
)
RETURNS TABLE(
  success boolean,
  status_code varchar,
  status_message text,
  transaction_id bigint,
  reservation_status varchar,
  wallet_code integer,
  daily_amount_used numeric,
  daily_transaction_used bigint,
  monthly_amount_used numeric,
  monthly_transaction_used bigint
)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_keyword varchar(5) := upper(trim(p_keyword));
  v_wallet_code integer;
  v_config public."SW_TBL_AML"%ROWTYPE;
  v_existing public.sw_tbl_aml_transaction_reservation%ROWTYPE;
  v_summary_daily_amount numeric := 0;
  v_summary_daily_count bigint := 0;
  v_summary_monthly_amount numeric := 0;
  v_summary_monthly_count bigint := 0;
  v_pending_daily_amount numeric := 0;
  v_pending_daily_count bigint := 0;
  v_pending_monthly_amount numeric := 0;
  v_pending_monthly_count bigint := 0;
  v_daily_amount numeric;
  v_daily_count bigint;
  v_monthly_amount numeric;
  v_monthly_count bigint;
BEGIN
  IF p_transactionid IS NULL OR p_wallet_msisdn IS NULL OR v_keyword IS NULL OR v_keyword = '' THEN
    RETURN QUERY SELECT false, 'INVALID_REQUEST'::varchar, 'Transaction, source wallet, and keyword are required'::text,
      p_transactionid, NULL::varchar, NULL::integer, 0::numeric, 0::bigint, 0::numeric, 0::bigint;
    RETURN;
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN QUERY SELECT false, 'INVALID_AMOUNT'::varchar, 'Transaction amount must be greater than zero'::text,
      p_transactionid, NULL::varchar, NULL::integer, 0::numeric, 0::bigint, 0::numeric, 0::bigint;
    RETURN;
  END IF;

  -- Serializes all AML decisions for a source wallet and keyword. This prevents
  -- simultaneous producer requests from each passing against the same balance.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_wallet_msisdn::text || ':' || v_keyword, 0));

  SELECT * INTO v_existing
  FROM public.sw_tbl_aml_transaction_reservation reservation
  WHERE reservation.transactionid = p_transactionid;
  IF FOUND THEN
    IF v_existing.wallet_msisdn <> p_wallet_msisdn
       OR v_existing.keyword <> v_keyword
       OR v_existing.amount <> round(p_amount, 2) THEN
      RETURN QUERY SELECT false, 'TRANSACTION_CONFLICT'::varchar,
        'Transaction ID is already associated with different AML details'::text,
        p_transactionid, v_existing.status, v_existing.wallet_code,
        0::numeric, 0::bigint, 0::numeric, 0::bigint;
      RETURN;
    END IF;
    IF v_existing.status IN ('PENDING', 'COMPLETED') THEN
      RETURN QUERY SELECT true,
        CASE WHEN v_existing.status='PENDING' THEN 'ALREADY_RESERVED' ELSE 'ALREADY_COMPLETED' END::varchar,
        'AML transaction was already processed idempotently'::text,
        p_transactionid, v_existing.status, v_existing.wallet_code,
        0::numeric, 0::bigint, 0::numeric, 0::bigint;
      RETURN;
    END IF;
    RETURN QUERY SELECT false, 'TRANSACTION_CLOSED'::varchar,
      ('AML reservation is already ' || v_existing.status)::text,
      p_transactionid, v_existing.status, v_existing.wallet_code,
      0::numeric, 0::bigint, 0::numeric, 0::bigint;
    RETURN;
  END IF;

  SELECT detail."Wallet_Code"::integer INTO v_wallet_code
  FROM public."walletdetail" detail
  WHERE detail."Wallet_MSISDN" = p_wallet_msisdn
  LIMIT 1;
  IF v_wallet_code IS NULL THEN
    RETURN QUERY SELECT false, 'SOURCE_WALLET_NOT_FOUND'::varchar, 'Source wallet was not found'::text,
      p_transactionid, NULL::varchar, NULL::integer, 0::numeric, 0::bigint, 0::numeric, 0::bigint;
    RETURN;
  END IF;

  SELECT * INTO v_config
  FROM public."SW_TBL_AML" aml
  WHERE aml."Wallet_Type" = v_wallet_code
    AND aml."Keyword" = v_keyword
    AND aml."Is_Active" = true;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'AML_CONFIGURATION_NOT_FOUND'::varchar,
      'No active AML configuration exists for the source wallet and keyword'::text,
      p_transactionid, NULL::varchar, v_wallet_code,
      0::numeric, 0::bigint, 0::numeric, 0::bigint;
    RETURN;
  END IF;

  IF p_amount > v_config."Max_Txn_Amount" THEN
    RETURN QUERY SELECT false, 'AML_MAX_TRANSACTION_EXCEEDED'::varchar,
      'Maximum transaction amount exceeded'::text, p_transactionid, NULL::varchar, v_wallet_code,
      0::numeric, 0::bigint, 0::numeric, 0::bigint;
    RETURN;
  END IF;

  SELECT
    CASE WHEN summary."Last_Update_Date"::date = CURRENT_DATE
      THEN COALESCE(summary."Daily_Amount"::numeric, 0) ELSE 0 END,
    CASE WHEN summary."Last_Update_Date"::date = CURRENT_DATE
      THEN COALESCE(summary."Daily_Transaction", 0)::bigint ELSE 0 END,
    CASE WHEN date_trunc('month', summary."Last_Update_Date") = date_trunc('month', CURRENT_TIMESTAMP)
      THEN COALESCE(summary."Monthly_Amount"::numeric, 0) ELSE 0 END,
    CASE WHEN date_trunc('month', summary."Last_Update_Date") = date_trunc('month', CURRENT_TIMESTAMP)
      THEN COALESCE(summary."Monthly_Transaction", 0)::bigint ELSE 0 END
  INTO v_summary_daily_amount, v_summary_daily_count, v_summary_monthly_amount, v_summary_monthly_count
  FROM public."SW_TBL_AML_SUMMARY" summary
  WHERE summary."Wallet_MSISDN" = p_wallet_msisdn AND summary."Keyword" = v_keyword;

  SELECT
    COALESCE(sum(reservation.amount) FILTER (WHERE reservation.reserved_at::date = CURRENT_DATE), 0),
    count(*) FILTER (WHERE reservation.reserved_at::date = CURRENT_DATE),
    COALESCE(sum(reservation.amount) FILTER (
      WHERE date_trunc('month', reservation.reserved_at) = date_trunc('month', CURRENT_TIMESTAMP)), 0),
    count(*) FILTER (
      WHERE date_trunc('month', reservation.reserved_at) = date_trunc('month', CURRENT_TIMESTAMP))
  INTO v_pending_daily_amount, v_pending_daily_count, v_pending_monthly_amount, v_pending_monthly_count
  FROM public.sw_tbl_aml_transaction_reservation reservation
  WHERE reservation.wallet_msisdn = p_wallet_msisdn
    AND reservation.keyword = v_keyword
    AND reservation.status = 'PENDING';

  v_daily_amount := v_summary_daily_amount + v_pending_daily_amount + round(p_amount, 2);
  v_daily_count := v_summary_daily_count + v_pending_daily_count + 1;
  v_monthly_amount := v_summary_monthly_amount + v_pending_monthly_amount + round(p_amount, 2);
  v_monthly_count := v_summary_monthly_count + v_pending_monthly_count + 1;

  IF v_daily_amount > v_config."Daily_Max_Amount" THEN
    RETURN QUERY SELECT false, 'AML_DAILY_AMOUNT_EXCEEDED'::varchar, 'Daily AML amount limit exceeded'::text,
      p_transactionid, NULL::varchar, v_wallet_code,
      v_daily_amount, v_daily_count, v_monthly_amount, v_monthly_count;
    RETURN;
  END IF;
  IF v_daily_count > v_config."Daily_Transaction_Count" THEN
    RETURN QUERY SELECT false, 'AML_DAILY_COUNT_EXCEEDED'::varchar, 'Daily AML transaction count exceeded'::text,
      p_transactionid, NULL::varchar, v_wallet_code,
      v_daily_amount, v_daily_count, v_monthly_amount, v_monthly_count;
    RETURN;
  END IF;
  IF v_monthly_amount > v_config."Monthly_Max_Amount" THEN
    RETURN QUERY SELECT false, 'AML_MONTHLY_AMOUNT_EXCEEDED'::varchar, 'Monthly AML amount limit exceeded'::text,
      p_transactionid, NULL::varchar, v_wallet_code,
      v_daily_amount, v_daily_count, v_monthly_amount, v_monthly_count;
    RETURN;
  END IF;
  IF v_monthly_count > v_config."Monthly_Transaction_Count" THEN
    RETURN QUERY SELECT false, 'AML_MONTHLY_COUNT_EXCEEDED'::varchar, 'Monthly AML transaction count exceeded'::text,
      p_transactionid, NULL::varchar, v_wallet_code,
      v_daily_amount, v_daily_count, v_monthly_amount, v_monthly_count;
    RETURN;
  END IF;

  INSERT INTO public.sw_tbl_aml_transaction_reservation
    (transactionid, wallet_msisdn, wallet_code, keyword, amount)
  VALUES (p_transactionid, p_wallet_msisdn, v_wallet_code, v_keyword, round(p_amount, 2));

  RETURN QUERY SELECT true, 'RESERVED'::varchar, 'AML limits passed and capacity was reserved'::text,
    p_transactionid, 'PENDING'::varchar, v_wallet_code,
    v_daily_amount, v_daily_count, v_monthly_amount, v_monthly_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sw_proc_aml_finalize(
  p_transactionid bigint,
  p_outcome varchar,
  p_consumer_topic varchar DEFAULT NULL,
  p_consumer_partition integer DEFAULT NULL,
  p_consumer_offset bigint DEFAULT NULL
)
RETURNS TABLE(success boolean, status_code varchar, status_message text, reservation_status varchar)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_outcome varchar(16) := upper(trim(p_outcome));
  v_reservation public.sw_tbl_aml_transaction_reservation%ROWTYPE;
  v_same_day boolean;
  v_same_month boolean;
BEGIN
  SELECT * INTO v_reservation
  FROM public.sw_tbl_aml_transaction_reservation reservation
  WHERE reservation.transactionid = p_transactionid
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'RESERVATION_NOT_FOUND'::varchar,
      'No AML reservation exists for this transaction'::text, NULL::varchar;
    RETURN;
  END IF;

  IF v_outcome = 'COMPLETED' THEN
    IF v_reservation.status = 'COMPLETED' THEN
      RETURN QUERY SELECT true, 'ALREADY_COMPLETED'::varchar,
        'AML summary was already completed'::text, v_reservation.status;
      RETURN;
    END IF;
    IF v_reservation.status <> 'PENDING' THEN
      RETURN QUERY SELECT false, 'INVALID_STATE'::varchar,
        ('Cannot complete a ' || v_reservation.status || ' AML reservation')::text, v_reservation.status;
      RETURN;
    END IF;

    INSERT INTO public."SW_TBL_AML_SUMMARY"
      ("Wallet_MSISDN", "Keyword", "Monthly_Amount", "Monthly_Transaction",
       "Daily_Amount", "Daily_Transaction", "Last_Update_Date")
    VALUES
      (v_reservation.wallet_msisdn, v_reservation.keyword, v_reservation.amount::money, 1,
       v_reservation.amount::money, 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("Wallet_MSISDN", "Keyword") DO UPDATE SET
      "Daily_Amount" = (CASE
        WHEN "SW_TBL_AML_SUMMARY"."Last_Update_Date"::date = CURRENT_DATE
          THEN COALESCE("SW_TBL_AML_SUMMARY"."Daily_Amount"::numeric, 0) + v_reservation.amount
        ELSE v_reservation.amount END)::money,
      "Daily_Transaction" = CASE
        WHEN "SW_TBL_AML_SUMMARY"."Last_Update_Date"::date = CURRENT_DATE
          THEN COALESCE("SW_TBL_AML_SUMMARY"."Daily_Transaction", 0) + 1
        ELSE 1 END,
      "Monthly_Amount" = (CASE
        WHEN date_trunc('month', "SW_TBL_AML_SUMMARY"."Last_Update_Date") = date_trunc('month', CURRENT_TIMESTAMP)
          THEN COALESCE("SW_TBL_AML_SUMMARY"."Monthly_Amount"::numeric, 0) + v_reservation.amount
        ELSE v_reservation.amount END)::money,
      "Monthly_Transaction" = CASE
        WHEN date_trunc('month', "SW_TBL_AML_SUMMARY"."Last_Update_Date") = date_trunc('month', CURRENT_TIMESTAMP)
          THEN COALESCE("SW_TBL_AML_SUMMARY"."Monthly_Transaction", 0) + 1
        ELSE 1 END,
      "Last_Update_Date" = CURRENT_TIMESTAMP;

    UPDATE public.sw_tbl_aml_transaction_reservation SET
      status='COMPLETED', finalized_at=CURRENT_TIMESTAMP,
      consumer_topic=p_consumer_topic, consumer_partition=p_consumer_partition,
      consumer_offset=p_consumer_offset, last_error=NULL
    WHERE transactionid=p_transactionid;
    RETURN QUERY SELECT true, 'COMPLETED'::varchar,
      'AML summary updated successfully'::text, 'COMPLETED'::varchar;
    RETURN;
  END IF;

  IF v_outcome = 'RELEASED' THEN
    IF v_reservation.status = 'RELEASED' THEN
      RETURN QUERY SELECT true, 'ALREADY_RELEASED'::varchar,
        'AML reservation was already released'::text, v_reservation.status;
      RETURN;
    END IF;
    IF v_reservation.status <> 'PENDING' THEN
      RETURN QUERY SELECT false, 'INVALID_STATE'::varchar,
        ('Cannot release a ' || v_reservation.status || ' AML reservation')::text, v_reservation.status;
      RETURN;
    END IF;
    UPDATE public.sw_tbl_aml_transaction_reservation SET
      status='RELEASED', finalized_at=CURRENT_TIMESTAMP,
      consumer_topic=COALESCE(p_consumer_topic,consumer_topic),
      consumer_partition=COALESCE(p_consumer_partition,consumer_partition),
      consumer_offset=COALESCE(p_consumer_offset,consumer_offset)
    WHERE transactionid=p_transactionid;
    RETURN QUERY SELECT true, 'RELEASED'::varchar,
      'AML reservation released without changing the summary'::text, 'RELEASED'::varchar;
    RETURN;
  END IF;

  IF v_outcome = 'REVERSED' THEN
    IF v_reservation.status = 'REVERSED' THEN
      RETURN QUERY SELECT true, 'ALREADY_REVERSED'::varchar,
        'AML summary was already reversed'::text, v_reservation.status;
      RETURN;
    END IF;
    IF v_reservation.status <> 'COMPLETED' THEN
      RETURN QUERY SELECT false, 'INVALID_STATE'::varchar,
        ('Cannot reverse a ' || v_reservation.status || ' AML reservation')::text, v_reservation.status;
      RETURN;
    END IF;

    SELECT
      summary."Last_Update_Date"::date = v_reservation.reserved_at::date,
      date_trunc('month', summary."Last_Update_Date") = date_trunc('month', v_reservation.reserved_at)
    INTO v_same_day, v_same_month
    FROM public."SW_TBL_AML_SUMMARY" summary
    WHERE summary."Wallet_MSISDN"=v_reservation.wallet_msisdn
      AND summary."Keyword"=v_reservation.keyword
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN QUERY SELECT false, 'SUMMARY_NOT_FOUND'::varchar,
        'AML summary row was not found for reversal'::text, v_reservation.status;
      RETURN;
    END IF;

    UPDATE public."SW_TBL_AML_SUMMARY" SET
      "Daily_Amount" = (CASE WHEN v_same_day
        THEN greatest(COALESCE("Daily_Amount"::numeric,0)-v_reservation.amount,0)
        ELSE COALESCE("Daily_Amount"::numeric,0) END)::money,
      "Daily_Transaction" = CASE WHEN v_same_day
        THEN greatest(COALESCE("Daily_Transaction",0)-1,0)
        ELSE COALESCE("Daily_Transaction",0) END,
      "Monthly_Amount" = (CASE WHEN v_same_month
        THEN greatest(COALESCE("Monthly_Amount"::numeric,0)-v_reservation.amount,0)
        ELSE COALESCE("Monthly_Amount"::numeric,0) END)::money,
      "Monthly_Transaction" = CASE WHEN v_same_month
        THEN greatest(COALESCE("Monthly_Transaction",0)-1,0)
        ELSE COALESCE("Monthly_Transaction",0) END,
      "Last_Update_Date" = CURRENT_TIMESTAMP
    WHERE "Wallet_MSISDN"=v_reservation.wallet_msisdn AND "Keyword"=v_reservation.keyword;

    UPDATE public.sw_tbl_aml_transaction_reservation SET
      status='REVERSED', finalized_at=CURRENT_TIMESTAMP,
      consumer_topic=COALESCE(p_consumer_topic,consumer_topic),
      consumer_partition=COALESCE(p_consumer_partition,consumer_partition),
      consumer_offset=COALESCE(p_consumer_offset,consumer_offset), last_error=NULL
    WHERE transactionid=p_transactionid;
    RETURN QUERY SELECT true, 'REVERSED'::varchar,
      'AML summary reversal completed'::text, 'REVERSED'::varchar;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, 'INVALID_OUTCOME'::varchar,
    'Outcome must be COMPLETED, RELEASED, or REVERSED'::text, v_reservation.status;
END;
$function$;

COMMIT;
