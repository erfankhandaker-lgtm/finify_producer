BEGIN;

CREATE OR REPLACE FUNCTION onboarding.advance_journey_step(
  p_instance_id uuid,
  p_resume_token_hash char(64),
  p_expected_node_key varchar,
  p_outcome_code varchar,
  p_idempotency_key varchar,
  p_input_hash char(64),
  p_output jsonb,
  p_actor_id varchar,
  p_correlation_id varchar
) RETURNS TABLE(
  instance_id uuid,
  customer_id uuid,
  status varchar,
  current_node_id uuid,
  current_node_key varchar,
  current_node_type varchar,
  current_node_name varchar,
  current_node_configuration jsonb,
  completed_at timestamptz,
  replayed boolean
) LANGUAGE plpgsql AS $$
DECLARE
  v_instance onboarding.journey_instances%ROWTYPE;
  v_source onboarding.journey_nodes%ROWTYPE;
  v_target onboarding.journey_nodes%ROWTYPE;
  v_execution onboarding.step_executions%ROWTYPE;
  v_attempt integer;
  v_next_status varchar(24);
BEGIN
  IF p_output IS NOT NULL AND jsonb_typeof(p_output)<>'object' THEN
    RAISE EXCEPTION 'Step output must be a JSON object';
  END IF;

  SELECT instance.* INTO v_instance
  FROM onboarding.journey_instances instance
  WHERE instance.id=p_instance_id
    AND instance.resume_token_hash=p_resume_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding instance or resume token is invalid';
  END IF;

  SELECT execution.* INTO v_execution
  FROM onboarding.step_executions execution
  WHERE execution.instance_id=p_instance_id
    AND execution.idempotency_key=p_idempotency_key;

  IF FOUND THEN
    IF v_execution.input_hash IS DISTINCT FROM p_input_hash THEN
      RAISE EXCEPTION 'Idempotency key was already used with different input';
    END IF;

    RETURN QUERY
    SELECT current_instance.id,current_instance.customer_id,current_instance.status::varchar,
           current_instance.current_node_id,node.node_key,node.node_type,node.name,node.configuration,
           current_instance.completed_at,true
    FROM onboarding.journey_instances current_instance
    LEFT JOIN onboarding.journey_nodes node ON node.id=current_instance.current_node_id
    WHERE current_instance.id=p_instance_id;
    RETURN;
  END IF;

  IF v_instance.expires_at<=CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'Onboarding journey has expired';
  END IF;

  IF v_instance.status<>'IN_PROGRESS' THEN
    RAISE EXCEPTION 'Onboarding journey cannot advance from status %',v_instance.status;
  END IF;

  SELECT node.* INTO v_source
  FROM onboarding.journey_nodes node
  WHERE node.id=v_instance.current_node_id
    AND node.journey_version_id=v_instance.journey_version_id;

  IF NOT FOUND OR v_source.node_key<>p_expected_node_key THEN
    RAISE EXCEPTION 'Onboarding journey current node changed';
  END IF;

  IF v_source.node_type='END' THEN
    RAISE EXCEPTION 'A completed journey cannot advance';
  END IF;

  SELECT target.* INTO v_target
  FROM onboarding.journey_transitions transition
  JOIN onboarding.journey_nodes target ON target.id=transition.to_node_id
  WHERE transition.journey_version_id=v_instance.journey_version_id
    AND transition.from_node_id=v_source.id
    AND transition.outcome_code=upper(p_outcome_code)
  ORDER BY transition.priority,transition.id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No transition matches outcome % for node %',upper(p_outcome_code),v_source.node_key;
  END IF;

  SELECT COALESCE(max(execution.attempt_number),0)+1 INTO v_attempt
  FROM onboarding.step_executions execution
  WHERE execution.instance_id=p_instance_id AND execution.node_id=v_source.id;

  INSERT INTO onboarding.step_executions(
    instance_id,node_id,attempt_number,status,idempotency_key,input_hash,output,completed_at
  ) VALUES(
    p_instance_id,v_source.id,v_attempt,'SUCCEEDED',p_idempotency_key,p_input_hash,
    COALESCE(p_output,'{}'::jsonb),CURRENT_TIMESTAMP
  );

  v_next_status=CASE
    WHEN v_target.node_type='END' THEN 'COMPLETED'
    WHEN v_target.node_type='MANUAL_REVIEW' THEN 'MANUAL_REVIEW'
    ELSE 'IN_PROGRESS'
  END;

  UPDATE onboarding.journey_instances
  SET current_node_id=v_target.id,
      status=v_next_status,
      updated_at=CURRENT_TIMESTAMP,
      completed_at=CASE WHEN v_next_status='COMPLETED' THEN CURRENT_TIMESTAMP ELSE NULL END
  WHERE id=p_instance_id
  RETURNING * INTO v_instance;

  INSERT INTO onboarding.journey_events(
    instance_id,event_type,node_id,actor_type,actor_id,correlation_id,payload
  ) VALUES(
    p_instance_id,'STEP_SUCCEEDED',v_source.id,'CUSTOMER',p_actor_id,p_correlation_id,
    jsonb_build_object(
      'nodeKey',v_source.node_key,
      'outcome',upper(p_outcome_code),
      'nextNodeKey',v_target.node_key,
      'attemptNumber',v_attempt
    )
  );

  IF v_next_status='COMPLETED' THEN
    UPDATE customer_registry.customers customer
    SET status='ACTIVE',updated_at=CURRENT_TIMESTAMP
    WHERE customer.id=v_instance.customer_id
      AND customer.tenant_id=v_instance.tenant_id
      AND customer.status='ONBOARDING';

    INSERT INTO onboarding.journey_events(
      instance_id,event_type,node_id,actor_type,actor_id,correlation_id,payload
    ) VALUES(
      p_instance_id,'JOURNEY_COMPLETED',v_target.id,'SYSTEM',NULL,p_correlation_id,
      jsonb_build_object('nodeKey',v_target.node_key)
    );
  END IF;

  RETURN QUERY
  SELECT v_instance.id,v_instance.customer_id,v_instance.status::varchar,v_instance.current_node_id,
         v_target.node_key,v_target.node_type,v_target.name,v_target.configuration,
         v_instance.completed_at,false;
END $$;

COMMIT;
