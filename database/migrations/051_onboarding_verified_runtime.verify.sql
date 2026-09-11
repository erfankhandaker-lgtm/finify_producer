DO $$ BEGIN
 IF to_regclass('onboarding.customer_credentials') IS NULL OR to_regclass('onboarding.consent_acceptances') IS NULL
 OR to_regclass('onboarding.profile_form_submissions') IS NULL THEN RAISE EXCEPTION 'Verified onboarding runtime tables missing'; END IF;
 IF to_regprocedure('onboarding.advance_verified_step(uuid,character varying,character varying,character varying,jsonb,character varying,character varying,character varying)') IS NULL
 THEN RAISE EXCEPTION 'Verified-step function missing'; END IF;
END $$;
