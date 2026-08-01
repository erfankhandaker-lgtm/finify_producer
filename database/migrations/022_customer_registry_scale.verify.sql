DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname='pg_trgm'
  ) THEN
    RAISE EXCEPTION 'pg_trgm is required for customer registry search';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND indexname='IDX_CUSTOMER_REGISTRY_NAME_SEARCH'
  ) THEN
    RAISE EXCEPTION 'Customer name search index is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND indexname='IDX_CUSTOMER_WALLET_OWNER'
  ) THEN
    RAISE EXCEPTION 'Customer wallet owner index is missing';
  END IF;
END
$$;

SELECT 'Customer registry scale indexes verified' AS result;
