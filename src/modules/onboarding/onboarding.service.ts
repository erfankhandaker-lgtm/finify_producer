import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import {
  CreateJourneyDto,
  CreateJourneyVersionDto,
  AdvanceJourneyStepDto,
  ReplaceJourneyGraphDto,
  SimulateJourneyDto,
  StartJourneyDto,
} from './dto/onboarding.dto';
import {
  JourneyGraphInput,
  JourneyNodeInput,
  JourneyValidationIssue,
  JourneyValidationResult,
} from './onboarding.types';
import { ChannelService } from './channel.service';

@Injectable()
export class OnboardingService {
  constructor(private readonly dataSource: DataSource,private readonly channels:ChannelService) {}

  async getStudioMetadata() {
    const [channels,nodeTypes,walletTypes,currencies,scoreProviders,creditPolicies]=await Promise.all([
      this.dataSource.query(
        `SELECT code,name,capabilities FROM onboarding.channels
         WHERE is_active ORDER BY name,code`,
      ),
      this.dataSource.query(
        `SELECT code,name,category,configuration_schema AS "configurationSchema",sensitive
         FROM onboarding.node_type_catalogue WHERE is_active ORDER BY category,name`,
      ),
      this.dataSource.query(
        `SELECT "Wallet_ID"::integer AS code,"Wallet_Name" AS name,
                COALESCE("Is_Kyc_Needed",false) AS "kycRequired"
         FROM public."SW_TBL_WALLET_TYPE"
         WHERE COALESCE("Status",false)=true AND "Wallet_Type"=100
         ORDER BY "Hierarchy","Wallet_ID"`,
      ),
      this.dataSource.query(
        `SELECT DISTINCT upper(currency) AS code
         FROM public.sw_tbl_accounting_configuration
         WHERE is_active AND effective_from<=CURRENT_DATE
           AND (effective_to IS NULL OR effective_to>=CURRENT_DATE)
         ORDER BY code`,
      ),
      this.dataSource.query(
        `SELECT code,name FROM public.credit_score_providers WHERE is_active ORDER BY name,code`,
      ),
      this.dataSource.query(
        `SELECT DISTINCT rule_code AS code,name FROM public.credit_master_rules
         WHERE status='ACTIVE' ORDER BY name,rule_code`,
      ),
    ]);
    return { channels,nodeTypes,walletTypes,currencies,scoreProviders,creditPolicies };
  }

  async listJourneys(query: { tenantId?: string; status?: string }) {
    const values: unknown[] = [];
    const conditions = ['1=1'];
    if (query.tenantId) {
      values.push(query.tenantId);
      conditions.push(`definition.tenant_id=$${values.length}::uuid`);
    }
    if (query.status) {
      values.push(query.status.toUpperCase());
      conditions.push(`version.status=$${values.length}`);
    }
    return this.dataSource.query(
      `SELECT definition.id,definition.tenant_id AS "tenantId",definition.code,
              definition.name,definition.description,
              COALESCE(jsonb_agg(jsonb_build_object(
                'id',version.id,'versionNumber',version.version_number,
                'status',version.status,'revision',version.revision,
                'updatedAt',version.updated_at
              ) ORDER BY version.version_number DESC)
              FILTER (WHERE version.id IS NOT NULL),'[]'::jsonb) AS versions
       FROM onboarding.journey_definitions definition
       LEFT JOIN onboarding.journey_versions version
         ON version.journey_definition_id=definition.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY definition.id
       ORDER BY definition.updated_at DESC`,
      values,
    );
  }

  async createJourney(input: CreateJourneyDto, actor: string) {
    return this.dataSource.transaction(async (manager) => {
      const [definition] = await manager.query(
        `INSERT INTO onboarding.journey_definitions(
           tenant_id,code,name,description,created_by
         ) VALUES($1::uuid,upper($2),$3,$4,$5)
         RETURNING id,tenant_id AS "tenantId",code,name,description`,
        [input.tenantId,input.code,input.name,input.description || null,actor],
      );
      const [version] = await manager.query(
        `INSERT INTO onboarding.journey_versions(
           journey_definition_id,version_number,status,created_by
         ) VALUES($1::uuid,1,'DRAFT',$2)
         RETURNING id,version_number AS "versionNumber",status,revision`,
        [definition.id,actor],
      );
      await this.audit(manager,definition.id,version.id,'CREATE',null,{ definition,version },actor);
      return { ...definition,version };
    }).catch((error) => {
      if (String(error?.code) === '23505') {
        throw new ConflictException('A journey with this tenant and code already exists');
      }
      throw error;
    });
  }

  async createVersion(journeyId: string, input: CreateJourneyVersionDto, actor: string) {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))',[journeyId]);
      const [definition] = await manager.query(
        'SELECT id FROM onboarding.journey_definitions WHERE id=$1::uuid FOR UPDATE',[journeyId],
      );
      if (!definition) throw new NotFoundException('Journey was not found');
      const [next] = await manager.query(
        `SELECT COALESCE(max(version_number),0)+1 AS number
         FROM onboarding.journey_versions WHERE journey_definition_id=$1::uuid`,[journeyId],
      );
      const [version] = await manager.query(
        `INSERT INTO onboarding.journey_versions(
           journey_definition_id,version_number,status,change_summary,created_by
         ) VALUES($1::uuid,$2,'DRAFT',$3,$4)
         RETURNING id,version_number AS "versionNumber",status,revision`,
        [journeyId,Number(next.number),input.changeSummary || null,actor],
      );
      if (input.cloneFromVersionId) {
        await this.cloneGraph(manager,input.cloneFromVersionId,version.id,journeyId);
      }
      await this.audit(manager,journeyId,version.id,'CREATE_VERSION',null,version,actor);
      return this.getVersionWithManager(manager,version.id);
    });
  }

  async getVersion(versionId: string) {
    return this.getVersionWithManager(this.dataSource.manager,versionId);
  }

  async replaceGraph(versionId: string, input: ReplaceJourneyGraphDto, revision: number, actor: string) {
    const validation = this.validateGraph(input);
    if (!validation.valid) throw new BadRequestException(validation);
    return this.dataSource.transaction(async (manager) => {
      const [version] = await manager.query(
        `SELECT * FROM onboarding.journey_versions WHERE id=$1::uuid FOR UPDATE`,[versionId],
      );
      if (!version) throw new NotFoundException('Journey version was not found');
      if (!['DRAFT','REJECTED'].includes(version.status)) {
        throw new ConflictException('Only draft or rejected versions can be edited');
      }
      if (Number(version.revision)!==revision) {
        throw new ConflictException(`Journey graph changed; current revision is ${version.revision}`);
      }
      const before = await this.getVersionWithManager(manager,versionId);
      await manager.query('DELETE FROM onboarding.journey_transitions WHERE journey_version_id=$1::uuid',[versionId]);
      await manager.query('DELETE FROM onboarding.journey_nodes WHERE journey_version_id=$1::uuid',[versionId]);
      await manager.query('DELETE FROM onboarding.journey_scopes WHERE journey_version_id=$1::uuid',[versionId]);
      for (const scope of input.scopes) {
        await manager.query(
          `INSERT INTO onboarding.journey_scopes(
             journey_version_id,country_code,channel_code,customer_type,priority,effective_from,effective_to
           ) VALUES($1::uuid,upper($2),upper($3),upper($4),$5,$6,$7)`,
          [versionId,scope.countryCode,scope.channelCode,scope.customerType,scope.priority,
            scope.effectiveFrom || null,scope.effectiveTo || null],
        );
      }
      const nodeIds = new Map<string,string>();
      for (const node of input.nodes) {
        const [created] = await manager.query(
          `INSERT INTO onboarding.journey_nodes(
             journey_version_id,node_key,node_type,name,configuration,position_x,position_y,is_entry
           ) VALUES($1::uuid,$2,$3,$4,$5::jsonb,$6,$7,$8) RETURNING id`,
          [versionId,node.key,node.type,node.name,JSON.stringify(node.configuration),
            node.position.x,node.position.y,Boolean(node.entry)],
        );
        nodeIds.set(node.key,created.id);
      }
      for (const transition of input.transitions) {
        await manager.query(
          `INSERT INTO onboarding.journey_transitions(
             journey_version_id,from_node_id,to_node_id,outcome_code,priority,condition_expression
           ) VALUES($1::uuid,$2::uuid,$3::uuid,upper($4),$5,$6::jsonb)`,
          [versionId,nodeIds.get(transition.from),nodeIds.get(transition.to),transition.outcome,
            transition.priority,transition.condition ? JSON.stringify(transition.condition) : null],
        );
      }
      await manager.query(
        `UPDATE onboarding.journey_versions SET revision=revision+1,status='DRAFT',
           modified_by=$2,updated_at=CURRENT_TIMESTAMP,rejection_reason=NULL,rejected_by=NULL
         WHERE id=$1::uuid`,[versionId,actor],
      );
      const after = await this.getVersionWithManager(manager,versionId);
      await this.audit(manager,version.journey_definition_id,versionId,'REPLACE_GRAPH',before,after,actor);
      return after;
    });
  }

  async validateVersion(versionId: string) {
    const version = await this.getVersion(versionId);
    const graphValidation=this.validateGraph(version.graph);
    const [definition]=await this.dataSource.query(
      `SELECT definition.tenant_id AS "tenantId" FROM onboarding.journey_versions version
       JOIN onboarding.journey_definitions definition ON definition.id=version.journey_definition_id
       WHERE version.id=$1::uuid`,[versionId]);
    const channelIssues=definition
      ? await this.channels.validateJourneyCompatibility(this.dataSource.manager,definition.tenantId,version.graph)
      : [];
    const configurationIssues=definition
      ? await this.validateConfigurationBindings(this.dataSource.manager,definition.tenantId,version.graph)
      : [];
    const issues=[...graphValidation.issues,...channelIssues,...configurationIssues];
    return {valid:!issues.some(item=>item.severity==='ERROR'),issues};
  }

  async simulate(versionId: string, input: SimulateJourneyDto) {
    const version = await this.getVersion(versionId);
    const validation = this.validateGraph(version.graph);
    if (!validation.valid) return { validation,trace: [] };
    const nodes = new Map<string,JourneyNodeInput>(
      version.graph.nodes.map((node: JourneyNodeInput) => [node.key,node]),
    );
    const entry = version.graph.nodes.find((node: JourneyNodeInput) => node.entry);
    const trace: Array<{ nodeKey: string; nodeType: string; outcome?: string }> = [];
    let current = entry;
    const visited = new Set<string>();
    while (current && trace.length<=version.graph.nodes.length) {
      trace.push({ nodeKey: current.key,nodeType: current.type });
      if (current.type==='END') break;
      if (visited.has(current.key)) break;
      visited.add(current.key);
      const outgoing = version.graph.transitions
        .filter((edge: any) => edge.from===current!.key)
        .sort((a: any,b: any) => a.priority-b.priority);
      const requested = input.outcomes?.[current.key];
      const selected = (requested && outgoing.find((edge: any) => edge.outcome===requested)) ||
        outgoing.find((edge: any) => edge.outcome==='SUCCESS') || outgoing[0];
      if (!selected) break;
      trace[trace.length-1].outcome=selected.outcome;
      current=nodes.get(selected.to);
    }
    return { validation,completed: trace[trace.length-1]?.nodeType==='END',trace };
  }

  async transitionVersion(
    versionId: string,
    action: 'submit'|'approve'|'activate'|'reject'|'retire',
    actor: string,
    reason?: string,
  ) {
    if (action==='activate') {
      const validation=await this.validateVersion(versionId);
      if (!validation.valid) throw new BadRequestException(validation);
      const [activated] = await this.dataSource.query(
        'SELECT * FROM onboarding.activate_journey_version($1::uuid,$2)',[versionId,actor],
      );
      return activated;
    }
    return this.dataSource.transaction(async (manager) => {
      const [version] = await manager.query(
        'SELECT * FROM onboarding.journey_versions WHERE id=$1::uuid FOR UPDATE',[versionId],
      );
      if (!version) throw new NotFoundException('Journey version was not found');
      const target: Record<string,{ from: string[]; to: string }> = {
        submit:{ from:['DRAFT','REJECTED'],to:'SUBMITTED' },
        approve:{ from:['SUBMITTED'],to:'APPROVED' },
        reject:{ from:['SUBMITTED'],to:'REJECTED' },
        retire:{ from:['ACTIVE','APPROVED'],to:'RETIRED' },
      };
      const transition=target[action];
      if (!transition.from.includes(version.status)) {
        throw new ConflictException(`Cannot ${action} a ${version.status} journey version`);
      }
      if (action==='submit') {
        const current=await this.getVersionWithManager(manager,versionId);
        const graphValidation=this.validateGraph(current.graph);
        const [definition]=await manager.query(
          `SELECT definition.tenant_id AS "tenantId" FROM onboarding.journey_definitions definition
           WHERE definition.id=$1::uuid`,[version.journey_definition_id]);
        const channelIssues=await this.channels.validateJourneyCompatibility(manager,definition.tenantId,current.graph);
        const configurationIssues=await this.validateConfigurationBindings(manager,definition.tenantId,current.graph);
        const issues=[...graphValidation.issues,...channelIssues,...configurationIssues];
        const validation={valid:!issues.some(item=>item.severity==='ERROR'),issues};
        if (!validation.valid) throw new BadRequestException(validation);
      }
      if (action==='approve' && actor.toLowerCase()===String(version.modified_by || version.created_by).toLowerCase()) {
        throw new ConflictException('Maker and checker must be different administrators');
      }
      if (action==='reject' && !reason?.trim()) {
        throw new BadRequestException('A rejection reason is required');
      }
      const fields = action==='approve'
        ? ',approved_by=$3,approved_at=CURRENT_TIMESTAMP'
        : action==='reject'
          ? ',rejected_by=$3,rejection_reason=$4'
          : action==='submit'
            ? ',submitted_at=CURRENT_TIMESTAMP'
            : ',retired_at=CURRENT_TIMESTAMP';
      const params = action==='approve' ? [versionId,transition.to,actor]
        : action==='reject' ? [versionId,transition.to,actor,reason!.trim()]
          : [versionId,transition.to];
      await manager.query(
        `UPDATE onboarding.journey_versions SET status=$2,updated_at=CURRENT_TIMESTAMP${fields}
         WHERE id=$1::uuid`,params,
      );
      const after=await this.getVersionWithManager(manager,versionId);
      await this.audit(manager,version.journey_definition_id,versionId,action.toUpperCase(),version,after,actor);
      return after;
    });
  }

  async startOrResume(input: StartJourneyDto, correlationId?: string,clientId?:string,clientCredential?:string) {
    const channel=await this.channels.resolveTrustedChannel(
      input.tenantId,input.countryCode,input.channelCode,clientId,clientCredential,
    );
    const phone=input.phoneNumber.replace(/[\s()-]/g,'');
    const contactHash=this.sha256(phone);
    const resumeToken=randomBytes(32).toString('base64url');
    const resumeHash=this.sha256(resumeToken);
    const encrypted=this.encryptPii(phone);
    const expiresAt=new Date(Date.now()+Number(channel.resumeTimeoutSeconds)*1000);
    const [result]=await this.dataSource.query(
      `SELECT * FROM onboarding.start_or_resume_journey(
         $1::uuid,$2::char(3),$3,$4,$5::char(64),$6,$7::bytea,$8::char(64),$9,$10
       )`,
      [input.tenantId,input.countryCode,input.channelCode,input.customerType,contactHash,
        this.maskPhone(phone),encrypted,resumeHash,correlationId || null,expiresAt],
    );
    const current=await this.runtimeViewById(result.instance_id);
    await this.dataSource.transaction(async manager=>{
      await manager.query(
        `UPDATE onboarding.journey_instances SET
           source_channel_definition_id=COALESCE(source_channel_definition_id,$2::uuid),
           source_channel_version_id=COALESCE(source_channel_version_id,$3::uuid),
           current_channel_definition_id=$2::uuid,current_channel_version_id=$3::uuid
         WHERE id=$1::uuid`,[result.instance_id,channel.definitionId,channel.versionId]);
      await manager.query(
        `UPDATE onboarding.channel_sessions SET status='REVOKED',revoked_at=CURRENT_TIMESTAMP
         WHERE instance_id=$1::uuid AND status='ACTIVE'`,[result.instance_id]);
      await manager.query(
        `INSERT INTO onboarding.channel_sessions(instance_id,channel_version_id,token_hash,client_id,expires_at)
         VALUES($1::uuid,$2::uuid,$3::char(64),$4,$5)`,
        [result.instance_id,channel.versionId,resumeHash,clientId||null,expiresAt]);
    });
    return { ...current,resumed: result.resumed,resumeToken };
  }

  async resume(resumeToken: string) {
    if (!resumeToken || resumeToken.length<20) throw new BadRequestException('A valid resume token is required');
    const [row]=await this.dataSource.query(
      `SELECT id FROM onboarding.journey_instances
       WHERE resume_token_hash=$1 AND expires_at>CURRENT_TIMESTAMP
         AND status IN ('IN_PROGRESS','WAITING_EXTERNAL','MANUAL_REVIEW')`,[this.sha256(resumeToken)],
    );
    if (!row) throw new NotFoundException('Onboarding journey was not found or has expired');
    return this.runtimeViewById(row.id);
  }

  async advanceStep(
    instanceId: string,
    input: AdvanceJourneyStepDto,
    resumeToken: string,
    idempotencyKey: string,
    correlationId?: string,
  ) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(instanceId || '')) {
      throw new BadRequestException('A valid onboarding instance ID is required');
    }
    if (!resumeToken || resumeToken.length<20 || resumeToken.length>200) {
      throw new BadRequestException('A valid onboarding resume token is required');
    }
    if (!idempotencyKey || idempotencyKey.length<8 || idempotencyKey.length>120) {
      throw new BadRequestException('Idempotency-Key must contain between 8 and 120 characters');
    }
    const output=input.output || {};
    if (Buffer.byteLength(JSON.stringify(output),'utf8')>16_384) {
      throw new BadRequestException('Step output cannot exceed 16 KB');
    }
    const resumeTokenHash=this.sha256(resumeToken);
    const [current]=await this.dataSource.query(
      `SELECT node.node_type
       FROM onboarding.journey_instances instance
       JOIN onboarding.journey_nodes node ON node.id=instance.current_node_id
       WHERE instance.id=$1::uuid AND instance.resume_token_hash=$2::char(64)`,
      [instanceId,resumeTokenHash],
    );
    if (!current) throw new NotFoundException('Onboarding journey was not found');
    if (!['START','PHONE_CAPTURE'].includes(current.node_type) || input.outcome!=='SUCCESS') {
      throw new ConflictException(
        `${current.node_type} requires its dedicated verified onboarding service`,
      );
    }
    const inputHash=this.sha256(this.canonicalJson({
      nodeKey:input.nodeKey,
      outcome:input.outcome,
      output,
    }));
    try {
      const [result]=await this.dataSource.query(
        `SELECT * FROM onboarding.advance_journey_step(
           $1::uuid,$2::char(64),$3,$4,$5,$6::char(64),$7::jsonb,$8,$9
         )`,
        [instanceId,resumeTokenHash,input.nodeKey,input.outcome,idempotencyKey,inputHash,
          JSON.stringify(output),'customer',correlationId || null],
      );
      if (!result) throw new Error('Onboarding runtime returned no result');
      return {
        instanceId:result.instance_id,
        customerId:result.customer_id,
        status:result.status,
        currentNodeId:result.current_node_id,
        currentNodeKey:result.current_node_key,
        currentNodeType:result.current_node_type,
        currentNodeName:result.current_node_name,
        currentNodeConfiguration:result.current_node_configuration,
        completedAt:result.completed_at,
        replayed:result.replayed,
      };
    } catch (error) {
      const message=String(error?.message || '');
      if (message.includes('instance or resume token is invalid')) {
        throw new NotFoundException('Onboarding journey was not found');
      }
      if (message.includes('has expired')) {
        throw new NotFoundException('Onboarding journey has expired');
      }
      if (
        message.includes('Idempotency key') ||
        message.includes('current node changed') ||
        message.includes('cannot advance') ||
        message.includes('No transition matches') ||
        message.includes('completed journey')
      ) {
        throw new ConflictException(message.split('\n')[0]);
      }
      throw error;
    }
  }

  validateGraph(graph: JourneyGraphInput): JourneyValidationResult {
    const issues: JourneyValidationIssue[]=[];
    const nodes=graph?.nodes || [];
    const transitions=graph?.transitions || [];
    const keys=new Set<string>();
    for (const node of nodes) {
      if (keys.has(node.key)) issues.push(this.issue('DUPLICATE_NODE_KEY',`Node key ${node.key} is duplicated`,node.key));
      keys.add(node.key);
    }
    const entries=nodes.filter((node) => node.entry);
    if (entries.length!==1) issues.push(this.issue('ENTRY_NODE_COUNT','A journey must have exactly one entry node'));
    if (entries[0] && entries[0].type!=='START') issues.push(this.issue('ENTRY_NODE_TYPE','The entry node must be START',entries[0].key));
    if (!nodes.some((node) => node.type==='END')) issues.push(this.issue('END_NODE_REQUIRED','A journey must have at least one END node'));
    for (const edge of transitions) {
      if (!keys.has(edge.from)) issues.push(this.issue('UNKNOWN_EDGE_SOURCE',`Unknown source node ${edge.from}`));
      if (!keys.has(edge.to)) issues.push(this.issue('UNKNOWN_EDGE_TARGET',`Unknown target node ${edge.to}`));
      if (edge.from===edge.to) issues.push(this.issue('SELF_LOOP','A node cannot transition to itself',edge.from));
    }
    for (const node of nodes.filter((item) => item.type==='END')) {
      if (transitions.some((edge) => edge.from===node.key)) issues.push(this.issue('END_HAS_TRANSITION','END nodes cannot have outgoing transitions',node.key));
    }
    this.validateRequiredConfiguration(nodes,issues);
    if (entries.length===1) {
      const reachable=new Set<string>();
      const queue=[entries[0].key];
      while (queue.length) {
        const key=queue.shift()!;
        if (reachable.has(key)) continue;
        reachable.add(key);
        transitions.filter((edge) => edge.from===key).forEach((edge) => queue.push(edge.to));
      }
      nodes.filter((node) => !reachable.has(node.key)).forEach((node) =>
        issues.push(this.issue('UNREACHABLE_NODE','Node cannot be reached from the entry node',node.key)),
      );
    }
    const scopes=new Set<string>();
    for (const scope of graph?.scopes || []) {
      const key=`${scope.countryCode}:${scope.channelCode}:${scope.customerType}`;
      if (scopes.has(key)) issues.push(this.issue('DUPLICATE_SCOPE',`Scope ${key} is duplicated`));
      scopes.add(key);
      if (scope.effectiveFrom && scope.effectiveTo && new Date(scope.effectiveTo)<=new Date(scope.effectiveFrom)) {
        issues.push(this.issue('INVALID_SCOPE_PERIOD',`Scope ${key} has an invalid effective period`));
      }
    }
    if (!scopes.size) issues.push(this.issue('SCOPE_REQUIRED','At least one journey scope is required'));
    return { valid:!issues.some((item) => item.severity==='ERROR'),issues };
  }

  private validateRequiredConfiguration(nodes: JourneyNodeInput[], issues: JourneyValidationIssue[]) {
    const required: Partial<Record<JourneyNodeInput['type'],string[]>>={
      KYC:['kycConfigurationVersionId'],WALLET_ALLOCATION:['walletProductBindingId','walletType','currency'],
      CREDIT_SCORE:['providerCode'],CREDIT_POLICY:['policyCode'],CONSENT:['consentVersionId'],
      FORM:['formVersionId'],CHANNEL_HANDOFF:['targetChannel'],
    };
    for (const node of nodes) {
      for (const field of required[node.type] || []) {
        if (node.configuration?.[field]===undefined || node.configuration[field]===null || node.configuration[field]==='') {
          issues.push(this.issue('MISSING_NODE_CONFIGURATION',`${node.type} requires ${field}`,node.key));
        }
      }
    }
  }

  private async validateConfigurationBindings(
    manager: EntityManager,
    tenantId: string,
    graph: JourneyGraphInput,
  ): Promise<JourneyValidationIssue[]> {
    const issues: JourneyValidationIssue[]=[];
    const scopes=graph.scopes || [];
    const scopeMatches=(row: Record<string,unknown>) => scopes.some((scope) =>
      scope.countryCode===row.countryCode &&
      scope.customerType===row.customerType &&
      (!row.channelCode || scope.channelCode===row.channelCode),
    );
    const unavailable=(code: string,message: string,nodeKey: string) =>
      issues.push(this.issue(code,message,nodeKey));

    for (const node of graph.nodes || []) {
      const config=node.configuration || {};
      if (node.type==='OTP_VERIFICATION') {
        const [row]=await manager.query(
          `SELECT country_code AS "countryCode",channel_code AS "channelCode",'INDIVIDUAL' AS "customerType",
                  status,is_active AS "isActive"
           FROM onboarding.otp_policies
           WHERE id=$1::uuid AND tenant_id=$2::uuid`,[config.policyId || null,tenantId]);
        if (!row || row.status!=='ACTIVE' || !row.isActive || !scopeMatches(row)) {
          unavailable('OTP_POLICY_NOT_ACTIVE','OTP policy must be active and match a journey scope',node.key);
        }
      }
      const governedTypes: Partial<Record<JourneyNodeInput['type'],{ field:string; type:string }>>={
        CONSENT:{field:'consentVersionId',type:'CONSENT'},
        FORM:{field:'formVersionId',type:'CUSTOMER_FORM'},
        KYC:{field:'kycConfigurationVersionId',type:'KYC'},
      };
      const governed=governedTypes[node.type];
      if (governed) {
        const [row]=await manager.query(
          `SELECT version.status,version.country_code AS "countryCode",
                  version.channel_code AS "channelCode",version.customer_type AS "customerType"
           FROM onboarding.configuration_versions version
           JOIN onboarding.configuration_definitions definition
             ON definition.id=version.configuration_definition_id
           WHERE version.id=$1::uuid AND definition.tenant_id=$2::uuid
             AND definition.configuration_type=$3`,
          [config[governed.field] || null,tenantId,governed.type]);
        if (!row || row.status!=='ACTIVE' || !scopeMatches(row)) {
          unavailable(
            `${governed.type}_CONFIGURATION_NOT_ACTIVE`,
            `${governed.type.replace('_',' ')} configuration must be active and match a journey scope`,
            node.key,
          );
        }
      }
      if (node.type==='WALLET_ALLOCATION') {
        const [row]=await manager.query(
          `SELECT status,country_code AS "countryCode",channel_code AS "channelCode",
                  customer_type AS "customerType",wallet_type AS "walletType",currency
           FROM onboarding.wallet_product_bindings
           WHERE id=$1::uuid AND tenant_id=$2::uuid`,
          [config.walletProductBindingId || null,tenantId]);
        if (!row || row.status!=='ACTIVE' || !scopeMatches(row)
            || Number(row.walletType)!==Number(config.walletType)
            || row.currency!==config.currency) {
          unavailable(
            'WALLET_PRODUCT_BINDING_NOT_ACTIVE',
            'Wallet/product binding must be active, match the journey scope and agree with wallet and currency',
            node.key,
          );
        }
      }
      if (node.type==='CREDIT_SCORE') {
        const [row]=await manager.query(
          `SELECT provider.is_active AS "providerActive",integration.is_active AS "integrationActive"
           FROM public.credit_score_providers provider
           JOIN public.credit_http_integrations integration ON integration.id=provider.http_integration_id
           WHERE provider.code=$1`,[config.providerCode || null]);
        if (!row || !row.providerActive || !row.integrationActive) {
          unavailable(
            'SCORE_PROVIDER_NOT_ACTIVE',
            'Score provider and its integration must both be approved and active',
            node.key,
          );
        }
      }
      if (node.type==='CREDIT_POLICY') {
        const [row]=await manager.query(
          `SELECT status FROM public.credit_master_rules
           WHERE rule_code=$1 AND version=$2`,
          [config.policyCode || null,Number(config.policyVersion || 0)]);
        if (!row || row.status!=='ACTIVE') {
          unavailable('CREDIT_POLICY_NOT_ACTIVE','Credit policy version must be approved and active',node.key);
        }
      }
    }
    return issues;
  }

  private async getVersionWithManager(manager: EntityManager,versionId: string) {
    const [version]=await manager.query(
      `SELECT version.id,version.journey_definition_id AS "journeyDefinitionId",
              version.version_number AS "versionNumber",version.status,version.revision,
              version.change_summary AS "changeSummary",version.created_by AS "createdBy",
              version.modified_by AS "modifiedBy",version.approved_by AS "approvedBy",
              version.rejection_reason AS "rejectionReason",version.updated_at AS "updatedAt"
       FROM onboarding.journey_versions version WHERE version.id=$1::uuid`,[versionId],
    );
    if (!version) throw new NotFoundException('Journey version was not found');
    const scopes=await manager.query(
      `SELECT country_code AS "countryCode",channel_code AS "channelCode",
              customer_type AS "customerType",priority,effective_from AS "effectiveFrom",
              effective_to AS "effectiveTo"
       FROM onboarding.journey_scopes WHERE journey_version_id=$1::uuid ORDER BY priority,id`,[versionId],
    );
    const nodes=await manager.query(
      `SELECT node_key AS key,node_type AS type,name,configuration,
              jsonb_build_object('x',position_x,'y',position_y) AS position,is_entry AS entry
       FROM onboarding.journey_nodes WHERE journey_version_id=$1::uuid ORDER BY id`,[versionId],
    );
    const transitions=await manager.query(
      `SELECT source.node_key AS "from",target.node_key AS "to",edge.outcome_code AS outcome,
              edge.priority,edge.condition_expression AS condition
       FROM onboarding.journey_transitions edge
       JOIN onboarding.journey_nodes source ON source.id=edge.from_node_id
       JOIN onboarding.journey_nodes target ON target.id=edge.to_node_id
       WHERE edge.journey_version_id=$1::uuid ORDER BY edge.priority,edge.id`,[versionId],
    );
    return { ...version,graph:{ scopes,nodes,transitions } };
  }

  private async cloneGraph(manager: EntityManager,sourceVersionId: string,targetVersionId: string,journeyId: string) {
    const [source]=await manager.query(
      `SELECT id FROM onboarding.journey_versions
       WHERE id=$1::uuid AND journey_definition_id=$2::uuid`,[sourceVersionId,journeyId],
    );
    if (!source) throw new BadRequestException('Clone source does not belong to this journey');
    const sourceGraph=(await this.getVersionWithManager(manager,sourceVersionId)).graph;
    await this.replaceGraphRows(manager,targetVersionId,sourceGraph);
  }

  private async replaceGraphRows(manager: EntityManager,versionId: string,graph: JourneyGraphInput) {
    for (const scope of graph.scopes) await manager.query(
      `INSERT INTO onboarding.journey_scopes(journey_version_id,country_code,channel_code,customer_type,priority,effective_from,effective_to)
       VALUES($1::uuid,$2,$3,$4,$5,$6,$7)`,
      [versionId,scope.countryCode,scope.channelCode,scope.customerType,scope.priority,scope.effectiveFrom,scope.effectiveTo],
    );
    const ids=new Map<string,string>();
    for (const node of graph.nodes) {
      const [row]=await manager.query(
        `INSERT INTO onboarding.journey_nodes(journey_version_id,node_key,node_type,name,configuration,position_x,position_y,is_entry)
         VALUES($1::uuid,$2,$3,$4,$5::jsonb,$6,$7,$8) RETURNING id`,
        [versionId,node.key,node.type,node.name,JSON.stringify(node.configuration),node.position.x,node.position.y,node.entry],
      );
      ids.set(node.key,row.id);
    }
    for (const edge of graph.transitions) await manager.query(
      `INSERT INTO onboarding.journey_transitions(journey_version_id,from_node_id,to_node_id,outcome_code,priority,condition_expression)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::jsonb)`,
      [versionId,ids.get(edge.from),ids.get(edge.to),edge.outcome,edge.priority,
        edge.condition ? JSON.stringify(edge.condition) : null],
    );
  }

  private async runtimeViewById(instanceId: string) {
    const [row]=await this.dataSource.query(
      `SELECT instance.id AS "instanceId",instance.customer_id AS "customerId",
              instance.status,instance.source_channel_code AS "sourceChannel",
              instance.current_channel_code AS "currentChannel",instance.expires_at AS "expiresAt",
              node.node_key AS "currentNodeKey",node.node_type AS "currentNodeType",
              node.name AS "currentNodeName",node.configuration AS "currentNodeConfiguration"
       FROM onboarding.journey_instances instance
       LEFT JOIN onboarding.journey_nodes node ON node.id=instance.current_node_id
       WHERE instance.id=$1::uuid`,[instanceId],
    );
    if (!row) throw new NotFoundException('Onboarding journey was not found');
    return row;
  }

  private async audit(manager: EntityManager,journeyId: string,versionId: string|null,
    action: string,previous: unknown,next: unknown,actor: string) {
    await manager.query(
      `INSERT INTO onboarding.configuration_audit(
         journey_definition_id,journey_version_id,action,previous_state,new_state,actor_id
       ) VALUES($1::uuid,$2::uuid,$3,$4::jsonb,$5::jsonb,$6)`,
      [journeyId,versionId,action,previous ? JSON.stringify(previous) : null,JSON.stringify(next),actor],
    );
  }

  private encryptPii(value: string): Buffer {
    const encoded=String(process.env.ONBOARDING_PII_ENCRYPTION_KEY || '').trim();
    const key=Buffer.from(encoded,'base64');
    if (key.length!==32) throw new Error('ONBOARDING_PII_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
    const iv=randomBytes(12);
    const cipher=createCipheriv('aes-256-gcm',key,iv);
    const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),encrypted]);
  }

  private sha256(value: string) { return createHash('sha256').update(value).digest('hex'); }
  private canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`;
    if (value && typeof value==='object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left],[right]) => left.localeCompare(right))
        .map(([key,item]) => `${JSON.stringify(key)}:${this.canonicalJson(item)}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }
  private maskPhone(value: string) { return `${value.slice(0,4)}${'*'.repeat(Math.max(0,value.length-7))}${value.slice(-3)}`; }
  private issue(code: string,message: string,nodeKey?: string): JourneyValidationIssue {
    return { severity:'ERROR',code,message,...(nodeKey ? { nodeKey } : {}) };
  }
}
