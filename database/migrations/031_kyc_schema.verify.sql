DO $$
BEGIN
  IF to_regclass('kyc.cases') IS NULL
     OR to_regclass('kyc.documents') IS NULL
     OR to_regclass('kyc.verification_attempts') IS NULL
     OR to_regclass('kyc.review_audit') IS NULL
     OR to_regclass('kyc.sessions') IS NULL THEN
    RAISE EXCEPTION 'KYC schema is incomplete';
  END IF;

  IF (SELECT count(*) FROM public.admin_permissions
      WHERE code IN ('kyc.read','kyc.operate','kyc.review','kyc.configure','kyc.documents.read')) <> 5 THEN
    RAISE EXCEPTION 'KYC permissions are incomplete';
  END IF;
END $$;
