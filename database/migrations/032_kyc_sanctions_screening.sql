BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS kyc.sanction_records (
  id bigserial PRIMARY KEY,
  normalized_name text NOT NULL,
  original_name text NOT NULL,
  source varchar(40) NOT NULL,
  source_record_id varchar(150) NOT NULL,
  source_updated_at timestamp without time zone NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source,source_record_id)
);

CREATE INDEX IF NOT EXISTS "IDX_KYC_SANCTION_NAME_TRGM"
  ON kyc.sanction_records USING gin(normalized_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "IDX_KYC_SANCTION_SOURCE"
  ON kyc.sanction_records(source,updated_at DESC);

COMMIT;
