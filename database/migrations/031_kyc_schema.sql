BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS kyc;

CREATE TABLE IF NOT EXISTS kyc.cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_msisdn bigint NOT NULL
    REFERENCES public."SW_TBL_PROFILE_CUST"("MSISDN") ON DELETE RESTRICT,
  document_type varchar(40) NOT NULL,
  issuing_country char(3) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'DRAFT',
  system_recommendation varchar(24) NULL,
  face_match_score numeric(6,3) NULL,
  aml_match boolean NOT NULL DEFAULT false,
  extracted_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  screening_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_reviewer varchar(100) NULL,
  final_reason text NULL,
  idempotency_key varchar(100) NULL,
  created_by varchar(100) NOT NULL,
  reviewed_by varchar(100) NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at timestamp without time zone NULL,
  CONSTRAINT "CK_KYC_CASE_STATUS" CHECK (
    status IN ('DRAFT','SUBMITTED','PROCESSING','MANUAL_REVIEW','APPROVED','REJECTED','RESUBMISSION_REQUIRED','FAILED')
  ),
  CONSTRAINT "CK_KYC_CASE_RECOMMENDATION" CHECK (
    system_recommendation IS NULL OR
    system_recommendation IN ('APPROVED','REJECTED','MANUAL_REVIEW')
  ),
  CONSTRAINT "CK_KYC_COUNTRY" CHECK (issuing_country ~ '^[A-Z]{3}$'),
  CONSTRAINT "CK_KYC_FACE_SCORE" CHECK (
    face_match_score IS NULL OR (face_match_score >= 0 AND face_match_score <= 100)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_KYC_CASE_IDEMPOTENCY"
  ON kyc.cases(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS "IDX_KYC_CASE_CUSTOMER"
  ON kyc.cases(customer_msisdn,created_at DESC);
CREATE INDEX IF NOT EXISTS "IDX_KYC_CASE_QUEUE"
  ON kyc.cases(status,created_at DESC);
CREATE INDEX IF NOT EXISTS "IDX_KYC_CASE_REVIEWER_QUEUE"
  ON kyc.cases(assigned_reviewer,status,created_at DESC);

CREATE TABLE IF NOT EXISTS kyc.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES kyc.cases(id) ON DELETE CASCADE,
  document_role varchar(24) NOT NULL,
  bucket varchar(100) NOT NULL,
  object_key varchar(500) NOT NULL,
  original_name varchar(255) NOT NULL,
  content_type varchar(100) NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 char(64) NOT NULL,
  created_by varchar(100) NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at timestamp without time zone NULL,
  CONSTRAINT "CK_KYC_DOCUMENT_ROLE" CHECK (
    document_role IN ('ID_FRONT','ID_BACK','PASSPORT','SELFIE','PORTRAIT','SIGNATURE','OTHER')
  ),
  CONSTRAINT "CK_KYC_DOCUMENT_SIZE" CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  UNIQUE(case_id,document_role,sha256)
);

CREATE INDEX IF NOT EXISTS "IDX_KYC_DOCUMENT_CASE"
  ON kyc.documents(case_id,created_at);

CREATE TABLE IF NOT EXISTS kyc.verification_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES kyc.cases(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  status varchar(24) NOT NULL,
  ocr_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  face_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  screening_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_version varchar(100) NULL,
  error_code varchar(100) NULL,
  error_message text NULL,
  started_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamp without time zone NULL,
  CONSTRAINT "CK_KYC_ATTEMPT_STATUS" CHECK (
    status IN ('PROCESSING','COMPLETED','FAILED')
  ),
  UNIQUE(case_id,attempt_number)
);

CREATE INDEX IF NOT EXISTS "IDX_KYC_ATTEMPT_CASE"
  ON kyc.verification_attempts(case_id,attempt_number DESC);

CREATE TABLE IF NOT EXISTS kyc.review_audit (
  id bigserial PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES kyc.cases(id) ON DELETE CASCADE,
  action varchar(32) NOT NULL,
  previous_status varchar(24) NULL,
  new_status varchar(24) NOT NULL,
  reason text NOT NULL,
  actor_id varchar(100) NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_KYC_REVIEW_ACTION" CHECK (
    action IN ('CREATE','SUBMIT','ASSIGN','APPROVE','REJECT','REQUEST_RESUBMISSION','REVERIFY','SYSTEM_RESULT')
  )
);

CREATE INDEX IF NOT EXISTS "IDX_KYC_REVIEW_AUDIT_CASE"
  ON kyc.review_audit(case_id,created_at DESC);

CREATE TABLE IF NOT EXISTS kyc.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES kyc.cases(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  expires_at timestamp without time zone NOT NULL,
  consumed_at timestamp without time zone NULL,
  created_by varchar(100) NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_KYC_SESSION_STATUS" CHECK (
    status IN ('PENDING','CONSUMED','EXPIRED','REVOKED')
  )
);

CREATE INDEX IF NOT EXISTS "IDX_KYC_SESSION_EXPIRY"
  ON kyc.sessions(status,expires_at);

INSERT INTO public.admin_permissions(code,resource,action,description) VALUES
  ('kyc.read','kyc','read','View KYC cases and redacted identity evidence'),
  ('kyc.operate','kyc','operate','Create KYC cases and request verification'),
  ('kyc.review','kyc','review','Approve, reject, or request KYC resubmission'),
  ('kyc.configure','kyc','configure','Manage KYC policy and screening configuration'),
  ('kyc.documents.read','kyc_documents','read','View protected KYC documents')
ON CONFLICT(code) DO UPDATE SET
  resource=EXCLUDED.resource,action=EXCLUDED.action,description=EXCLUDED.description;

INSERT INTO public.admin_role_permissions(role_id,permission_id)
SELECT role.id,permission.id
FROM public.admin_roles role
CROSS JOIN public.admin_permissions permission
WHERE role.code='super_admin'
  AND permission.code IN (
    'kyc.read','kyc.operate','kyc.review','kyc.configure','kyc.documents.read'
  )
ON CONFLICT DO NOTHING;

COMMIT;
