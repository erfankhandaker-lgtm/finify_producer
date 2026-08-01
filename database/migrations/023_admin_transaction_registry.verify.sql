DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND indexname='IDX_TRANSACTION_REQUEST_REGISTRY_DATE'
  ) THEN
    RAISE EXCEPTION 'Transaction registry date index is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND indexname='IDX_TRANSACTION_REQUEST_REFERENCE_SEARCH'
  ) THEN
    RAISE EXCEPTION 'Transaction reference search index is missing';
  END IF;
END
$$;

SELECT 'Admin transaction registry indexes verified' AS result;
