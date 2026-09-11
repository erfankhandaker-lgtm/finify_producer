'use strict';

const crypto = require('node:crypto');
const { Client } = require('pg');

const databaseUrl = process.env.ONBOARDING_E2E_DATABASE_URL;
const apiUrl = String(process.env.ONBOARDING_E2E_API_URL || 'http://localhost:8080/finify')
  .replace(/\/$/, '');

if (!databaseUrl) {
  throw new Error('ONBOARDING_E2E_DATABASE_URL is required');
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const unwrap = (body) => body?.payload ?? body;

async function api(path, init, expectedStatus) {
  const response = await fetch(`${apiUrl}${path}`, init);
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { text }; }
  if (response.status !== expectedStatus) {
    throw new Error(`${init?.method || 'GET'} ${path} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return unwrap(body);
}

async function cleanup(client, tenantId, definitionId) {
  await client.query(
    `DELETE FROM onboarding.journey_events
     WHERE instance_id IN (SELECT id FROM onboarding.journey_instances WHERE tenant_id=$1::uuid)`,
    [tenantId],
  );
  await client.query(
    `DELETE FROM onboarding.step_executions
     WHERE instance_id IN (SELECT id FROM onboarding.journey_instances WHERE tenant_id=$1::uuid)`,
    [tenantId],
  );
  await client.query(
    `DELETE FROM onboarding.channel_handoffs
     WHERE instance_id IN (SELECT id FROM onboarding.journey_instances WHERE tenant_id=$1::uuid)`,
    [tenantId],
  );
  await client.query(
    `DELETE FROM onboarding.channel_sessions
     WHERE instance_id IN (SELECT id FROM onboarding.journey_instances WHERE tenant_id=$1::uuid)`,
    [tenantId],
  );
  await client.query('DELETE FROM onboarding.journey_instances WHERE tenant_id=$1::uuid', [tenantId]);
  await client.query('DELETE FROM customer_registry.contacts WHERE tenant_id=$1::uuid', [tenantId]);
  await client.query('DELETE FROM customer_registry.customers WHERE tenant_id=$1::uuid', [tenantId]);
  if (definitionId) {
    await client.query(
      'DELETE FROM onboarding.journey_versions WHERE journey_definition_id=$1::uuid',
      [definitionId],
    );
    await client.query('DELETE FROM onboarding.journey_definitions WHERE id=$1::uuid', [definitionId]);
  }
  await client.query(
    `DELETE FROM onboarding.channel_versions
     WHERE channel_definition_id IN (SELECT id FROM onboarding.channel_definitions WHERE tenant_id=$1::uuid)`,
    [tenantId],
  );
  await client.query('DELETE FROM onboarding.channel_definitions WHERE tenant_id=$1::uuid', [tenantId]);
}

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  const tenantId = crypto.randomUUID();
  const phoneNumber = `+25670${String(Date.now()).slice(-7)}`;
  const code = `E2E_${Date.now()}`;
  let definitionId;

  await client.connect();
  try {
    const channelDefinition = await client.query(
      `INSERT INTO onboarding.channel_definitions(tenant_id,code,name,created_by)
       VALUES($1::uuid,'MOBILE_APP','E2E mobile app','e2e-maker') RETURNING id`,[tenantId],
    );
    const channelVersion = await client.query(
      `INSERT INTO onboarding.channel_versions(
         channel_definition_id,version_number,status,created_by,modified_by,approved_by,approved_at,activated_at
       ) VALUES($1::uuid,1,'ACTIVE','e2e-maker','e2e-maker','e2e-checker',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
       RETURNING id`,[channelDefinition.rows[0].id],
    );
    await client.query(
      `INSERT INTO onboarding.channel_country_scopes(channel_version_id,country_code)
       VALUES($1::uuid,'UGA')`,[channelVersion.rows[0].id],
    );
    await client.query(
      `INSERT INTO onboarding.channel_node_capabilities(channel_version_id,node_type,execution_mode)
       SELECT $1::uuid,code,CASE WHEN code IN ('WALLET_ALLOCATION','CREDIT_SCORE','CREDIT_POLICY','LIMIT_ALLOCATION','DECISION')
         THEN 'SERVER_ONLY' ELSE 'DIRECT' END
       FROM onboarding.node_type_catalogue`,[channelVersion.rows[0].id],
    );
    const definition = await client.query(
      `INSERT INTO onboarding.journey_definitions(tenant_id,code,name,created_by)
       VALUES($1::uuid,$2,'Onboarding runtime API E2E','e2e-maker') RETURNING id`,
      [tenantId, code],
    );
    definitionId = definition.rows[0].id;
    const version = await client.query(
      `INSERT INTO onboarding.journey_versions(
         journey_definition_id,version_number,status,created_by,modified_by,
         approved_by,approved_at,activated_at
       ) VALUES($1::uuid,1,'ACTIVE','e2e-maker','e2e-maker','e2e-checker',
         CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`,
      [definitionId],
    );
    const versionId = version.rows[0].id;
    await client.query(
      `INSERT INTO onboarding.journey_scopes(
         journey_version_id,country_code,channel_code,customer_type,priority
       ) VALUES($1::uuid,'UGA','MOBILE_APP','INDIVIDUAL',1)`,
      [versionId],
    );
    const nodes = await client.query(
      `INSERT INTO onboarding.journey_nodes(
         journey_version_id,node_key,node_type,name,is_entry,position_x,position_y
       ) VALUES
         ($1::uuid,'start','START','Start',true,0,0),
         ($1::uuid,'phone','PHONE_CAPTURE','Capture phone',false,200,0),
         ($1::uuid,'otp','OTP_VERIFICATION','Verify phone',false,400,0),
         ($1::uuid,'complete','END','Complete',false,600,0)
       RETURNING id,node_key`,
      [versionId],
    );
    const nodeId = Object.fromEntries(nodes.rows.map((row) => [row.node_key, row.id]));
    await client.query(
      `INSERT INTO onboarding.journey_transitions(
         journey_version_id,from_node_id,to_node_id,outcome_code,priority
       ) VALUES
         ($1::uuid,$2::uuid,$3::uuid,'SUCCESS',1),
         ($1::uuid,$3::uuid,$4::uuid,'SUCCESS',1),
         ($1::uuid,$4::uuid,$5::uuid,'SUCCESS',1)`,
      [versionId, nodeId.start, nodeId.phone, nodeId.otp, nodeId.complete],
    );

    const started = await api('/api/v1/onboarding/instances', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-correlation-id': 'onboarding-e2e-start' },
      body: JSON.stringify({
        tenantId,countryCode:'UGA',channelCode:'MOBILE_APP',
        customerType:'INDIVIDUAL',phoneNumber,
      }),
    }, 201);
    assert(started.currentNodeType === 'START', 'Journey did not start at the configured START node');
    assert(started.resumeToken && started.resumeToken.length >= 20, 'Start did not return a resume token');

    const stepHeaders = {
      'content-type': 'application/json',
      'x-onboarding-resume-token': started.resumeToken,
      'x-correlation-id': 'onboarding-e2e-step',
    };
    const first = await api(`/api/v1/onboarding/instances/${started.instanceId}/steps`, {
      method:'POST',
      headers:{ ...stepHeaders,'idempotency-key':'onboarding-e2e-start-0001' },
      body:JSON.stringify({ nodeKey:'start',outcome:'SUCCESS',output:{} }),
    }, 201);
    assert(first.currentNodeType === 'PHONE_CAPTURE' && first.replayed === false,
      'START did not progress to PHONE_CAPTURE');

    const replay = await api(`/api/v1/onboarding/instances/${started.instanceId}/steps`, {
      method:'POST',
      headers:{ ...stepHeaders,'idempotency-key':'onboarding-e2e-start-0001' },
      body:JSON.stringify({ nodeKey:'start',outcome:'SUCCESS',output:{} }),
    }, 201);
    assert(replay.replayed === true && replay.currentNodeType === 'PHONE_CAPTURE',
      'Idempotent replay was not recognised');

    await api(`/api/v1/onboarding/instances/${started.instanceId}/steps`, {
      method:'POST',
      headers:{ ...stepHeaders,'idempotency-key':'onboarding-e2e-start-0001' },
      body:JSON.stringify({ nodeKey:'start',outcome:'SUCCESS',output:{ changed:true } }),
    }, 409);

    const phone = await api(`/api/v1/onboarding/instances/${started.instanceId}/steps`, {
      method:'POST',
      headers:{ ...stepHeaders,'idempotency-key':'onboarding-e2e-phone-0001' },
      body:JSON.stringify({ nodeKey:'phone',outcome:'SUCCESS',output:{ captured:true } }),
    }, 201);
    assert(phone.currentNodeType === 'OTP_VERIFICATION', 'PHONE_CAPTURE did not progress to OTP');

    await api(`/api/v1/onboarding/instances/${started.instanceId}/steps`, {
      method:'POST',
      headers:{ ...stepHeaders,'idempotency-key':'onboarding-e2e-otp-bypass' },
      body:JSON.stringify({ nodeKey:'otp',outcome:'SUCCESS',output:{} }),
    }, 409);

    const resumed = await api(`/api/v1/onboarding/instances/resume?token=${encodeURIComponent(started.resumeToken)}`,
      { method:'GET' }, 200);
    assert(resumed.currentNodeType === 'OTP_VERIFICATION', 'Resume did not return the current OTP node');

    const evidence = await client.query(
      `SELECT instance.status,customer.status AS customer_status,
              (SELECT count(*)::int FROM onboarding.step_executions execution
               WHERE execution.instance_id=instance.id) AS step_count,
              (SELECT count(*)::int FROM onboarding.journey_events event
               WHERE event.instance_id=instance.id AND event.event_type='STEP_SUCCEEDED') AS success_event_count,
              contact.masked_value,contact.value_hash,contact.value_ciphertext IS NOT NULL AS encrypted
       FROM onboarding.journey_instances instance
       JOIN customer_registry.customers customer ON customer.id=instance.customer_id
       JOIN customer_registry.contacts contact ON contact.customer_id=customer.id AND contact.is_primary
       WHERE instance.id=$1::uuid`,
      [started.instanceId],
    );
    const row = evidence.rows[0];
    assert(row.status === 'IN_PROGRESS' && row.customer_status === 'ONBOARDING',
      'Journey or customer status changed unexpectedly before OTP verification');
    assert(row.step_count === 2 && row.success_event_count === 2,
      'Step execution or event history is incomplete');
    assert(row.encrypted && row.masked_value !== phoneNumber,
      'Phone contact was not encrypted and masked');
    assert(row.value_hash === crypto.createHash('sha256').update(phoneNumber).digest('hex'),
      'Phone contact hash does not match the canonical phone');

    console.log(JSON.stringify({
      passed:true,
      checks:[
        'start','start-idempotent-replay','idempotency-key-mismatch-rejected',
        'phone-to-otp','otp-bypass-rejected','resume-at-current-node',
        'step-history','event-history','phone-masked-and-encrypted',
      ],
      finalNode:resumed.currentNodeType,
      testDataRetained:false,
    }, null, 2));
  } finally {
    await cleanup(client, tenantId, definitionId).catch((error) => {
      console.error(`Cleanup failed: ${error.message}`);
      process.exitCode = 1;
    });
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
