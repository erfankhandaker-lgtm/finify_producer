BEGIN;

CREATE TABLE IF NOT EXISTS public.business_merchant_types (
  code varchar(50) PRIMARY KEY,
  name varchar(100) NOT NULL,
  description text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_BUSINESS_MERCHANT_TYPE_CHECKER" CHECK (approved_by<>created_by)
);

CREATE TABLE IF NOT EXISTS public.business_merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(100) NOT NULL UNIQUE,
  legal_name varchar(200) NOT NULL,
  display_name varchar(200) NOT NULL,
  merchant_type_code varchar(50) NOT NULL REFERENCES public.business_merchant_types(code),
  country_code char(3) NOT NULL,
  legacy_merchant_msisdn bigint NULL REFERENCES public."SW_TBL_PROFILE_MERCHANT"("MSISDN"),
  external_reference varchar(150) NULL,
  status varchar(24) NOT NULL DEFAULT 'DRAFT',
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by text NULL,
  approved_at timestamptz NULL,
  activated_by text NULL,
  activated_at timestamptz NULL,
  updated_by text NULL,
  updated_at timestamptz NULL,
  CONSTRAINT "CK_BUSINESS_MERCHANT_STATUS" CHECK (
    status IN ('DRAFT','PENDING_APPROVAL','APPROVED','ACTIVE','SUSPENDED','RETIRED')
  ),
  CONSTRAINT "CK_BUSINESS_MERCHANT_COUNTRY" CHECK (country_code ~ '^[A-Z]{3}$'),
  CONSTRAINT "CK_BUSINESS_MERCHANT_CHECKER" CHECK (approved_by IS NULL OR approved_by<>created_by),
  CONSTRAINT "CK_BUSINESS_MERCHANT_ACTIVE_APPROVAL" CHECK (
    status<>'ACTIVE' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL
      AND activated_by IS NOT NULL AND activated_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS "IDX_BUSINESS_MERCHANT_TYPE_COUNTRY"
  ON public.business_merchants(merchant_type_code,country_code,status);

ALTER TABLE public.credit_lenders
  ADD COLUMN IF NOT EXISTS merchant_id uuid NULL REFERENCES public.business_merchants(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_CREDIT_LENDER_MERCHANT"
  ON public.credit_lenders(merchant_id) WHERE merchant_id IS NOT NULL;

INSERT INTO public.business_merchant_types(code,name,description,created_by,approved_by)
VALUES('BANK','Bank','Regulated bank or bank-designated lending institution','merchant-type-maker','merchant-type-checker')
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,is_active=true;

INSERT INTO public.business_merchants(
  id,code,legal_name,display_name,merchant_type_code,country_code,status,
  created_by,approved_by,approved_at,activated_by,activated_at
) VALUES(
  '00000000-0000-4000-8300-000000000001','DTB','DTB','DTB','BANK','UGA','ACTIVE',
  'commercial-config-maker','commercial-config-checker',CURRENT_TIMESTAMP,
  'commercial-config-activator',CURRENT_TIMESTAMP
)
ON CONFLICT(code) DO UPDATE SET
  legal_name=EXCLUDED.legal_name,display_name=EXCLUDED.display_name,
  merchant_type_code=EXCLUDED.merchant_type_code,country_code=EXCLUDED.country_code,
  status='ACTIVE',approved_by='commercial-config-checker',approved_at=CURRENT_TIMESTAMP,
  activated_by='commercial-config-activator',activated_at=CURRENT_TIMESTAMP,
  updated_by='migration-053',updated_at=CURRENT_TIMESTAMP;

INSERT INTO public.credit_lenders(
  id,code,name,country_code,allocation_weight,status,merchant_id,
  created_by,approved_by,approved_at,activated_by,activated_at
)
SELECT '00000000-0000-4000-8400-000000000001','DTB_UGA','DTB','UGA',1,'ACTIVE',merchant.id,
  'lender-config-maker','lender-config-checker',CURRENT_TIMESTAMP,'lender-config-activator',CURRENT_TIMESTAMP
FROM public.business_merchants merchant WHERE merchant.code='DTB'
ON CONFLICT(code) DO UPDATE SET
  name=EXCLUDED.name,country_code=EXCLUDED.country_code,allocation_weight=EXCLUDED.allocation_weight,
  status='ACTIVE',merchant_id=EXCLUDED.merchant_id,
  approved_by='lender-config-checker',approved_at=CURRENT_TIMESTAMP,
  activated_by='lender-config-activator',activated_at=CURRENT_TIMESTAMP;

UPDATE public.credit_lenders SET status='RETIRED'
WHERE code='UNASSIGNED_UGA_LENDER' AND status<>'RETIRED';

INSERT INTO public.admin_permissions(code,resource,action,description) VALUES
  ('business_merchants.read','business_merchants','read','View business merchants and bank institutions'),
  ('business_merchants.make','business_merchants','make','Create or update a business merchant'),
  ('business_merchants.check','business_merchants','check','Approve and activate a business merchant')
ON CONFLICT(code) DO UPDATE SET description=EXCLUDED.description;

INSERT INTO public.admin_role_permissions(role_id,permission_id)
SELECT role.id,permission.id
FROM public.admin_roles role CROSS JOIN public.admin_permissions permission
WHERE role.code='super_admin' AND permission.code LIKE 'business_merchants.%'
ON CONFLICT DO NOTHING;

COMMIT;
