BEGIN;

-- The legacy column is retained for compatibility. It stores Wallet_ID / Wallet_Code,
-- not the broad Wallet_Type classification (Customer/Merchant/Agent/etc.).
COMMENT ON COLUMN public."SW_TBL_AML"."Wallet_Type"
IS 'References SW_TBL_WALLET_TYPE.Wallet_ID (the wallet code), despite the legacy column name.';

ALTER TABLE public."SW_TBL_AML"
  ADD COLUMN IF NOT EXISTS "Is_Active" boolean NOT NULL DEFAULT true;

-- Repair impossible legacy relationships before adding invariant constraints.
UPDATE public."SW_TBL_AML"
SET "Max_Txn_Amount" = "Daily_Max_Amount"
WHERE "Max_Txn_Amount" > "Daily_Max_Amount";

UPDATE public."SW_TBL_AML"
SET "Monthly_Max_Amount" = "Daily_Max_Amount"
WHERE "Monthly_Max_Amount" < "Daily_Max_Amount";

UPDATE public."SW_TBL_AML"
SET "Monthly_Transaction_Count" = "Daily_Transaction_Count"
WHERE "Monthly_Transaction_Count" < "Daily_Transaction_Count";

ALTER TABLE public."SW_TBL_AML"
  ALTER COLUMN "Wallet_Type" SET NOT NULL,
  ALTER COLUMN "Keyword" SET NOT NULL,
  ALTER COLUMN "Max_Txn_Amount" SET NOT NULL,
  ALTER COLUMN "Monthly_Max_Amount" SET NOT NULL,
  ALTER COLUMN "Monthly_Transaction_Count" SET NOT NULL,
  ALTER COLUMN "Daily_Max_Amount" SET NOT NULL,
  ALTER COLUMN "Daily_Transaction_Count" SET NOT NULL;

ALTER TABLE public."SW_TBL_AML"
  DROP CONSTRAINT IF EXISTS "UQ_AML_WALLET_KEYWORD",
  DROP CONSTRAINT IF EXISTS "FK_AML_WALLET_CODE",
  DROP CONSTRAINT IF EXISTS "FK_AML_KEYWORD",
  DROP CONSTRAINT IF EXISTS "CK_AML_POSITIVE_LIMITS",
  DROP CONSTRAINT IF EXISTS "CK_AML_AMOUNT_ORDER",
  DROP CONSTRAINT IF EXISTS "CK_AML_COUNT_ORDER";

ALTER TABLE public."SW_TBL_AML"
  ADD CONSTRAINT "UQ_AML_WALLET_KEYWORD"
    UNIQUE ("Wallet_Type", "Keyword"),
  ADD CONSTRAINT "FK_AML_WALLET_CODE"
    FOREIGN KEY ("Wallet_Type") REFERENCES public."SW_TBL_WALLET_TYPE"("Wallet_ID")
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT "FK_AML_KEYWORD"
    FOREIGN KEY ("Keyword") REFERENCES public."SW_TBL_KEYWORD"("Keyword")
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT "CK_AML_POSITIVE_LIMITS"
    CHECK (
      "Max_Txn_Amount" > 0 AND "Daily_Max_Amount" > 0 AND "Monthly_Max_Amount" > 0
      AND "Daily_Transaction_Count" > 0 AND "Monthly_Transaction_Count" > 0
    ),
  ADD CONSTRAINT "CK_AML_AMOUNT_ORDER"
    CHECK ("Max_Txn_Amount" <= "Daily_Max_Amount" AND "Daily_Max_Amount" <= "Monthly_Max_Amount"),
  ADD CONSTRAINT "CK_AML_COUNT_ORDER"
    CHECK ("Daily_Transaction_Count" <= "Monthly_Transaction_Count");

ALTER TABLE public.reference_data_change_requests
  DROP CONSTRAINT IF EXISTS "CK_REFERENCE_CHANGE_RESOURCE";

ALTER TABLE public.reference_data_change_requests
  ADD CONSTRAINT "CK_REFERENCE_CHANGE_RESOURCE"
  CHECK (resource_type IN ('KEYWORD', 'WALLET_TYPE', 'AML'));

UPDATE public.admin_permissions
SET description = CASE code
  WHEN 'reference_data.read' THEN 'View keyword, wallet type, AML configuration, and maker-checker history'
  WHEN 'reference_data.make' THEN 'Submit keyword, wallet type, and AML configuration changes'
  WHEN 'reference_data.check' THEN 'Approve or reject keyword, wallet type, and AML configuration changes'
  ELSE description
END
WHERE code IN ('reference_data.read', 'reference_data.make', 'reference_data.check');

-- Development reference rules. These are deliberately modest and can be changed
-- through the maker-checker API. Existing rules are never overwritten.
INSERT INTO public."SW_TBL_AML" (
  "Wallet_Type", "Keyword", "Max_Txn_Amount", "Daily_Max_Amount",
  "Daily_Transaction_Count", "Monthly_Max_Amount", "Monthly_Transaction_Count",
  "Created_By", "Created_Date", "Approved_By", "Approved_Date", "Is_Active"
)
SELECT seed.wallet_code, seed.keyword, seed.max_txn, seed.daily_amount,
       seed.daily_count, seed.monthly_amount, seed.monthly_count,
       'MIGRATION_010_TEST', CURRENT_TIMESTAMP, 'MIGRATION_010_TEST', CURRENT_TIMESTAMP, true
FROM (VALUES
  (103::smallint, 'ADDM'::varchar, 500::numeric, 2000::numeric, 5::numeric, 10000::numeric, 30::numeric),
  (103::smallint, 'PMNT'::varchar, 1000::numeric, 5000::numeric, 10::numeric, 30000::numeric, 100::numeric),
  (103::smallint, 'SEND'::varchar, 750::numeric, 3000::numeric, 5::numeric, 20000::numeric, 50::numeric),
  (203::smallint, 'PMNT'::varchar, 5000::numeric, 25000::numeric, 25::numeric, 250000::numeric, 250::numeric)
) AS seed(wallet_code, keyword, max_txn, daily_amount, daily_count, monthly_amount, monthly_count)
WHERE EXISTS (SELECT 1 FROM public."SW_TBL_WALLET_TYPE" w WHERE w."Wallet_ID" = seed.wallet_code)
  AND EXISTS (SELECT 1 FROM public."SW_TBL_KEYWORD" k WHERE k."Keyword" = seed.keyword)
ON CONFLICT ("Wallet_Type", "Keyword") DO NOTHING;

COMMIT;
