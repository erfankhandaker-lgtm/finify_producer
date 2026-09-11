import { BadRequestException,ConflictException,Injectable,NotFoundException,UnauthorizedException } from '@nestjs/common';
import { createHash,createHmac,randomBytes,randomUUID,timingSafeEqual } from 'node:crypto';
import { DataSource,EntityManager } from 'typeorm';
import { CreateChannelClientDto,CreateChannelDto,CreateChannelVersionDto,ReplaceChannelVersionDto } from './dto/channel.dto';
import { JourneyGraphInput,JourneyValidationIssue } from './onboarding.types';

@Injectable()
export class ChannelService {
  constructor(private readonly dataSource:DataSource) {}

  list(tenantId?:string) {
    const values:unknown[]=[];
    const where=tenantId ? (values.push(tenantId),`WHERE definition.tenant_id=$1::uuid`) : '';
    return this.dataSource.query(
      `SELECT definition.id,definition.tenant_id AS "tenantId",definition.code,definition.name,
              definition.description,definition.is_enabled AS "isEnabled",
              COALESCE(jsonb_agg(jsonb_build_object(
                'id',version.id,'versionNumber',version.version_number,'status',version.status,
                'revision',version.revision,'authenticationMode',version.authentication_mode,
                'updatedAt',version.updated_at
              ) ORDER BY version.version_number DESC) FILTER (WHERE version.id IS NOT NULL),'[]'::jsonb) AS versions
       FROM onboarding.channel_definitions definition
       LEFT JOIN onboarding.channel_versions version ON version.channel_definition_id=definition.id
       ${where}
       GROUP BY definition.id ORDER BY definition.updated_at DESC`,values);
  }

  async create(input:CreateChannelDto,actor:string) {
    return this.dataSource.transaction(async manager=>{
      const [definition]=await manager.query(
        `INSERT INTO onboarding.channel_definitions(tenant_id,code,name,description,created_by)
         VALUES($1::uuid,upper($2),$3,$4,$5)
         RETURNING id,tenant_id AS "tenantId",code,name,description,is_enabled AS "isEnabled"`,
        [input.tenantId,input.code,input.name,input.description||null,actor]);
      const [version]=await manager.query(
        `INSERT INTO onboarding.channel_versions(
           channel_definition_id,version_number,status,authentication_mode,session_timeout_seconds,
           resume_timeout_seconds,configuration,created_by,modified_by
         ) VALUES($1::uuid,1,'DRAFT',$2,$3,$4,$5::jsonb,$6,$6) RETURNING id`,
        [definition.id,input.authenticationMode,input.sessionTimeoutSeconds,input.resumeTimeoutSeconds,
          JSON.stringify(input.configuration||{}),actor]);
      await this.replaceChildren(manager,version.id,input.countries,input.capabilities);
      const result=await this.getVersionWithManager(manager,version.id);
      await this.audit(manager,definition.id,version.id,'CREATE',null,{definition,version:result},actor);
      return {...definition,version:result};
    }).catch(error=>{
      if (String(error?.code)==='23505') throw new ConflictException('This tenant already has a channel with that code');
      throw error;
    });
  }

  async createVersion(channelId:string,input:CreateChannelVersionDto,actor:string) {
    return this.dataSource.transaction(async manager=>{
      const [definition]=await manager.query(
        'SELECT id FROM onboarding.channel_definitions WHERE id=$1::uuid FOR UPDATE',[channelId]);
      if (!definition) throw new NotFoundException('Channel was not found');
      const [next]=await manager.query(
        'SELECT COALESCE(max(version_number),0)+1 AS number FROM onboarding.channel_versions WHERE channel_definition_id=$1::uuid',[channelId]);
      const [version]=await manager.query(
        `INSERT INTO onboarding.channel_versions(channel_definition_id,version_number,status,change_summary,created_by,modified_by)
         VALUES($1::uuid,$2,'DRAFT',$3,$4,$4) RETURNING id`,
        [channelId,Number(next.number),input.changeSummary||null,actor]);
      if (input.cloneFromVersionId) {
        const source=await this.getVersionWithManager(manager,input.cloneFromVersionId);
        if (source.channelDefinitionId!==channelId) throw new BadRequestException('Clone source does not belong to this channel');
        await manager.query(
          `UPDATE onboarding.channel_versions SET authentication_mode=$2,session_timeout_seconds=$3,
             resume_timeout_seconds=$4,configuration=$5::jsonb WHERE id=$1::uuid`,
          [version.id,source.authenticationMode,source.sessionTimeoutSeconds,source.resumeTimeoutSeconds,
            JSON.stringify(source.configuration)]);
        await this.replaceChildren(manager,version.id,source.countries,source.capabilities);
      }
      const result=await this.getVersionWithManager(manager,version.id);
      await this.audit(manager,channelId,version.id,'CREATE_VERSION',null,result,actor);
      return result;
    });
  }

  getVersion(versionId:string) { return this.getVersionWithManager(this.dataSource.manager,versionId); }

  async replaceVersion(versionId:string,input:ReplaceChannelVersionDto,revision:number,actor:string) {
    return this.dataSource.transaction(async manager=>{
      const [version]=await manager.query('SELECT * FROM onboarding.channel_versions WHERE id=$1::uuid FOR UPDATE',[versionId]);
      if (!version) throw new NotFoundException('Channel version was not found');
      if (!['DRAFT','REJECTED'].includes(version.status)) throw new ConflictException('Only draft or rejected channel versions can be edited');
      if (Number(version.revision)!==revision) throw new ConflictException(`Channel changed; current revision is ${version.revision}`);
      this.validateConfiguration(input.countries,input.capabilities);
      const before=await this.getVersionWithManager(manager,versionId);
      await manager.query(
        `UPDATE onboarding.channel_versions SET authentication_mode=$2,session_timeout_seconds=$3,
           resume_timeout_seconds=$4,configuration=$5::jsonb,revision=revision+1,status='DRAFT',
           modified_by=$6,rejection_reason=NULL,rejected_by=NULL,updated_at=CURRENT_TIMESTAMP
         WHERE id=$1::uuid`,
        [versionId,input.authenticationMode,input.sessionTimeoutSeconds,input.resumeTimeoutSeconds,
          JSON.stringify(input.configuration),actor]);
      await this.replaceChildren(manager,versionId,input.countries,input.capabilities);
      const after=await this.getVersionWithManager(manager,versionId);
      await this.audit(manager,version.channel_definition_id,versionId,'REPLACE_CONFIGURATION',before,after,actor);
      return after;
    });
  }

  async transition(versionId:string,action:'submit'|'approve'|'activate'|'reject'|'retire',actor:string,reason?:string) {
    return this.dataSource.transaction(async manager=>{
      const [version]=await manager.query('SELECT * FROM onboarding.channel_versions WHERE id=$1::uuid FOR UPDATE',[versionId]);
      if (!version) throw new NotFoundException('Channel version was not found');
      const target:Record<string,{from:string[];to:string}>={
        submit:{from:['DRAFT','REJECTED'],to:'SUBMITTED'},approve:{from:['SUBMITTED'],to:'APPROVED'},
        activate:{from:['APPROVED'],to:'ACTIVE'},reject:{from:['SUBMITTED'],to:'REJECTED'},
        retire:{from:['ACTIVE','APPROVED'],to:'RETIRED'},
      };
      const transition=target[action];
      if (!transition.from.includes(version.status)) throw new ConflictException(`Cannot ${action} a ${version.status} channel version`);
      if (action==='submit') {
        const current=await this.getVersionWithManager(manager,versionId);
        this.validateConfiguration(current.countries,current.capabilities);
      }
      if (action==='approve' && actor.toLowerCase()===String(version.modified_by||version.created_by).toLowerCase()) {
        throw new ConflictException('Maker and checker must be different administrators');
      }
      if (action==='reject'&&!reason?.trim()) throw new BadRequestException('A rejection reason is required');
      const before=await this.getVersionWithManager(manager,versionId);
      if (action==='activate') {
        await manager.query(
          `UPDATE onboarding.channel_versions SET status='RETIRED',retired_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
           WHERE channel_definition_id=$1::uuid AND status='ACTIVE' AND id<>$2::uuid`,
          [version.channel_definition_id,versionId]);
        await manager.query(
          `INSERT INTO onboarding.channels(code,name,capabilities,created_by)
           SELECT definition.code,definition.name,$2::jsonb,$3 FROM onboarding.channel_definitions definition WHERE definition.id=$1::uuid
           ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,capabilities=EXCLUDED.capabilities,is_active=true,updated_at=CURRENT_TIMESTAMP`,
          [version.channel_definition_id,JSON.stringify(before.configuration),actor]);
      }
      const extra=action==='approve'?',approved_by=$3,approved_at=CURRENT_TIMESTAMP':
        action==='activate'?',activated_at=CURRENT_TIMESTAMP':action==='submit'?',submitted_at=CURRENT_TIMESTAMP':
          action==='reject'?',rejected_by=$3,rejection_reason=$4':',retired_at=CURRENT_TIMESTAMP';
      const params=action==='approve'?[versionId,transition.to,actor]:action==='reject'?[versionId,transition.to,actor,reason!.trim()]:[versionId,transition.to];
      await manager.query(`UPDATE onboarding.channel_versions SET status=$2,updated_at=CURRENT_TIMESTAMP${extra} WHERE id=$1::uuid`,params);
      const after=await this.getVersionWithManager(manager,versionId);
      await this.audit(manager,version.channel_definition_id,versionId,action.toUpperCase(),before,after,actor);
      return after;
    });
  }

  async resolveTrustedChannel(tenantId:string,countryCode:string,requestedCode:string,clientId?:string,credential?:string) {
    const [resolved]=await this.dataSource.query(
      `SELECT definition.id AS "definitionId",definition.code,version.id AS "versionId",
              version.resume_timeout_seconds AS "resumeTimeoutSeconds"
       FROM onboarding.channel_definitions definition
       JOIN onboarding.channel_versions version ON version.channel_definition_id=definition.id AND version.status='ACTIVE'
       JOIN onboarding.channel_country_scopes country ON country.channel_version_id=version.id
         AND country.country_code=upper($2) AND country.is_enabled
       WHERE definition.tenant_id=$1::uuid AND definition.code=upper($3) AND definition.is_enabled`,
      [tenantId,countryCode,requestedCode]);
    if (!resolved) throw new NotFoundException('No active onboarding channel matches the tenant and country');
    const required=String(process.env.ONBOARDING_TRUSTED_CHANNEL_REQUIRED||'').toLowerCase()==='true'||
      ['production','prod'].includes(String(process.env.NODE_ENV||process.env.NODE_MODE||'').toLowerCase());
    if (required||clientId||credential) {
      if (!clientId||!credential) throw new UnauthorizedException('Trusted channel client credentials are required');
      const [client]=await this.dataSource.query(
        `SELECT credential_hash FROM onboarding.channel_clients
         WHERE channel_definition_id=$1::uuid AND client_id=$2 AND is_active
           AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)`,[resolved.definitionId,clientId]);
      if (!client||!this.safeHashMatch(credential,client.credential_hash)) throw new UnauthorizedException('Trusted channel client credentials are invalid');
    }
    return resolved;
  }

  async listClients(channelId:string) {
    const [definition]=await this.dataSource.query('SELECT id FROM onboarding.channel_definitions WHERE id=$1::uuid',[channelId]);
    if (!definition) throw new NotFoundException('Channel was not found');
    return this.dataSource.query(
      `SELECT id,client_id AS "clientId",authentication_mode AS "authenticationMode",is_active AS "isActive",
              credential_reference AS "credentialReference",expires_at AS "expiresAt",created_at AS "createdAt"
       FROM onboarding.channel_clients WHERE channel_definition_id=$1::uuid ORDER BY created_at DESC`,[channelId]);
  }

  async createClient(channelId:string,input:CreateChannelClientDto,actor:string) {
    const generatedCredential=input.credentialReference?null:this.issueToken();
    try {
      const [client]=await this.dataSource.query(
        `INSERT INTO onboarding.channel_clients(
           channel_definition_id,client_id,credential_hash,credential_reference,authentication_mode,expires_at,created_by
         ) SELECT definition.id,$2,$3::char(64),$4,$5,$6,$7
           FROM onboarding.channel_definitions definition WHERE definition.id=$1::uuid
         RETURNING id,client_id AS "clientId",authentication_mode AS "authenticationMode",is_active AS "isActive",expires_at AS "expiresAt"`,
        [channelId,input.clientId,generatedCredential?this.hash(generatedCredential):null,input.credentialReference||null,
          input.authenticationMode,input.expiresAt||null,actor]);
      if (!client) throw new NotFoundException('Channel was not found');
      return {...client,...(generatedCredential?{credential:generatedCredential}:{})};
    } catch(error) {
      if(String(error?.code)==='23505') throw new ConflictException('Channel client ID already exists');
      throw error;
    }
  }

  async revokeClient(channelId:string,clientId:string) {
    const result=await this.dataSource.query(
      `UPDATE onboarding.channel_clients SET is_active=false,updated_at=CURRENT_TIMESTAMP
       WHERE channel_definition_id=$1::uuid AND id=$2::uuid RETURNING id,is_active AS "isActive"`,[channelId,clientId]);
    if(!result[0]) throw new NotFoundException('Channel client was not found');
    return result[0];
  }

  async validateJourneyCompatibility(manager:EntityManager,tenantId:string,graph:JourneyGraphInput):Promise<JourneyValidationIssue[]> {
    const issues:JourneyValidationIssue[]=[];
    for (const scope of graph.scopes||[]) {
      const rows=await manager.query(
        `SELECT node.node_type AS "nodeType",node.execution_mode AS "executionMode"
         FROM onboarding.channel_definitions definition
         JOIN onboarding.channel_versions version ON version.channel_definition_id=definition.id AND version.status='ACTIVE'
         JOIN onboarding.channel_country_scopes country ON country.channel_version_id=version.id
           AND country.country_code=upper($3) AND country.is_enabled
         LEFT JOIN onboarding.channel_node_capabilities node ON node.channel_version_id=version.id
         WHERE definition.tenant_id=$1::uuid AND definition.code=upper($2) AND definition.is_enabled`,
        [tenantId,scope.channelCode,scope.countryCode]);
      if (!rows.length) {
        issues.push({severity:'ERROR',code:'CHANNEL_NOT_ACTIVE',message:`Channel ${scope.channelCode} is not active for ${scope.countryCode}`});
        continue;
      }
      const modes=new Map(rows.filter((row:any)=>row.nodeType).map((row:any)=>[row.nodeType,row.executionMode]));
      for (const node of graph.nodes) {
        const mode=modes.get(node.type);
        if (!mode||mode==='UNSUPPORTED') issues.push({severity:'ERROR',code:'CHANNEL_NODE_UNSUPPORTED',message:`${scope.channelCode} does not support ${node.type}`,nodeKey:node.key});
        if (mode==='HANDOFF_ONLY'&&node.type!=='CHANNEL_HANDOFF') issues.push({severity:'ERROR',code:'CHANNEL_HANDOFF_REQUIRED',message:`${scope.channelCode} requires a channel handoff before ${node.type}`,nodeKey:node.key});
      }
    }
    return issues;
  }

  async createHandoff(instanceId:string,resumeToken:string,idempotencyKey:string,expiresInSeconds=300,correlationId?:string) {
    if (!resumeToken||resumeToken.length<20) throw new BadRequestException('A valid onboarding resume token is required');
    if (!idempotencyKey||idempotencyKey.length<8||idempotencyKey.length>120) throw new BadRequestException('Idempotency-Key must contain between 8 and 120 characters');
    return this.dataSource.transaction(async manager=>{
      const [instance]=await manager.query(
        `SELECT instance.*,node.node_type,node.configuration,customer.home_country_code
         FROM onboarding.journey_instances instance
         JOIN onboarding.journey_nodes node ON node.id=instance.current_node_id
         JOIN customer_registry.customers customer ON customer.id=instance.customer_id
         WHERE instance.id=$1::uuid AND instance.resume_token_hash=$2::char(64) FOR UPDATE OF instance`,
        [instanceId,this.hash(resumeToken)]);
      if (!instance) throw new NotFoundException('Onboarding journey was not found');
      if (instance.node_type!=='CHANNEL_HANDOFF') throw new ConflictException(`${instance.node_type} is not a channel handoff node`);
      const targetCode=String(instance.configuration?.targetChannel||'').toUpperCase();
      if (!targetCode) throw new ConflictException('Channel handoff target is not configured');
      const [existing]=await manager.query(
        `SELECT handoff.id,handoff.status,handoff.expires_at AS "expiresAt",definition.code AS "targetChannel"
         FROM onboarding.channel_handoffs handoff
         JOIN onboarding.channel_versions version ON version.id=handoff.target_channel_version_id
         JOIN onboarding.channel_definitions definition ON definition.id=version.channel_definition_id
         WHERE handoff.instance_id=$1::uuid AND handoff.idempotency_key=$2`,[instanceId,idempotencyKey]);
      if (existing) return {...existing,handoffToken:this.handoffToken(existing.id),replayed:true};
      const [target]=await manager.query(
        `SELECT definition.id AS definition_id,version.id AS version_id
         FROM onboarding.channel_definitions definition
         JOIN onboarding.channel_versions version ON version.channel_definition_id=definition.id AND version.status='ACTIVE'
         JOIN onboarding.channel_country_scopes country ON country.channel_version_id=version.id
           AND country.country_code=$3 AND country.is_enabled
         WHERE definition.tenant_id=$1::uuid AND definition.code=$2 AND definition.is_enabled`,
        [instance.tenant_id,targetCode,instance.home_country_code]);
      if (!target) throw new ConflictException(`Target channel ${targetCode} is not active for this customer country`);
      if (!instance.current_channel_version_id) throw new ConflictException('Current channel version is not available for handoff');
      const handoffId=randomUUID();const token=this.handoffToken(handoffId);
      const expiresAt=new Date(Date.now()+expiresInSeconds*1000);
      await manager.query(
        `INSERT INTO onboarding.channel_handoffs(
           id,instance_id,source_channel_version_id,target_channel_version_id,source_node_id,
           token_hash,idempotency_key,expires_at,created_by
         ) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::char(64),$7,$8,'customer')`,
        [handoffId,instanceId,instance.current_channel_version_id,target.version_id,instance.current_node_id,
          this.hash(token),idempotencyKey,expiresAt]);
      await manager.query(
        `INSERT INTO onboarding.journey_events(instance_id,event_type,node_id,actor_type,correlation_id,payload)
         VALUES($1::uuid,'CHANNEL_HANDOFF_CREATED',$2::uuid,'CUSTOMER',$3,
           jsonb_build_object('handoffId',$4::text,'sourceChannel',$5::text,'targetChannel',$6::text,'expiresAt',$7::timestamptz))`,
        [instanceId,instance.current_node_id,correlationId||null,handoffId,instance.current_channel_code,targetCode,expiresAt]);
      return {id:handoffId,status:'PENDING',targetChannel:targetCode,expiresAt,handoffToken:token,replayed:false};
    });
  }

  async consumeHandoff(handoffToken:string,clientId?:string,credential?:string,correlationId?:string) {
    const [handoffId,signature]=String(handoffToken||'').split('.');
    if (!handoffId||!signature||!this.safeTextMatch(signature,this.handoffSignature(handoffId))) throw new UnauthorizedException('Channel handoff token is invalid');
    const [context]=await this.dataSource.query(
      `SELECT handoff.id,instance.tenant_id,customer.home_country_code,definition.code
       FROM onboarding.channel_handoffs handoff
       JOIN onboarding.journey_instances instance ON instance.id=handoff.instance_id
       JOIN customer_registry.customers customer ON customer.id=instance.customer_id
       JOIN onboarding.channel_versions version ON version.id=handoff.target_channel_version_id
       JOIN onboarding.channel_definitions definition ON definition.id=version.channel_definition_id
       WHERE handoff.id=$1::uuid AND handoff.token_hash=$2::char(64)`,[handoffId,this.hash(handoffToken)]);
    if (!context) throw new NotFoundException('Channel handoff was not found');
    const trusted=await this.resolveTrustedChannel(context.tenant_id,context.home_country_code,context.code,clientId,credential);
    const resumeToken=this.issueToken();const resumeHash=this.hash(resumeToken);
    return this.dataSource.transaction(async manager=>{
      const [handoff]=await manager.query(
        `SELECT handoff.*,instance.customer_id,instance.journey_version_id,instance.status AS instance_status,
                node.node_key,node.node_type
         FROM onboarding.channel_handoffs handoff
         JOIN onboarding.journey_instances instance ON instance.id=handoff.instance_id
         JOIN onboarding.journey_nodes node ON node.id=handoff.source_node_id
         WHERE handoff.id=$1::uuid AND handoff.token_hash=$2::char(64) FOR UPDATE OF handoff`,
        [handoffId,this.hash(handoffToken)]);
      if (!handoff) throw new NotFoundException('Channel handoff was not found');
      if (handoff.status==='CONSUMED') throw new ConflictException('Channel handoff was already consumed');
      if (handoff.status!=='PENDING'||new Date(handoff.expires_at)<=new Date()) {
        if (handoff.status==='PENDING') await manager.query("UPDATE onboarding.channel_handoffs SET status='EXPIRED' WHERE id=$1::uuid",[handoffId]);
        throw new NotFoundException('Channel handoff has expired');
      }
      if (handoff.target_channel_version_id!==trusted.versionId) throw new ConflictException('Target channel version changed; create a new handoff');
      const [target]=await manager.query(
        `SELECT target.id,target.node_key,target.node_type,target.name,target.configuration
         FROM onboarding.journey_transitions transition
         JOIN onboarding.journey_nodes target ON target.id=transition.to_node_id
         WHERE transition.journey_version_id=$1::uuid AND transition.from_node_id=$2::uuid
           AND transition.outcome_code='SUCCESS' ORDER BY transition.priority,transition.id LIMIT 1`,
        [handoff.journey_version_id,handoff.source_node_id]);
      if (!target) throw new ConflictException('Channel handoff has no SUCCESS transition');
      const nextStatus=target.node_type==='END'?'COMPLETED':target.node_type==='MANUAL_REVIEW'?'MANUAL_REVIEW':'IN_PROGRESS';
      await manager.query(
        `UPDATE onboarding.channel_handoffs SET status='CONSUMED',consumed_at=CURRENT_TIMESTAMP WHERE id=$1::uuid`,[handoffId]);
      await manager.query(
        `UPDATE onboarding.channel_sessions SET status='REVOKED',revoked_at=CURRENT_TIMESTAMP
         WHERE instance_id=$1::uuid AND status='ACTIVE'`,[handoff.instance_id]);
      const expiresAt=new Date(Date.now()+Number(trusted.resumeTimeoutSeconds)*1000);
      await manager.query(
        `INSERT INTO onboarding.channel_sessions(instance_id,channel_version_id,token_hash,client_id,expires_at)
         VALUES($1::uuid,$2::uuid,$3::char(64),$4,$5)`,[handoff.instance_id,trusted.versionId,resumeHash,clientId||null,expiresAt]);
      await manager.query(
        `UPDATE onboarding.journey_instances SET current_channel_code=$2,
           current_channel_definition_id=$3::uuid,current_channel_version_id=$4::uuid,
           current_node_id=$5::uuid,status=$6::varchar,resume_token_hash=$7::char(64),expires_at=$8,
           completed_at=CASE WHEN $6::varchar='COMPLETED' THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP
         WHERE id=$1::uuid`,[handoff.instance_id,context.code,trusted.definitionId,trusted.versionId,target.id,nextStatus,resumeHash,expiresAt]);
      await manager.query(
        `INSERT INTO onboarding.step_executions(instance_id,node_id,attempt_number,status,idempotency_key,input_hash,output,completed_at)
         VALUES($1::uuid,$2::uuid,1,'SUCCEEDED',$3,$4::char(64),$5::jsonb,CURRENT_TIMESTAMP)
         ON CONFLICT(instance_id,idempotency_key) DO NOTHING`,
        [handoff.instance_id,handoff.source_node_id,`handoff:${handoffId}`,this.hash(handoffToken),JSON.stringify({targetChannel:context.code})]);
      await manager.query(
        `INSERT INTO onboarding.journey_events(instance_id,event_type,node_id,actor_type,correlation_id,payload)
         VALUES($1::uuid,'CHANNEL_HANDOFF_CONSUMED',$2::uuid,'CUSTOMER',$3,
           jsonb_build_object('handoffId',$4::text,'targetChannel',$5::text,'nextNodeKey',$6::text))`,
        [handoff.instance_id,handoff.source_node_id,correlationId||null,handoffId,context.code,target.node_key]);
      return {instanceId:handoff.instance_id,customerId:handoff.customer_id,status:nextStatus,
        currentChannel:context.code,currentNodeKey:target.node_key,currentNodeType:target.node_type,
        currentNodeName:target.name,currentNodeConfiguration:target.configuration,resumeToken,expiresAt};
    });
  }

  private validateConfiguration(countries:Array<{countryCode:string}>,capabilities:Array<{nodeType:string}>) {
    if (!countries.length) throw new BadRequestException('At least one country is required');
    if (!capabilities.length) throw new BadRequestException('At least one node capability is required');
    if (new Set(countries.map(item=>item.countryCode)).size!==countries.length) throw new BadRequestException('Channel countries must be unique');
    if (new Set(capabilities.map(item=>item.nodeType)).size!==capabilities.length) throw new BadRequestException('Channel node capabilities must be unique');
  }

  private async replaceChildren(manager:EntityManager,versionId:string,countries:any[],capabilities:any[]) {
    this.validateConfiguration(countries,capabilities);
    await manager.query('DELETE FROM onboarding.channel_country_scopes WHERE channel_version_id=$1::uuid',[versionId]);
    await manager.query('DELETE FROM onboarding.channel_node_capabilities WHERE channel_version_id=$1::uuid',[versionId]);
    for (const country of countries) await manager.query(
      `INSERT INTO onboarding.channel_country_scopes(channel_version_id,country_code,configuration)
       VALUES($1::uuid,upper($2),$3::jsonb)`,[versionId,country.countryCode,JSON.stringify(country.configuration||{})]);
    for (const capability of capabilities) await manager.query(
      `INSERT INTO onboarding.channel_node_capabilities(channel_version_id,node_type,execution_mode,component_key,configuration)
       VALUES($1::uuid,$2,$3,$4,$5::jsonb)`,[versionId,capability.nodeType,capability.executionMode,
        capability.componentKey||null,JSON.stringify(capability.configuration||{})]);
  }

  private async getVersionWithManager(manager:EntityManager,versionId:string) {
    const [version]=await manager.query(
      `SELECT version.id,version.channel_definition_id AS "channelDefinitionId",version.version_number AS "versionNumber",
              version.status,version.revision,version.authentication_mode AS "authenticationMode",
              version.session_timeout_seconds AS "sessionTimeoutSeconds",version.resume_timeout_seconds AS "resumeTimeoutSeconds",
              version.configuration,version.created_by AS "createdBy",version.modified_by AS "modifiedBy",
              version.approved_by AS "approvedBy",version.rejection_reason AS "rejectionReason",version.updated_at AS "updatedAt"
       FROM onboarding.channel_versions version WHERE version.id=$1::uuid`,[versionId]);
    if (!version) throw new NotFoundException('Channel version was not found');
    const countries=await manager.query(
      `SELECT country_code AS "countryCode",configuration FROM onboarding.channel_country_scopes
       WHERE channel_version_id=$1::uuid ORDER BY country_code`,[versionId]);
    const capabilities=await manager.query(
      `SELECT node_type AS "nodeType",execution_mode AS "executionMode",component_key AS "componentKey",configuration
       FROM onboarding.channel_node_capabilities WHERE channel_version_id=$1::uuid ORDER BY node_type`,[versionId]);
    return {...version,countries,capabilities};
  }

  private async audit(manager:EntityManager,definitionId:string,versionId:string|null,action:string,previous:unknown,next:unknown,actor:string) {
    await manager.query(
      `INSERT INTO onboarding.channel_audit_events(channel_definition_id,channel_version_id,action,previous_state,new_state,actor_id)
       VALUES($1::uuid,$2::uuid,$3,$4::jsonb,$5::jsonb,$6)`,
      [definitionId,versionId,action,previous?JSON.stringify(previous):null,JSON.stringify(next),actor]);
  }
  private hash(value:string){return createHash('sha256').update(value).digest('hex');}
  private handoffSignature(id:string){
    const key=String(process.env.ONBOARDING_HANDOFF_SIGNING_KEY||process.env.ONBOARDING_PII_ENCRYPTION_KEY||'');
    if (key.length<32) throw new Error('ONBOARDING_HANDOFF_SIGNING_KEY must contain at least 32 characters');
    return createHmac('sha256',key).update(id).digest('base64url');
  }
  private handoffToken(id:string){return `${id}.${this.handoffSignature(id)}`;}
  private safeTextMatch(left:string,right:string){const a=Buffer.from(left);const b=Buffer.from(right);return a.length===b.length&&timingSafeEqual(a,b);}
  private safeHashMatch(value:string,expected:string){
    const actual=Buffer.from(this.hash(value));const target=Buffer.from(String(expected||''));
    return actual.length===target.length&&timingSafeEqual(actual,target);
  }
  issueToken(){return randomBytes(32).toString('base64url');}
}
