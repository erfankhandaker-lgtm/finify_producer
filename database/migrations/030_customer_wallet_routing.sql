BEGIN;

ALTER TABLE public."SW_TBL_WALLET"
  ADD COLUMN IF NOT EXISTS iban varchar(34) NULL,
  ADD COLUMN IF NOT EXISTS swift_bic varchar(11) NULL;

UPDATE public."SW_TBL_WALLET"
SET iban=NULLIF(upper(regexp_replace(iban,'[^A-Za-z0-9]','','g')),''),
    swift_bic=NULLIF(upper(regexp_replace(swift_bic,'[^A-Za-z0-9]','','g')),'')
WHERE iban IS NOT NULL OR swift_bic IS NOT NULL;

ALTER TABLE public."SW_TBL_WALLET"
  DROP CONSTRAINT IF EXISTS "CK_WALLET_IBAN_FORMAT",
  DROP CONSTRAINT IF EXISTS "CK_WALLET_SWIFT_BIC_FORMAT";

ALTER TABLE public."SW_TBL_WALLET"
  ADD CONSTRAINT "CK_WALLET_IBAN_FORMAT"
    CHECK (iban IS NULL OR iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  ADD CONSTRAINT "CK_WALLET_SWIFT_BIC_FORMAT"
    CHECK (swift_bic IS NULL OR swift_bic ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$');

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_WALLET_IBAN"
  ON public."SW_TBL_WALLET"(iban)
  WHERE iban IS NOT NULL;

CREATE INDEX IF NOT EXISTS "IDX_WALLET_SWIFT_BIC"
  ON public."SW_TBL_WALLET"(swift_bic)
  WHERE swift_bic IS NOT NULL;

-- A customer has one global default wallet, which also defines the default
-- currency used when a transaction does not explicitly select another wallet.
WITH ranked AS (
  SELECT wallet."Wallet_MSISDN",
         row_number() OVER (
           PARTITION BY wallet.owner_msisdn
           ORDER BY wallet.is_default DESC,
                    (wallet.wallet_purpose='CUSTOMER_MAIN') DESC,
                    wallet."Created_Date",wallet."Wallet_MSISDN"
         ) AS position
  FROM public."SW_TBL_WALLET" wallet
  WHERE wallet.owner_type='CUSTOMER' AND wallet."Status"<>6
)
UPDATE public."SW_TBL_WALLET" wallet
SET is_default=(ranked.position=1),
    wallet_purpose=CASE WHEN ranked.position=1
      THEN 'CUSTOMER_MAIN' ELSE 'CUSTOMER_ADDITIONAL' END,
    "Modified_By"='MIGRATION_030',
    "Modified_Date"=CURRENT_TIMESTAMP
FROM ranked
WHERE wallet."Wallet_MSISDN"=ranked."Wallet_MSISDN"
  AND (
    wallet.is_default IS DISTINCT FROM (ranked.position=1)
    OR wallet.wallet_purpose IS DISTINCT FROM CASE WHEN ranked.position=1
      THEN 'CUSTOMER_MAIN' ELSE 'CUSTOMER_ADDITIONAL' END
  );

DROP INDEX IF EXISTS public."IDX_WALLET_OWNER_DEFAULT";
CREATE UNIQUE INDEX "IDX_WALLET_OWNER_DEFAULT"
  ON public."SW_TBL_WALLET"(owner_msisdn)
  WHERE owner_type='CUSTOMER' AND is_default AND "Status"<>6;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_CUSTOMER_MAIN_WALLET"
  ON public."SW_TBL_WALLET"(owner_msisdn)
  WHERE owner_type='CUSTOMER' AND wallet_purpose='CUSTOMER_MAIN' AND "Status"<>6;

ALTER TABLE public.sw_tbl_wallet_operation_audit
  DROP CONSTRAINT IF EXISTS "CK_WALLET_AUDIT_OPERATION";
ALTER TABLE public.sw_tbl_wallet_operation_audit
  ADD CONSTRAINT "CK_WALLET_AUDIT_OPERATION"
  CHECK (operation IN (
    'CREATE','SET_DEFAULT','STATUS_CHANGE','ROUTING_UPDATE',
    'TREASURY_FUNDING','TREASURY_WITHDRAWAL'
  ));

ALTER TABLE public.customer_profile_operation_audit
  DROP CONSTRAINT IF EXISTS "CK_CUSTOMER_PROFILE_AUDIT_OPERATION";
ALTER TABLE public.customer_profile_operation_audit
  ADD CONSTRAINT "CK_CUSTOMER_PROFILE_AUDIT_OPERATION"
  CHECK (operation IN ('CUSTOMER_CREATE','STATUS_CHANGE','PROFILE_UPDATE','KYC_UPDATE'));

COMMIT;
