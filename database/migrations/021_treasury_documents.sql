BEGIN;

CREATE TABLE IF NOT EXISTS public.treasury_documents (
  id bigserial PRIMARY KEY,
  treasury_request_id bigint NULL UNIQUE
    REFERENCES public.treasury_funding_requests(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  bucket_name varchar(100) NOT NULL,
  object_key varchar(500) NOT NULL UNIQUE,
  original_name varchar(255) NOT NULL,
  content_type varchar(100) NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 char(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'UPLOADED',
  uploaded_by varchar(100) NOT NULL,
  uploaded_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attached_at timestamp without time zone NULL,
  CONSTRAINT "CK_TREASURY_DOCUMENT_SIZE"
    CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  CONSTRAINT "CK_TREASURY_DOCUMENT_TYPE"
    CHECK (content_type IN ('application/pdf','image/png','image/jpeg')),
  CONSTRAINT "CK_TREASURY_DOCUMENT_STATUS"
    CHECK (
      (status='UPLOADED' AND treasury_request_id IS NULL AND attached_at IS NULL)
      OR
      (status='ATTACHED' AND treasury_request_id IS NOT NULL AND attached_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS "IDX_TREASURY_DOCUMENT_UPLOADED"
  ON public.treasury_documents(status,uploaded_at);

COMMENT ON TABLE public.treasury_documents IS
  'Private MinIO object metadata for bank evidence attached to treasury movements.';

COMMIT;
