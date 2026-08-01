BEGIN;

ALTER TABLE public.treasury_funding_requests
  DROP CONSTRAINT IF EXISTS "CK_TREASURY_SAFEGUARDING_JOURNAL";

DROP INDEX IF EXISTS public."UQ_TREASURY_ACCOUNTING_JOURNAL";

ALTER TABLE public.treasury_funding_requests
  DROP CONSTRAINT IF EXISTS "FK_TREASURY_ACCOUNTING_JOURNAL";

-- Accounting records are retained for audit safety. The association column is
-- intentionally retained because dropping it would orphan their provenance.

COMMIT;
