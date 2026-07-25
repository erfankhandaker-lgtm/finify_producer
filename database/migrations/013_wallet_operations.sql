BEGIN;

-- Ownership and purpose are metadata only. SW_TBL_WALLET remains the sole
-- balance store and all existing wallet identifiers and balances are preserved.
ALTER TABLE public."SW_TBL_WALLET"
  ADD COLUMN IF NOT EXISTS owner_msisdn bigint NULL,
  ADD COLUMN IF NOT EXISTS owner_type varchar(16) NULL,
  ADD COLUMN IF NOT EXISTS wallet_purpose varchar(32) NULL;

UPDATE public."SW_TBL_WALLET" wallet
SET owner_msisdn = COALESCE(wallet."Mobile_Number", wallet."Wallet_MSISDN"),
    owner_type = CASE wallet_type."Wallet_Type"
      WHEN 100 THEN 'CUSTOMER'
      WHEN 200 THEN 'MERCHANT'
      WHEN 300 THEN 'AGENT'
      ELSE 'SYSTEM'
    END,
    wallet_purpose = CASE wallet_type."Wallet_Type"
      WHEN 100 THEN CASE WHEN wallet.is_default THEN 'CUSTOMER_MAIN' ELSE 'CUSTOMER_ADDITIONAL' END
      WHEN 200 THEN 'MERCHANT_SETTLEMENT'
      WHEN 300 THEN 'AGENT_FLOAT'
      ELSE 'SYSTEM'
    END
FROM public."SW_TBL_WALLET_TYPE" wallet_type
WHERE wallet_type."Wallet_ID" = wallet."Wallet_Code"
  AND (wallet.owner_msisdn IS NULL OR wallet.owner_type IS NULL OR wallet.wallet_purpose IS NULL);

UPDATE public."SW_TBL_WALLET"
SET owner_msisdn=COALESCE(owner_msisdn,"Mobile_Number","Wallet_MSISDN"),
    owner_type=COALESCE(owner_type,'SYSTEM'),
    wallet_purpose=COALESCE(wallet_purpose,'SYSTEM');

-- The profile MSISDN wallet is the customer's pre-existing main wallet even
-- when old records did not populate is_default.
UPDATE public."SW_TBL_WALLET"
SET wallet_purpose='CUSTOMER_MAIN',is_default=true
WHERE owner_type='CUSTOMER' AND "Wallet_MSISDN"=owner_msisdn;

ALTER TABLE public."SW_TBL_WALLET"
  ALTER COLUMN owner_msisdn SET NOT NULL,
  ALTER COLUMN owner_type SET NOT NULL,
  ALTER COLUMN wallet_purpose SET NOT NULL;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='CK_WALLET_OWNER_TYPE') THEN
    ALTER TABLE public."SW_TBL_WALLET" ADD CONSTRAINT "CK_WALLET_OWNER_TYPE"
      CHECK (owner_type IN ('CUSTOMER','AGENT','MERCHANT','SYSTEM'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='CK_WALLET_PURPOSE') THEN
    ALTER TABLE public."SW_TBL_WALLET" ADD CONSTRAINT "CK_WALLET_PURPOSE"
      CHECK (wallet_purpose IN (
        'CUSTOMER_MAIN','CUSTOMER_ADDITIONAL','AGENT_FLOAT','AGENT_COMMISSION',
        'MERCHANT_SETTLEMENT','MERCHANT_COMMISSION','SAFEGUARDING',
        'SYSTEM_CLEARING','TEMPORARY_RESERVE','SYSTEM'
      ));
  END IF;
END
$constraints$;

CREATE INDEX IF NOT EXISTS "IDX_WALLET_OWNER"
  ON public."SW_TBL_WALLET"(owner_type,owner_msisdn,currency);
CREATE INDEX IF NOT EXISTS "IDX_WALLET_OWNER_DEFAULT"
  ON public."SW_TBL_WALLET"(owner_msisdn,currency,is_default)
  WHERE is_default AND "Status"<>6;

CREATE SEQUENCE IF NOT EXISTS public.sw_wallet_account_number_seq
  AS bigint START WITH 990000000001 INCREMENT BY 1;
SELECT setval(
  'public.sw_wallet_account_number_seq',
  GREATEST((SELECT COALESCE(max("Wallet_MSISDN"),0)+1 FROM public."SW_TBL_WALLET"),990000000001),
  false
);

CREATE TABLE IF NOT EXISTS public.sw_tbl_wallet_operation_audit (
  id bigserial PRIMARY KEY,
  wallet_msisdn bigint NOT NULL REFERENCES public."SW_TBL_WALLET"("Wallet_MSISDN"),
  owner_msisdn bigint NOT NULL,
  operation varchar(32) NOT NULL,
  previous_state jsonb NULL,
  new_state jsonb NOT NULL,
  reason text NULL,
  actor_type varchar(16) NOT NULL,
  actor_id text NOT NULL,
  correlation_id varchar(100) NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_WALLET_AUDIT_OPERATION"
    CHECK (operation IN ('CREATE','SET_DEFAULT','STATUS_CHANGE')),
  CONSTRAINT "CK_WALLET_AUDIT_ACTOR"
    CHECK (actor_type IN ('CUSTOMER','ADMIN','SYSTEM'))
);
CREATE INDEX IF NOT EXISTS "IDX_WALLET_AUDIT_WALLET"
  ON public.sw_tbl_wallet_operation_audit(wallet_msisdn,created_at DESC);

INSERT INTO admin_permissions(code,resource,action,description)
VALUES ('wallets.manage','wallets','manage','Create and manage wallet operational state')
ON CONFLICT(code) DO NOTHING;
INSERT INTO admin_role_permissions(role_id,permission_id)
SELECT role.id,permission.id FROM admin_roles role
CROSS JOIN admin_permissions permission
WHERE role.code='super_admin' AND permission.code='wallets.manage'
ON CONFLICT DO NOTHING;

COMMIT;
