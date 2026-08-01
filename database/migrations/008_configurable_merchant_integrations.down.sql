BEGIN;

DROP TABLE IF EXISTS public.sw_tbl_merchant_confirmation;

DROP INDEX IF EXISTS public."UQ_MERCHANT_ATTEMPT_CORRELATION";
ALTER TABLE public.sw_tbl_merchant_integration_attempt
  DROP CONSTRAINT IF EXISTS "CK_MERCHANT_ATTEMPT_CHANNEL",
  DROP CONSTRAINT IF EXISTS "FK_MERCHANT_ATTEMPT_CONFIG",
  DROP COLUMN IF EXISTS external_reference,
  DROP COLUMN IF EXISTS outbound_topic,
  DROP COLUMN IF EXISTS correlation_id,
  DROP COLUMN IF EXISTS integration_channel,
  DROP COLUMN IF EXISTS config_version,
  DROP COLUMN IF EXISTS config_id;

DROP TABLE IF EXISTS public.sw_tbl_merchant_integration_config_history;
DROP TABLE IF EXISTS public.sw_tbl_merchant_integration_auth;
DROP TABLE IF EXISTS public.sw_tbl_merchant_integration_config;

DROP INDEX IF EXISTS public."IDX_PROFILE_MERCHANT_INTEGRATION_CHANNEL";
ALTER TABLE public."SW_TBL_PROFILE_MERCHANT"
  DROP CONSTRAINT IF EXISTS "CK_PROFILE_MERCHANT_INTEGRATION_CHANNEL",
  DROP COLUMN IF EXISTS "Is_Special_Merchant",
  DROP COLUMN IF EXISTS "Integration_Channel";

COMMIT;
