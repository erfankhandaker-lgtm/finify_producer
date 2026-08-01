BEGIN;

-- Wallet types created after the original accounting migration must acquire
-- the same class-level GL mapping as wallet types that existed at that time.
UPDATE public.sw_tbl_wallet_gl_mapping mapping
SET mapping_source='WALLET_CLASS'
FROM public."SW_TBL_WALLET_TYPE" wallet_type
WHERE wallet_type."Wallet_ID"=mapping.wallet_code
  AND wallet_type."Wallet_Type" IN (100,200,300)
  AND mapping.gl_account_code=CASE wallet_type."Wallet_Type"
    WHEN 100 THEN '2000-CUSTOMER-WALLET'
    WHEN 200 THEN '2010-MERCHANT-WALLET'
    WHEN 300 THEN '2020-AGENT-WALLET'
  END;

INSERT INTO public.sw_tbl_wallet_gl_mapping (
  wallet_code,gl_account_code,mapping_source,is_safeguarded,is_active,
  created_by,approved_by,approved_at
)
SELECT wallet_type."Wallet_ID",
       CASE wallet_type."Wallet_Type"
         WHEN 100 THEN '2000-CUSTOMER-WALLET'
         WHEN 200 THEN '2010-MERCHANT-WALLET'
         WHEN 300 THEN '2020-AGENT-WALLET'
       END,
       'WALLET_CLASS',true,true,'MIGRATION_025','MIGRATION_025',CURRENT_TIMESTAMP
FROM public."SW_TBL_WALLET_TYPE" wallet_type
WHERE wallet_type."Wallet_Type" IN (100,200,300)
ON CONFLICT (wallet_code) DO UPDATE
SET gl_account_code=EXCLUDED.gl_account_code,
    mapping_source='WALLET_CLASS',
    is_safeguarded=true,
    is_active=true,
    approved_by='MIGRATION_025',
    approved_at=CURRENT_TIMESTAMP
WHERE sw_tbl_wallet_gl_mapping.mapping_source='WALLET_CLASS';

CREATE OR REPLACE FUNCTION public.sw_fn_sync_wallet_type_gl_mapping()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_gl_account varchar(40);
BEGIN
  v_gl_account := CASE NEW."Wallet_Type"
    WHEN 100 THEN '2000-CUSTOMER-WALLET'
    WHEN 200 THEN '2010-MERCHANT-WALLET'
    WHEN 300 THEN '2020-AGENT-WALLET'
    ELSE NULL
  END;

  IF v_gl_account IS NULL THEN
    UPDATE public.sw_tbl_wallet_gl_mapping
    SET is_active=false
    WHERE wallet_code=NEW."Wallet_ID" AND mapping_source='WALLET_CLASS';
    RETURN NEW;
  END IF;

  INSERT INTO public.sw_tbl_wallet_gl_mapping (
    wallet_code,gl_account_code,mapping_source,is_safeguarded,is_active,
    created_by,approved_by,approved_at
  ) VALUES (
    NEW."Wallet_ID",v_gl_account,'WALLET_CLASS',true,true,
    COALESCE(NEW."Modified_By",NEW."Created_By",'WALLET_TYPE_SYNC'),
    COALESCE(NEW."Approved_By",'WALLET_TYPE_SYNC'),CURRENT_TIMESTAMP
  )
  ON CONFLICT (wallet_code) DO UPDATE
  SET gl_account_code=EXCLUDED.gl_account_code,
      is_safeguarded=true,
      is_active=true,
      approved_by=EXCLUDED.approved_by,
      approved_at=CURRENT_TIMESTAMP
  WHERE sw_tbl_wallet_gl_mapping.mapping_source='WALLET_CLASS';
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS "TRG_WALLET_TYPE_GL_MAPPING"
  ON public."SW_TBL_WALLET_TYPE";
CREATE TRIGGER "TRG_WALLET_TYPE_GL_MAPPING"
AFTER INSERT OR UPDATE OF "Wallet_Type" ON public."SW_TBL_WALLET_TYPE"
FOR EACH ROW EXECUTE FUNCTION public.sw_fn_sync_wallet_type_gl_mapping();

COMMIT;
