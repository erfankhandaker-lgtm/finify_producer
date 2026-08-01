DO $$
BEGIN
  IF to_regclass('public.treasury_documents') IS NULL THEN
    RAISE EXCEPTION 'Treasury document table is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='CK_TREASURY_DOCUMENT_TYPE'
  ) THEN
    RAISE EXCEPTION 'Treasury document content-type constraint is missing';
  END IF;
END
$$;

SELECT 'Treasury MinIO document migration verified' AS result;
