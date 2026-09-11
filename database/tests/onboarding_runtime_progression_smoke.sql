\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_tenant uuid:=gen_random_uuid();
  v_customer uuid;
  v_definition uuid;
  v_version uuid;
  v_start uuid;
  v_phone uuid;
  v_end uuid;
  v_instance uuid;
  v_result record;
BEGIN
  INSERT INTO customer_registry.customers(
    tenant_id,home_country_code,customer_type,status
  ) VALUES(v_tenant,'UGA','INDIVIDUAL','ONBOARDING')
  RETURNING id INTO v_customer;

  INSERT INTO onboarding.journey_definitions(tenant_id,code,name,created_by)
  VALUES(v_tenant,'RUNTIME_SMOKE','Runtime progression smoke','smoke-test')
  RETURNING id INTO v_definition;

  INSERT INTO onboarding.journey_versions(
    journey_definition_id,version_number,status,created_by,activated_at
  ) VALUES(v_definition,1,'ACTIVE','smoke-test',CURRENT_TIMESTAMP)
  RETURNING id INTO v_version;

  INSERT INTO onboarding.journey_nodes(
    journey_version_id,node_key,node_type,name,is_entry
  ) VALUES(v_version,'start','START','Start',true) RETURNING id INTO v_start;
  INSERT INTO onboarding.journey_nodes(
    journey_version_id,node_key,node_type,name
  ) VALUES(v_version,'phone','PHONE_CAPTURE','Capture phone') RETURNING id INTO v_phone;
  INSERT INTO onboarding.journey_nodes(
    journey_version_id,node_key,node_type,name
  ) VALUES(v_version,'complete','END','Complete') RETURNING id INTO v_end;

  INSERT INTO onboarding.journey_transitions(
    journey_version_id,from_node_id,to_node_id,outcome_code,priority
  ) VALUES
    (v_version,v_start,v_phone,'SUCCESS',1),
    (v_version,v_phone,v_end,'SUCCESS',1);

  INSERT INTO onboarding.journey_instances(
    tenant_id,customer_id,journey_version_id,current_node_id,
    source_channel_code,current_channel_code,resume_token_hash,expires_at
  ) VALUES(
    v_tenant,v_customer,v_version,v_start,'MOBILE_APP','MOBILE_APP',repeat('a',64),
    CURRENT_TIMESTAMP+interval '1 day'
  ) RETURNING id INTO v_instance;

  SELECT * INTO v_result FROM onboarding.advance_journey_step(
    v_instance,repeat('a',64),'start','SUCCESS','runtime-smoke-0001',repeat('b',64),
    '{"captured":true}'::jsonb,'smoke-customer','smoke-correlation-1'
  );
  IF v_result.current_node_key<>'phone' OR v_result.status<>'IN_PROGRESS' OR v_result.replayed THEN
    RAISE EXCEPTION 'First runtime transition returned an unexpected state';
  END IF;

  SELECT * INTO v_result FROM onboarding.advance_journey_step(
    v_instance,repeat('a',64),'start','SUCCESS','runtime-smoke-0001',repeat('b',64),
    '{"captured":true}'::jsonb,'smoke-customer','smoke-correlation-1'
  );
  IF NOT v_result.replayed OR v_result.current_node_key<>'phone' THEN
    RAISE EXCEPTION 'Idempotent replay did not return the current state';
  END IF;

  BEGIN
    PERFORM onboarding.advance_journey_step(
      v_instance,repeat('a',64),'start','SUCCESS','runtime-smoke-stale',repeat('c',64),
      '{}'::jsonb,'smoke-customer','smoke-correlation-2'
    );
    RAISE EXCEPTION 'A stale current node was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%current node changed%' THEN RAISE; END IF;
  END;

  SELECT * INTO v_result FROM onboarding.advance_journey_step(
    v_instance,repeat('a',64),'phone','SUCCESS','runtime-smoke-0002',repeat('d',64),
    '{}'::jsonb,'smoke-customer','smoke-correlation-3'
  );
  IF v_result.current_node_key<>'complete' OR v_result.status<>'COMPLETED' THEN
    RAISE EXCEPTION 'Terminal runtime transition did not complete the journey';
  END IF;
  IF (SELECT status FROM customer_registry.customers WHERE id=v_customer)<>'ACTIVE' THEN
    RAISE EXCEPTION 'Completed onboarding did not activate the customer';
  END IF;
  IF (SELECT count(*) FROM onboarding.step_executions WHERE instance_id=v_instance)<>2 THEN
    RAISE EXCEPTION 'Unexpected step execution count';
  END IF;
  IF (SELECT count(*) FROM onboarding.journey_events
      WHERE instance_id=v_instance AND event_type IN ('STEP_SUCCEEDED','JOURNEY_COMPLETED'))<>3 THEN
    RAISE EXCEPTION 'Expected runtime events were not recorded';
  END IF;
END $$;

ROLLBACK;
