BEGIN;

DROP TRIGGER IF EXISTS "TRG_WALLET_TYPE_GL_MAPPING"
  ON public."SW_TBL_WALLET_TYPE";
DROP FUNCTION IF EXISTS public.sw_fn_sync_wallet_type_gl_mapping();

UPDATE public.sw_tbl_wallet_gl_mapping
SET is_active=false
WHERE created_by='MIGRATION_025';

COMMIT;
