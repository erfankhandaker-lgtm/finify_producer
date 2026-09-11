BEGIN;

CREATE TABLE onboarding.customer_credentials (
  customer_id uuid PRIMARY KEY REFERENCES customer_registry.customers(id) ON DELETE RESTRICT,
  pin_hash text NOT NULL,failed_attempts integer NOT NULL DEFAULT 0,
  maximum_attempts integer NOT NULL DEFAULT 5,locked_until timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_ONBOARDING_PIN_ATTEMPTS" CHECK (failed_attempts>=0 AND maximum_attempts BETWEEN 1 AND 20)
);

CREATE TABLE onboarding.consent_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),instance_id uuid NOT NULL REFERENCES onboarding.journey_instances(id),
  customer_id uuid NOT NULL REFERENCES customer_registry.customers(id),consent_version_id uuid NOT NULL REFERENCES onboarding.configuration_versions(id),
  content_hash char(64) NOT NULL,accepted boolean NOT NULL,ip_hash char(64) NULL,user_agent_hash char(64) NULL,
  idempotency_key varchar(120) NOT NULL,accepted_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(instance_id,consent_version_id),UNIQUE(instance_id,idempotency_key)
);

CREATE TABLE onboarding.profile_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),instance_id uuid NOT NULL REFERENCES onboarding.journey_instances(id),
  customer_id uuid NOT NULL REFERENCES customer_registry.customers(id),form_version_id uuid NOT NULL REFERENCES onboarding.configuration_versions(id),
  response jsonb NOT NULL,response_hash char(64) NOT NULL,idempotency_key varchar(120) NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CK_ONBOARDING_FORM_RESPONSE" CHECK (jsonb_typeof(response)='object'),
  UNIQUE(instance_id,form_version_id),UNIQUE(instance_id,idempotency_key)
);

ALTER TABLE onboarding.otp_challenges ADD COLUMN idempotency_key varchar(120) NULL,
  ADD COLUMN resend_available_at timestamptz NULL,ADD COLUMN locked_at timestamptz NULL;
CREATE UNIQUE INDEX "UQ_ONBOARDING_OTP_IDEMPOTENCY" ON onboarding.otp_challenges(instance_id,idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE kyc.cases ADD COLUMN configuration_version_id uuid NULL
  REFERENCES onboarding.configuration_versions(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION onboarding.advance_verified_step(
  p_instance_id uuid,p_expected_node_type varchar,p_outcome varchar,p_idempotency_key varchar,
  p_output jsonb,p_actor_type varchar,p_actor_id varchar,p_correlation_id varchar DEFAULT NULL
) RETURNS TABLE(instance_id uuid,customer_id uuid,status varchar,current_node_id uuid,current_node_key varchar,
  current_node_type varchar,current_node_name varchar,current_node_configuration jsonb,completed_at timestamptz,replayed boolean)
LANGUAGE plpgsql AS $$
DECLARE v_instance onboarding.journey_instances%ROWTYPE;v_node onboarding.journey_nodes%ROWTYPE;v_hash char(64);
BEGIN
  SELECT * INTO v_instance FROM onboarding.journey_instances WHERE id=p_instance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Onboarding instance was not found'; END IF;
  SELECT * INTO v_node FROM onboarding.journey_nodes WHERE id=v_instance.current_node_id;
  IF NOT FOUND OR v_node.node_type<>p_expected_node_type THEN RAISE EXCEPTION 'Onboarding journey current node is not %',p_expected_node_type; END IF;
  v_hash=encode(digest(v_node.node_key||':'||upper(p_outcome)||':'||COALESCE(p_output,'{}'::jsonb)::text,'sha256'),'hex');
  RETURN QUERY SELECT * FROM onboarding.advance_journey_step(v_instance.id,v_instance.resume_token_hash,
    v_node.node_key,upper(p_outcome),p_idempotency_key,v_hash,COALESCE(p_output,'{}'::jsonb),p_actor_id,p_correlation_id);
  UPDATE onboarding.journey_events SET actor_type=p_actor_type
  WHERE id=(SELECT max(id) FROM onboarding.journey_events WHERE onboarding.journey_events.instance_id=p_instance_id
    AND event_type='STEP_SUCCEEDED' AND node_id=v_node.id);
END $$;

UPDATE onboarding.journey_transitions SET outcome_code='APPROVED'
WHERE journey_version_id='00000000-0000-4000-8004-000000000001'
  AND from_node_id='00000000-0000-4000-8200-000000000007'
  AND to_node_id='00000000-0000-4000-8200-000000000008';
INSERT INTO onboarding.journey_transitions(journey_version_id,from_node_id,to_node_id,outcome_code,priority)
VALUES('00000000-0000-4000-8004-000000000001','00000000-0000-4000-8200-000000000007',
  '00000000-0000-4000-8200-000000000015','REJECTED',90)
ON CONFLICT(journey_version_id,from_node_id,outcome_code,priority) DO NOTHING;

UPDATE onboarding.journey_versions
SET revision=revision+1,
    change_summary=concat_ws(E'\n',change_summary,'Runtime outcomes added for governed KYC approval and rejection.'),
    modified_by='migration-051',updated_at=CURRENT_TIMESTAMP
WHERE id='00000000-0000-4000-8004-000000000001';

CREATE OR REPLACE FUNCTION onboarding.propagate_kyc_decision(p_case_id uuid,p_actor varchar)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_link onboarding.kyc_links%ROWTYPE;v_case kyc.cases%ROWTYPE;v_outcome varchar;
BEGIN
  SELECT * INTO v_link FROM onboarding.kyc_links WHERE kyc_case_id=p_case_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_case FROM kyc.cases WHERE id=p_case_id;
  v_outcome=CASE WHEN v_case.status='APPROVED' THEN 'APPROVED' WHEN v_case.status='REJECTED' THEN 'REJECTED' ELSE NULL END;
  IF v_outcome IS NULL THEN RETURN; END IF;
  PERFORM * FROM onboarding.advance_verified_step(v_link.instance_id,'KYC',v_outcome,
    'kyc-decision-'||p_case_id||'-'||lower(v_outcome),jsonb_build_object('kycCaseId',p_case_id,'decision',v_outcome),
    'EXTERNAL_SERVICE',p_actor,NULL);
END $$;

COMMIT;
