BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.treasury_documents) THEN
    RAISE EXCEPTION
      'Cannot roll back migration 021 while treasury document metadata exists';
  END IF;
END
$$;

DROP TABLE IF EXISTS public.treasury_documents;

COMMIT;
