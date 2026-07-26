import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CreateHttpIntegrationDto,
  CreateMasterRuleDto,
  CreateRuleDto,
  CreateScoreProviderDto,
  ListQueryDto,
  UpdateHttpIntegrationDto,
  UpdateMasterRuleDto,
  UpdateRuleDto,
  UpdateScoreProviderDto
} from './credit-rule.dto';
import { ConditionEngineService } from './condition-engine.service';
import { HttpSourceService } from './http-source.service';
import { SourceValidatorService } from './source-validator.service';

@Injectable()
export class CreditRuleManagementService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly conditions: ConditionEngineService,
    private readonly sources: SourceValidatorService,
    private readonly http: HttpSourceService
  ) {}

  async listIntegrations(query: ListQueryDto) {
    return this.paginate(
      `SELECT id::text,code,name,method,url_template AS "urlTemplate",auth_type AS "authType",
              auth_header AS "authHeader",auth_secret_env AS "authSecretEnv",
              timeout_ms AS "timeoutMs",cache_ttl_seconds AS "cacheTtlSeconds",
              is_active AS "isActive",created_by AS "createdBy",created_at AS "createdAt",
              approved_by AS "approvedBy",approved_at AS "approvedAt"
       FROM public.credit_http_integrations`,
      'code ILIKE $SEARCH OR name ILIKE $SEARCH',
      query
    );
  }

  async createIntegration(dto: CreateHttpIntegrationDto, actor: string) {
    this.http.validateUrlTemplate(dto.urlTemplate);
    const rows = await this.dataSource.query(
      `INSERT INTO public.credit_http_integrations(
         code,name,method,url_template,request_template,auth_type,auth_header,auth_secret_env,
         timeout_ms,cache_ttl_seconds,is_active,created_by
       ) VALUES(upper($1),$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,false,$11)
       RETURNING id::text,code,name,method,url_template AS "urlTemplate",is_active AS "isActive"`,
      [dto.code,dto.name,dto.method,dto.urlTemplate,JSON.stringify(dto.requestTemplate ?? null),
        dto.authType,dto.authHeader ?? null,dto.authSecretEnv ?? null,dto.timeoutMs,dto.cacheTtlSeconds,actor]
    );
    return rows[0];
  }

  async updateIntegration(id: string, dto: UpdateHttpIntegrationDto, actor: string) {
    const current = await this.integration(id);
    if (dto.urlTemplate) this.http.validateUrlTemplate(dto.urlTemplate);
    const next = {
      name: dto.name ?? current.name,
      method: dto.method ?? current.method,
      urlTemplate: dto.urlTemplate ?? current.url_template,
      requestTemplate: dto.requestTemplate ?? current.request_template,
      authType: dto.authType ?? current.auth_type,
      authHeader: dto.authHeader ?? current.auth_header,
      authSecretEnv: dto.authSecretEnv ?? current.auth_secret_env,
      timeoutMs: dto.timeoutMs ?? current.timeout_ms,
      cacheTtlSeconds: dto.cacheTtlSeconds ?? current.cache_ttl_seconds
    };
    const rows = await this.dataSource.query(
      `UPDATE public.credit_http_integrations
       SET name=$2,method=$3,url_template=$4,request_template=$5::jsonb,auth_type=$6,
           auth_header=$7,auth_secret_env=$8,timeout_ms=$9,cache_ttl_seconds=$10,
           is_active=false,approved_by=NULL,approved_at=NULL,updated_by=$11,updated_at=CURRENT_TIMESTAMP
       WHERE id=$1::bigint
       RETURNING id::text,code,name,method,url_template AS "urlTemplate",is_active AS "isActive"`,
      [id,next.name,next.method,next.urlTemplate,JSON.stringify(next.requestTemplate),
        next.authType,next.authHeader,next.authSecretEnv,next.timeoutMs,next.cacheTtlSeconds,actor]
    );
    return rows[0];
  }

  async approveIntegration(id: string, actor: string) {
    const current = await this.integration(id);
    if (current.created_by === actor) throw new ConflictException('The integration checker must differ from the maker');
    const rows = await this.dataSource.query(
      `UPDATE public.credit_http_integrations
       SET is_active=true,approved_by=$2,approved_at=CURRENT_TIMESTAMP,updated_by=$2,updated_at=CURRENT_TIMESTAMP
       WHERE id=$1::bigint
       RETURNING id::text,code,is_active AS "isActive",approved_by AS "approvedBy"`,
      [id,actor]
    );
    return rows[0];
  }

  async listScoreProviders() {
    return this.dataSource.query(
      `SELECT provider.id::text,provider.code,provider.name,provider.http_integration_id::text AS "httpIntegrationId",
              integration.code AS "integrationCode",provider.score_response_path AS "scoreResponsePath",
              provider.category_response_path AS "categoryResponsePath",
              provider.score_min::numeric AS "scoreMin",provider.score_max::numeric AS "scoreMax",
              provider.validity_minutes AS "validityMinutes",provider.is_default AS "isDefault",
              provider.is_active AS "isActive",provider.created_by AS "createdBy",
              provider.approved_by AS "approvedBy"
       FROM public.credit_score_providers provider
       JOIN public.credit_http_integrations integration ON integration.id=provider.http_integration_id
       ORDER BY provider.code`
    );
  }

  async createScoreProvider(dto: CreateScoreProviderDto, actor: string) {
    if (dto.scoreMin !== undefined && dto.scoreMax !== undefined && dto.scoreMax < dto.scoreMin) {
      throw new BadRequestException('scoreMax must be greater than or equal to scoreMin');
    }
    await this.integration(dto.httpIntegrationId);
    const rows = await this.dataSource.query(
      `INSERT INTO public.credit_score_providers(
        code,name,http_integration_id,score_response_path,category_response_path,
        model_id_response_path,model_version_response_path,reference_response_path,
        scored_at_response_path,score_min,score_max,validity_minutes,is_default,is_active,created_by
       ) VALUES(upper($1),$2,$3::bigint,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false,$14)
       RETURNING id::text,code,name,is_default AS "isDefault",is_active AS "isActive"`,
      [dto.code,dto.name,dto.httpIntegrationId,dto.scoreResponsePath,dto.categoryResponsePath,
        dto.modelIdResponsePath ?? null,dto.modelVersionResponsePath ?? null,dto.referenceResponsePath ?? null,
        dto.scoredAtResponsePath ?? null,dto.scoreMin ?? null,dto.scoreMax ?? null,
        dto.validityMinutes,dto.isDefault,actor]
    );
    return rows[0];
  }

  async updateScoreProvider(id: string, dto: UpdateScoreProviderDto, actor: string) {
    const rows = await this.dataSource.query<Array<Record<string, any>>>(
      `SELECT * FROM public.credit_score_providers WHERE id=$1::bigint`,
      [id]
    );
    if (!rows[0]) throw new NotFoundException('Score provider was not found');
    const current = rows[0];
    const next = {
      name: dto.name ?? current.name,
      httpIntegrationId: dto.httpIntegrationId ?? current.http_integration_id,
      scoreResponsePath: dto.scoreResponsePath ?? current.score_response_path,
      categoryResponsePath: dto.categoryResponsePath ?? current.category_response_path,
      modelIdResponsePath: dto.modelIdResponsePath ?? current.model_id_response_path,
      modelVersionResponsePath: dto.modelVersionResponsePath ?? current.model_version_response_path,
      referenceResponsePath: dto.referenceResponsePath ?? current.reference_response_path,
      scoredAtResponsePath: dto.scoredAtResponsePath ?? current.scored_at_response_path,
      scoreMin: dto.scoreMin ?? this.numberOrNull(current.score_min),
      scoreMax: dto.scoreMax ?? this.numberOrNull(current.score_max),
      validityMinutes: dto.validityMinutes ?? current.validity_minutes,
      isDefault: dto.isDefault ?? current.is_default
    };
    if (next.scoreMin !== null && next.scoreMax !== null && next.scoreMax < next.scoreMin) {
      throw new BadRequestException('scoreMax must be greater than or equal to scoreMin');
    }
    await this.integration(String(next.httpIntegrationId));
    const updated = await this.dataSource.query(
      `UPDATE public.credit_score_providers SET
         name=$2,http_integration_id=$3::bigint,score_response_path=$4,category_response_path=$5,
         model_id_response_path=$6,model_version_response_path=$7,reference_response_path=$8,
         scored_at_response_path=$9,score_min=$10,score_max=$11,validity_minutes=$12,
         is_default=$13,is_active=false,approved_by=NULL,approved_at=NULL,
         updated_by=$14,updated_at=CURRENT_TIMESTAMP
       WHERE id=$1::bigint
       RETURNING id::text,code,name,is_default AS "isDefault",is_active AS "isActive"`,
      [
        id,
        next.name,
        next.httpIntegrationId,
        next.scoreResponsePath,
        next.categoryResponsePath,
        next.modelIdResponsePath,
        next.modelVersionResponsePath,
        next.referenceResponsePath,
        next.scoredAtResponsePath,
        next.scoreMin,
        next.scoreMax,
        next.validityMinutes,
        next.isDefault,
        actor
      ]
    );
    return updated[0];
  }

  async approveScoreProvider(id: string, actor: string) {
    const rows = await this.dataSource.query<Array<Record<string,unknown>>>(
      `SELECT provider.id::text,provider.created_by,provider.is_default,
              integration.is_active AS integration_active
       FROM public.credit_score_providers provider
       JOIN public.credit_http_integrations integration ON integration.id=provider.http_integration_id
       WHERE provider.id=$1::bigint`,
      [id]
    );
    if (!rows[0]) throw new NotFoundException('Score provider was not found');
    if (rows[0].created_by === actor) throw new ConflictException('The score-provider checker must differ from the maker');
    if (!rows[0].integration_active) {
      throw new ConflictException('The score provider HTTP integration must be active');
    }
    return this.dataSource.transaction(async (manager) => {
      if (rows[0].is_default) {
        await manager.query(`UPDATE public.credit_score_providers SET is_default=false WHERE is_default AND id<>$1::bigint`,[id]);
      }
      const updated = await manager.query(
        `UPDATE public.credit_score_providers
         SET is_active=true,approved_by=$2,approved_at=CURRENT_TIMESTAMP
         WHERE id=$1::bigint
         RETURNING id::text,code,is_default AS "isDefault",is_active AS "isActive"`,
        [id,actor]
      );
      return updated[0];
    });
  }

  async listMasters(query: ListQueryDto) {
    const statusFilter = query.status ? 'status=$STATUS' : 'true';
    return this.paginate(
      `SELECT id::text,rule_code AS "ruleCode",version,name,customer_category AS "customerCategory",
              product_id AS "productId",currency,minimum_score::numeric AS "minimumScore",
              maximum_score::numeric AS "maximumScore",base_limit::numeric AS "baseLimit",
              minimum_limit::numeric AS "minimumLimit",maximum_limit::numeric AS "maximumLimit",
              default_outcome AS "defaultOutcome",auto_approval_enabled AS "autoApprovalEnabled",
              default_repayment_option_ids AS "defaultRepaymentOptionIds",status,
              effective_from AS "effectiveFrom",effective_to AS "effectiveTo",
              created_by AS "createdBy",created_at AS "createdAt",approved_by AS "approvedBy"
       FROM public.credit_master_rules`,
      `(rule_code ILIKE $SEARCH OR name ILIKE $SEARCH OR customer_category ILIKE $SEARCH)
       AND ${statusFilter}`,
      query
    );
  }

  async getMaster(id: string) {
    const masterRows = await this.dataSource.query(
      `SELECT id::text,rule_code AS "ruleCode",version,name,customer_category AS "customerCategory",
              product_id AS "productId",currency,minimum_score::numeric AS "minimumScore",
              maximum_score::numeric AS "maximumScore",base_limit::numeric AS "baseLimit",
              minimum_limit::numeric AS "minimumLimit",maximum_limit::numeric AS "maximumLimit",
              default_outcome AS "defaultOutcome",auto_approval_enabled AS "autoApprovalEnabled",
              default_repayment_option_ids AS "defaultRepaymentOptionIds",score_provider_id::text AS "scoreProviderId",
              status,effective_from AS "effectiveFrom",effective_to AS "effectiveTo",
              created_by AS "createdBy",created_at AS "createdAt",updated_by AS "updatedBy",
              approved_by AS "approvedBy",approved_at AS "approvedAt",rejection_reason AS "rejectionReason"
       FROM public.credit_master_rules WHERE id=$1::bigint`,
      [id]
    );
    if (!masterRows[0]) throw new NotFoundException('Master rule was not found');
    const rules = await this.listRules(id);
    return { ...masterRows[0], rules };
  }

  async createMaster(dto: CreateMasterRuleDto, actor: string) {
    this.validateMaster(dto);
    if (dto.scoreProviderId) await this.scoreProvider(dto.scoreProviderId);
    const rows = await this.dataSource.query(
      `WITH next_version AS (
         SELECT COALESCE(max(version),0)+1 AS version
         FROM public.credit_master_rules WHERE rule_code=upper($1)
       )
       INSERT INTO public.credit_master_rules(
         rule_code,version,name,customer_category,product_id,currency,minimum_score,maximum_score,
         base_limit,minimum_limit,maximum_limit,default_outcome,auto_approval_enabled,
         default_repayment_option_ids,score_provider_id,status,effective_from,effective_to,created_by
       )
       SELECT upper($1),version,$2,upper($3),$4,upper($5),$6,$7,$8,$9,$10,$11,$12,$13::jsonb,
              $14::bigint,'DRAFT',$15,$16,$17
       FROM next_version
       RETURNING id::text,rule_code AS "ruleCode",version,status`,
      [dto.ruleCode,dto.name,dto.customerCategory,dto.productId,dto.currency ?? null,
        dto.minimumScore ?? null,dto.maximumScore ?? null,dto.baseLimit,dto.minimumLimit,
        dto.maximumLimit,dto.defaultOutcome,dto.autoApprovalEnabled,
        JSON.stringify(dto.defaultRepaymentOptionIds),dto.scoreProviderId ?? null,
        dto.effectiveFrom ?? null,dto.effectiveTo ?? null,actor]
    );
    return this.getMaster(rows[0].id);
  }

  async updateMaster(id: string, dto: UpdateMasterRuleDto, actor: string) {
    const current = await this.editableMaster(id);
    const next = {
      name: dto.name ?? current.name,
      customerCategory: dto.customerCategory ?? current.customer_category,
      productId: dto.productId ?? current.product_id,
      currency: dto.currency ?? current.currency,
      minimumScore: dto.minimumScore ?? this.numberOrNull(current.minimum_score),
      maximumScore: dto.maximumScore ?? this.numberOrNull(current.maximum_score),
      baseLimit: dto.baseLimit ?? Number(current.base_limit),
      minimumLimit: dto.minimumLimit ?? Number(current.minimum_limit),
      maximumLimit: dto.maximumLimit ?? Number(current.maximum_limit),
      defaultOutcome: dto.defaultOutcome ?? current.default_outcome,
      autoApprovalEnabled: dto.autoApprovalEnabled ?? current.auto_approval_enabled,
      defaultRepaymentOptionIds: dto.defaultRepaymentOptionIds ?? current.default_repayment_option_ids,
      scoreProviderId: dto.scoreProviderId ?? current.score_provider_id,
      effectiveFrom: dto.effectiveFrom ?? current.effective_from,
      effectiveTo: dto.effectiveTo ?? current.effective_to
    };
    this.validateMaster(next);
    if (next.scoreProviderId) await this.scoreProvider(String(next.scoreProviderId));
    await this.dataSource.query(
      `UPDATE public.credit_master_rules SET
         name=$2,customer_category=upper($3),product_id=$4,currency=upper($5),
         minimum_score=$6,maximum_score=$7,base_limit=$8,minimum_limit=$9,maximum_limit=$10,
         default_outcome=$11,auto_approval_enabled=$12,default_repayment_option_ids=$13::jsonb,
         score_provider_id=$14::bigint,effective_from=$15,effective_to=$16,
         updated_by=$17,updated_at=CURRENT_TIMESTAMP,status='DRAFT',rejection_reason=NULL
       WHERE id=$1::bigint`,
      [id,next.name,next.customerCategory,next.productId,next.currency,next.minimumScore,next.maximumScore,
        next.baseLimit,next.minimumLimit,next.maximumLimit,next.defaultOutcome,next.autoApprovalEnabled,
        JSON.stringify(next.defaultRepaymentOptionIds),next.scoreProviderId,next.effectiveFrom,next.effectiveTo,actor]
    );
    return this.getMaster(id);
  }

  async cloneMaster(id: string, actor: string) {
    const current = await this.masterRow(id);
    return this.dataSource.transaction(async (manager) => {
      const inserted = await manager.query(
        `WITH next_version AS (
           SELECT COALESCE(max(version),0)+1 AS version
           FROM public.credit_master_rules WHERE rule_code=$2
         )
         INSERT INTO public.credit_master_rules(
           rule_code,version,name,customer_category,product_id,currency,minimum_score,maximum_score,
           base_limit,minimum_limit,maximum_limit,default_outcome,auto_approval_enabled,
           default_repayment_option_ids,score_provider_id,status,effective_from,effective_to,created_by
         )
         SELECT source.rule_code,next_version.version,source.name,source.customer_category,source.product_id,
                source.currency,source.minimum_score,source.maximum_score,source.base_limit,source.minimum_limit,
                source.maximum_limit,source.default_outcome,source.auto_approval_enabled,
                source.default_repayment_option_ids,source.score_provider_id,'DRAFT',
                source.effective_from,source.effective_to,$3
         FROM public.credit_master_rules source CROSS JOIN next_version
         WHERE source.id=$1::bigint
         RETURNING id::text`,
        [id,current.rule_code,actor]
      );
      const nextId = inserted[0].id;
      await manager.query(
        `INSERT INTO public.credit_rules(
          master_rule_id,name,description,priority,exclusive_group,source_type,ai_result_field,
          schema_name,table_name,lookup_column,value_column,read_mode,order_by_column,
          http_integration_id,response_path,data_type,condition_json,action_on_match,
          action_on_no_match,source_failure_action,stop_on_match,stop_on_no_match,is_active,created_by
         )
         SELECT $2::bigint,name,description,priority,exclusive_group,source_type,ai_result_field,
                schema_name,table_name,lookup_column,value_column,read_mode,order_by_column,
                http_integration_id,response_path,data_type,condition_json,action_on_match,
                action_on_no_match,source_failure_action,stop_on_match,stop_on_no_match,is_active,$3
         FROM public.credit_rules WHERE master_rule_id=$1::bigint`,
        [id,nextId,actor]
      );
      return nextId;
    }).then((nextId) => this.getMaster(nextId));
  }

  async listRules(masterId: string) {
    return this.dataSource.query(
      `SELECT id::text,master_rule_id::text AS "masterRuleId",name,description,priority,
              exclusive_group AS "exclusiveGroup",source_type AS "sourceType",
              ai_result_field AS "aiResultField",schema_name AS "schemaName",table_name AS "tableName",
              lookup_column AS "lookupColumn",value_column AS "valueColumn",read_mode AS "readMode",
              order_by_column AS "orderByColumn",http_integration_id::text AS "httpIntegrationId",
              response_path AS "responsePath",data_type AS "dataType",condition_json AS condition,
              action_on_match AS "actionOnMatch",action_on_no_match AS "actionOnNoMatch",
              source_failure_action AS "sourceFailureAction",stop_on_match AS "stopOnMatch",
              stop_on_no_match AS "stopOnNoMatch",is_active AS "isActive"
       FROM public.credit_rules WHERE master_rule_id=$1::bigint ORDER BY priority`,
      [masterId]
    );
  }

  async addRule(masterId: string, dto: CreateRuleDto, actor: string) {
    await this.editableMaster(masterId);
    await this.validateRule(dto);
    const rows = await this.dataSource.query(
      `INSERT INTO public.credit_rules(
        master_rule_id,name,description,priority,exclusive_group,source_type,ai_result_field,
        schema_name,table_name,lookup_column,value_column,read_mode,order_by_column,
        http_integration_id,response_path,data_type,condition_json,action_on_match,action_on_no_match,
        source_failure_action,stop_on_match,stop_on_no_match,is_active,created_by
       ) VALUES($1::bigint,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::bigint,$15,$16,
                $17::jsonb,$18::jsonb,$19::jsonb,$20::jsonb,$21,$22,true,$23)
       RETURNING id::text`,
      [masterId,dto.name,dto.description ?? null,dto.priority,dto.exclusiveGroup ?? null,dto.sourceType,
        dto.aiResultField ?? null,dto.schemaName ?? null,dto.tableName ?? null,dto.lookupColumn ?? null,
        dto.valueColumn ?? null,dto.readMode ?? null,dto.orderByColumn ?? null,dto.httpIntegrationId ?? null,
        dto.responsePath ?? null,dto.dataType,JSON.stringify(dto.condition),JSON.stringify(dto.actionOnMatch),
        JSON.stringify(dto.actionOnNoMatch),JSON.stringify(dto.sourceFailureAction),
        dto.stopOnMatch,dto.stopOnNoMatch,actor]
    );
    return (await this.listRules(masterId)).find((rule: any) => rule.id === rows[0].id);
  }

  async updateRule(masterId: string, ruleId: string, dto: UpdateRuleDto, actor: string) {
    await this.editableMaster(masterId);
    const rows = await this.dataSource.query<Array<Record<string,any>>>(
      `SELECT * FROM public.credit_rules WHERE id=$1::bigint AND master_rule_id=$2::bigint`,[ruleId,masterId]
    );
    if (!rows[0]) throw new NotFoundException('Credit rule was not found');
    const current = rows[0];
    const next: CreateRuleDto & { isActive: boolean } = {
      name: dto.name ?? current.name,
      description: dto.description ?? current.description,
      priority: dto.priority ?? current.priority,
      exclusiveGroup: dto.exclusiveGroup ?? current.exclusive_group,
      sourceType: (dto.sourceType as any) ?? current.source_type,
      aiResultField: dto.aiResultField ?? current.ai_result_field,
      schemaName: dto.schemaName ?? current.schema_name,
      tableName: dto.tableName ?? current.table_name,
      lookupColumn: dto.lookupColumn ?? current.lookup_column,
      valueColumn: dto.valueColumn ?? current.value_column,
      readMode: dto.readMode ?? current.read_mode,
      orderByColumn: dto.orderByColumn ?? current.order_by_column,
      httpIntegrationId: dto.httpIntegrationId ?? current.http_integration_id,
      responsePath: dto.responsePath ?? current.response_path,
      dataType: dto.dataType ?? current.data_type,
      condition: dto.condition ?? current.condition_json,
      actionOnMatch: dto.actionOnMatch ?? current.action_on_match,
      actionOnNoMatch: dto.actionOnNoMatch ?? current.action_on_no_match,
      sourceFailureAction: dto.sourceFailureAction ?? current.source_failure_action,
      stopOnMatch: dto.stopOnMatch ?? current.stop_on_match,
      stopOnNoMatch: dto.stopOnNoMatch ?? current.stop_on_no_match,
      isActive: dto.isActive ?? current.is_active
    };
    await this.validateRule(next);
    await this.dataSource.query(
      `UPDATE public.credit_rules SET
        name=$3,description=$4,priority=$5,exclusive_group=$6,source_type=$7,ai_result_field=$8,
        schema_name=$9,table_name=$10,lookup_column=$11,value_column=$12,read_mode=$13,
        order_by_column=$14,http_integration_id=$15::bigint,response_path=$16,data_type=$17,
        condition_json=$18::jsonb,action_on_match=$19::jsonb,action_on_no_match=$20::jsonb,
        source_failure_action=$21::jsonb,stop_on_match=$22,stop_on_no_match=$23,is_active=$24,
        updated_by=$25,updated_at=CURRENT_TIMESTAMP
       WHERE id=$1::bigint AND master_rule_id=$2::bigint`,
      [ruleId,masterId,next.name,next.description ?? null,next.priority,next.exclusiveGroup ?? null,
        next.sourceType,next.aiResultField ?? null,next.schemaName ?? null,next.tableName ?? null,
        next.lookupColumn ?? null,next.valueColumn ?? null,next.readMode ?? null,next.orderByColumn ?? null,
        next.httpIntegrationId ?? null,next.responsePath ?? null,next.dataType,JSON.stringify(next.condition),
        JSON.stringify(next.actionOnMatch),JSON.stringify(next.actionOnNoMatch),
        JSON.stringify(next.sourceFailureAction),next.stopOnMatch,next.stopOnNoMatch,next.isActive,actor]
    );
    return (await this.listRules(masterId)).find((rule: any) => rule.id === ruleId);
  }

  async deleteRule(masterId: string, ruleId: string) {
    await this.editableMaster(masterId);
    const result = await this.dataSource.query(
      `DELETE FROM public.credit_rules WHERE id=$1::bigint AND master_rule_id=$2::bigint RETURNING id`,
      [ruleId,masterId]
    );
    if (!result[0]) throw new NotFoundException('Credit rule was not found');
    return { success: true };
  }

  async submit(masterId: string, actor: string, comment?: string) {
    await this.editableMaster(masterId);
    const rules = await this.listRules(masterId);
    if (!rules.length) throw new ConflictException('A master rule must contain at least one child rule');
    await this.validateForPublication(masterId);
    return this.dataSource.transaction(async (manager) => {
      await manager.query(`UPDATE public.credit_master_rules SET status='PENDING_APPROVAL' WHERE id=$1::bigint`,[masterId]);
      const rows = await manager.query(
        `INSERT INTO public.credit_rule_change_requests(master_rule_id,action,status,maker_id,maker_comment)
         VALUES($1::bigint,'PUBLISH','PENDING',$2,$3)
         RETURNING id::text,status,action,maker_id AS "makerId"`,
        [masterId,actor,comment ?? null]
      );
      return rows[0];
    });
  }

  async approve(masterId: string, actor: string, comment?: string) {
    const current = await this.masterRow(masterId);
    if (current.status !== 'PENDING_APPROVAL') throw new ConflictException('Master rule is not pending approval');
    if (current.created_by === actor) throw new ConflictException('The checker must differ from the maker');
    await this.validateForPublication(masterId);
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE public.credit_rule_change_requests
         SET status='APPROVED',checker_id=$2,checker_comment=$3,decided_at=CURRENT_TIMESTAMP
         WHERE master_rule_id=$1::bigint AND action='PUBLISH' AND status='PENDING'`,
        [masterId,actor,comment ?? null]
      );
      await manager.query(
        `UPDATE public.credit_master_rules
         SET status='APPROVED',approved_by=$2,approved_at=CURRENT_TIMESTAMP
         WHERE id=$1::bigint`,
        [masterId,actor]
      );
      return { id: masterId, status: 'APPROVED' };
    });
  }

  async reject(masterId: string, actor: string, reason: string) {
    const current = await this.masterRow(masterId);
    if (current.status !== 'PENDING_APPROVAL') throw new ConflictException('Master rule is not pending approval');
    if (current.created_by === actor) throw new ConflictException('The checker must differ from the maker');
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE public.credit_rule_change_requests
         SET status='REJECTED',checker_id=$2,checker_comment=$3,decided_at=CURRENT_TIMESTAMP
         WHERE master_rule_id=$1::bigint AND action='PUBLISH' AND status='PENDING'`,
        [masterId,actor,reason]
      );
      await manager.query(
        `UPDATE public.credit_master_rules SET status='REJECTED',rejection_reason=$2 WHERE id=$1::bigint`,
        [masterId,reason]
      );
    });
    return { id: masterId, status: 'REJECTED' };
  }

  async activate(masterId: string, actor: string) {
    const current = await this.masterRow(masterId);
    if (current.status !== 'APPROVED') throw new ConflictException('Only an approved master rule can be activated');
    await this.validateForPublication(masterId);
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE public.credit_master_rules
         SET status='SUPERSEDED'
         WHERE status='ACTIVE' AND id<>$1::bigint
           AND product_id=$2 AND customer_category=$3
           AND COALESCE(currency,'')=COALESCE($4,'')
           AND COALESCE(maximum_score,999999999) >= COALESCE($5,-999999999)
           AND COALESCE(minimum_score,-999999999) <= COALESCE($6,999999999)`,
        [masterId,current.product_id,current.customer_category,current.currency,
          current.minimum_score,current.maximum_score]
      );
      await manager.query(
        `UPDATE public.credit_master_rules
         SET status='ACTIVE',activated_by=$2,activated_at=CURRENT_TIMESTAMP,
             effective_from=COALESCE(effective_from,CURRENT_TIMESTAMP)
         WHERE id=$1::bigint`,
        [masterId,actor]
      );
      return { id: masterId, status: 'ACTIVE' };
    });
  }

  async retire(masterId: string, actor: string) {
    const current = await this.masterRow(masterId);
    if (current.status !== 'ACTIVE') throw new ConflictException('Only an active master rule can be retired');
    await this.dataSource.query(
      `UPDATE public.credit_master_rules
       SET status='RETIRED',effective_to=CURRENT_TIMESTAMP,updated_by=$2,updated_at=CURRENT_TIMESTAMP
       WHERE id=$1::bigint`,
      [masterId,actor]
    );
    return { id: masterId, status: 'RETIRED' };
  }

  private async validateRule(dto: CreateRuleDto) {
    this.conditions.validate(dto.condition);
    this.conditions.validateAction(dto.actionOnMatch);
    this.conditions.validateAction(dto.actionOnNoMatch);
    this.conditions.validateAction(dto.sourceFailureAction);
    if ([
      'SET_LIMIT_FROM_VALUE',
      'SET_LIMIT_FROM_VALUE_MULTIPLIER',
      'CAP_LIMIT_FROM_VALUE_MULTIPLIER'
    ].includes(String(dto.sourceFailureAction.type))) {
      throw new BadRequestException('sourceFailureAction cannot depend on an unavailable source value');
    }
    if (dto.sourceType === 'AI_RESULT' && !dto.aiResultField) {
      throw new BadRequestException('AI_RESULT rules require aiResultField');
    }
    if (dto.sourceType === 'POSTGRES') await this.sources.validatePostgresSource(dto);
    if (dto.sourceType === 'HTTP_API') {
      if (!dto.httpIntegrationId || !dto.responsePath) {
        throw new BadRequestException('HTTP_API rules require httpIntegrationId and responsePath');
      }
      await this.integration(dto.httpIntegrationId);
    }
  }

  private async validateForPublication(masterId: string) {
    const master = await this.masterRow(masterId);
    if (master.score_provider_id) {
      const provider = await this.scoreProvider(String(master.score_provider_id));
      if (!provider.is_active) throw new ConflictException('The selected AI score provider is not active');
    }
    const rules = await this.dataSource.query<Array<Record<string,any>>>(
      `SELECT rule.*,integration.is_active AS integration_active
       FROM public.credit_rules rule
       LEFT JOIN public.credit_http_integrations integration ON integration.id=rule.http_integration_id
       WHERE rule.master_rule_id=$1::bigint AND rule.is_active ORDER BY rule.priority`,
      [masterId]
    );
    for (const rule of rules) {
      await this.validateRule({
        name: rule.name,priority: rule.priority,sourceType: rule.source_type,
        aiResultField: rule.ai_result_field,schemaName: rule.schema_name,tableName: rule.table_name,
        lookupColumn: rule.lookup_column,valueColumn: rule.value_column,readMode: rule.read_mode,
        orderByColumn: rule.order_by_column,httpIntegrationId: rule.http_integration_id,
        responsePath: rule.response_path,dataType: rule.data_type,condition: rule.condition_json,
        actionOnMatch: rule.action_on_match,actionOnNoMatch: rule.action_on_no_match,
        sourceFailureAction: rule.source_failure_action,stopOnMatch: rule.stop_on_match,
        stopOnNoMatch: rule.stop_on_no_match
      } as CreateRuleDto);
      if (rule.source_type === 'HTTP_API' && !rule.integration_active) {
        throw new ConflictException(`HTTP integration for rule ${rule.name} is not active`);
      }
    }
  }

  private validateMaster(input: {
    minimumScore?: number | null; maximumScore?: number | null;
    baseLimit: number; minimumLimit: number; maximumLimit: number;
  }) {
    if (input.minimumScore != null && input.maximumScore != null && input.maximumScore < input.minimumScore) {
      throw new BadRequestException('maximumScore must be greater than or equal to minimumScore');
    }
    if (input.maximumLimit < input.minimumLimit || input.baseLimit < 0 || input.maximumLimit <= 0) {
      throw new BadRequestException('Master-rule limits are invalid');
    }
  }

  private async editableMaster(id: string) {
    const row = await this.masterRow(id);
    if (!['DRAFT','REJECTED'].includes(row.status)) {
      throw new ConflictException('Only draft or rejected master-rule versions can be edited');
    }
    return row;
  }

  private async masterRow(id: string): Promise<Record<string,any>> {
    const rows = await this.dataSource.query(`SELECT * FROM public.credit_master_rules WHERE id=$1::bigint`,[id]);
    if (!rows[0]) throw new NotFoundException('Master rule was not found');
    return rows[0];
  }

  private async integration(id: string): Promise<Record<string,any>> {
    const rows = await this.dataSource.query(`SELECT * FROM public.credit_http_integrations WHERE id=$1::bigint`,[id]);
    if (!rows[0]) throw new NotFoundException('HTTP integration was not found');
    return rows[0];
  }

  private async scoreProvider(id: string): Promise<Record<string,any>> {
    const rows = await this.dataSource.query(
      `SELECT * FROM public.credit_score_providers WHERE id=$1::bigint`,
      [id]
    );
    if (!rows[0]) throw new NotFoundException('Score provider was not found');
    return rows[0];
  }

  private async paginate(base: string, filter: string, query: ListQueryDto) {
    const args: unknown[] = [];
    const searchIndex = args.push(`%${query.search ?? ''}%`);
    let compiled = filter.replaceAll('$SEARCH',`$${searchIndex}`);
    if (filter.includes('$STATUS')) {
      const statusIndex = args.push(query.status);
      compiled = compiled.replaceAll('$STATUS',`$${statusIndex}`);
    }
    const offset = (query.page - 1) * query.limit;
    const count = await this.dataSource.query(`SELECT count(*)::int AS count FROM (${base}) source WHERE ${compiled}`,args);
    const limitIndex = args.push(query.limit);
    const offsetIndex = args.push(offset);
    const data = await this.dataSource.query(
      `${base} WHERE ${compiled} ORDER BY 1 DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,args
    );
    return { data,totalRecords: count[0].count,page: query.page,limit: query.limit };
  }

  private numberOrNull(value: unknown): number | null {
    return value === null || value === undefined ? null : Number(value);
  }
}
