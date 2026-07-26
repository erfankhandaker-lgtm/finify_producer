import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { EvaluateCreditDto, ListQueryDto } from './credit-rule.dto';
import { ConditionEngineService } from './condition-engine.service';
import { HttpSourceService } from './http-source.service';
import {
  AiResult,
  CreditRuleRow,
  DecisionOutcome,
  EvaluationContext,
  HttpIntegrationRow,
  MasterRuleRow,
  RuleAction,
  ScoreProviderRow
} from './credit-rule.types';

interface ScoreResult {
  result: AiResult;
  snapshotId: string | null;
}

interface SourceResult {
  value: unknown;
  reference: string;
}

@Injectable()
export class CreditRuleEvaluatorService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly conditions: ConditionEngineService,
    private readonly http: HttpSourceService
  ) {}

  async evaluate(dto: EvaluateCreditDto) {
    if (dto.masterRuleId && !dto.simulation) {
      throw new BadRequestException('masterRuleId may only be supplied for a simulation');
    }

    const executionId = randomUUID();
    const startedAt = Date.now();
    await this.dataSource.query(
      `INSERT INTO public.credit_rule_executions(
         id,customer_id,application_id,product_id,currency,requested_amount,
         existing_exposure,pending_reservations,outcome,simulation
       ) VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,'PROCESSING',$9)`,
      [
        executionId,
        dto.customerId,
        dto.applicationId ?? null,
        dto.productId,
        dto.currency ?? null,
        dto.requestedAmount,
        dto.existingExposure,
        dto.pendingReservations,
        dto.simulation
      ]
    );

    let score: ScoreResult;
    try {
      score = await this.resolveScore(dto, new Map());
    } catch (error) {
      await this.finishFailure(executionId, 'RESCORE_REQUIRED', 'AI_SCORE_UNAVAILABLE', startedAt);
      return this.getExecution(executionId);
    }

    const master = await this.findMaster(dto, score.result);
    if (!master) {
      await this.dataSource.query(
        `UPDATE public.credit_rule_executions SET
           ai_score_snapshot_id=$2::bigint,ai_score=$3,customer_category=$4,
           outcome='NO_MASTER_RULE',reason_codes='["NO_APPLICABLE_MASTER_RULE"]'::jsonb,
           completed_at=CURRENT_TIMESTAMP,duration_ms=$5
         WHERE id=$1::uuid`,
        [executionId, score.snapshotId, score.result.score, score.result.category, Date.now() - startedAt]
      );
      return this.getExecution(executionId);
    }

    await this.dataSource.query(
      `UPDATE public.credit_rule_executions SET
         master_rule_id=$2::bigint,master_rule_code=$3,master_rule_version=$4,
         ai_score_snapshot_id=$5::bigint,ai_score=$6,customer_category=$7
       WHERE id=$1::uuid`,
      [
        executionId,
        master.id,
        master.rule_code,
        master.version,
        score.snapshotId,
        score.result.score,
        score.result.category
      ]
    );

    const context: EvaluationContext = {
      executionId,
      customerId: dto.customerId,
      applicationId: dto.applicationId,
      productId: dto.productId,
      currency: dto.currency,
      requestedAmount: dto.requestedAmount,
      existingExposure: dto.existingExposure,
      pendingReservations: dto.pendingReservations,
      aiResult: score.result,
      simulation: dto.simulation,
      currentLimit: Number(master.base_limit),
      outcome: 'PROCESSING',
      reasonCodes: [],
      repaymentOptionIds: [...(master.default_repayment_option_ids ?? [])],
      matchedExclusiveGroups: new Set()
    };

    const rules = await this.dataSource.query<CreditRuleRow[]>(
      `SELECT id::text,master_rule_id::text,name,description,priority,exclusive_group,
              source_type,ai_result_field,schema_name,table_name,lookup_column,value_column,
              read_mode,order_by_column,http_integration_id::text,response_path,data_type,
              condition_json,action_on_match,action_on_no_match,source_failure_action,
              stop_on_match,stop_on_no_match,is_active
       FROM public.credit_rules
       WHERE master_rule_id=$1::bigint AND is_active
       ORDER BY priority,id`,
      [master.id]
    );
    const httpCache = new Map<string, unknown>();

    for (const rule of rules) {
      if (rule.exclusive_group && context.matchedExclusiveGroups.has(rule.exclusive_group)) continue;
      const stepStarted = Date.now();
      const before = context.currentLimit;
      let source: SourceResult | undefined;
      let conditionResult: boolean | null = null;
      let action: RuleAction = rule.source_failure_action;
      let errorMessage: string | null = null;

      try {
        source = await this.readSource(rule, context, httpCache);
        conditionResult = this.conditions.evaluate(rule.condition_json, source.value, rule.data_type);
        action = conditionResult ? rule.action_on_match : rule.action_on_no_match;
        if (conditionResult && rule.exclusive_group) {
          context.matchedExclusiveGroups.add(rule.exclusive_group);
        }
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      this.applyAction(action, source?.value, context);
      await this.recordStep(
        rule,
        context,
        before,
        source,
        conditionResult,
        action,
        errorMessage,
        Date.now() - stepStarted
      );

      const shouldStop =
        context.outcome === 'REJECTED'
        || context.outcome === 'MANUAL_REVIEW'
        || (conditionResult === true && rule.stop_on_match)
        || (conditionResult === false && rule.stop_on_no_match);
      if (shouldStop) break;
    }

    const maximum = Number(master.maximum_limit);
    const minimum = Number(master.minimum_limit);
    const allocated = Math.max(0, Math.min(maximum, this.money(context.currentLimit)));
    const available = Math.max(
      0,
      this.money(allocated - context.existingExposure - context.pendingReservations)
    );

    if (context.outcome === 'PROCESSING') {
      if (!master.auto_approval_enabled) {
        context.outcome = 'MANUAL_REVIEW';
        context.reasonCodes.push('AUTO_APPROVAL_DISABLED');
      } else if (allocated < minimum || available <= 0) {
        context.outcome = master.default_outcome;
        context.reasonCodes.push(allocated < minimum ? 'LIMIT_BELOW_MINIMUM' : 'NO_AVAILABLE_LIMIT');
      } else {
        context.outcome = available >= dto.requestedAmount ? 'AUTO_APPROVED' : 'COUNTER_OFFER';
      }
    }

    await this.dataSource.query(
      `UPDATE public.credit_rule_executions SET
         allocated_limit=$2,available_limit=$3,eligible_repayment_option_ids=$4::jsonb,
         outcome=$5,reason_codes=$6::jsonb,completed_at=CURRENT_TIMESTAMP,duration_ms=$7
       WHERE id=$1::uuid`,
      [
        executionId,
        allocated,
        available,
        JSON.stringify([...new Set(context.repaymentOptionIds)]),
        context.outcome,
        JSON.stringify([...new Set(context.reasonCodes)]),
        Date.now() - startedAt
      ]
    );
    return this.getExecution(executionId);
  }

  async getExecution(id: string) {
    const rows = await this.dataSource.query(
      `SELECT id::text,customer_id AS "customerId",application_id AS "applicationId",
              product_id AS "productId",currency,master_rule_id::text AS "masterRuleId",
              master_rule_code AS "masterRuleCode",master_rule_version AS "masterRuleVersion",
              ai_score_snapshot_id::text AS "aiScoreSnapshotId",ai_score::numeric AS "aiScore",
              customer_category AS "customerCategory",requested_amount::numeric AS "requestedAmount",
              existing_exposure::numeric AS "existingExposure",
              pending_reservations::numeric AS "pendingReservations",
              allocated_limit::numeric AS "allocatedLimit",available_limit::numeric AS "availableLimit",
              eligible_repayment_option_ids AS "eligibleRepaymentOptionIds",outcome,
              reason_codes AS "reasonCodes",simulation,started_at AS "startedAt",
              completed_at AS "completedAt",duration_ms AS "durationMs"
       FROM public.credit_rule_executions WHERE id=$1::uuid`,
      [id]
    );
    if (!rows[0]) throw new NotFoundException('Credit-rule execution was not found');
    const steps = await this.dataSource.query(
      `SELECT step.id::text,step.rule_id::text AS "ruleId",rule.name AS "ruleName",
              step.priority,step.source_type AS "sourceType",
              step.source_reference AS "sourceReference",step.source_value AS "sourceValue",
              step.condition_result AS "conditionResult",step.applied_action AS "appliedAction",
              step.limit_before::numeric AS "limitBefore",step.limit_after::numeric AS "limitAfter",
              step.outcome_after AS "outcomeAfter",step.reason_code AS "reasonCode",
              step.error_message AS "errorMessage",step.duration_ms AS "durationMs",
              step.created_at AS "createdAt"
       FROM public.credit_rule_execution_steps step
       JOIN public.credit_rules rule ON rule.id=step.rule_id
       WHERE step.execution_id=$1::uuid ORDER BY step.priority,step.id`,
      [id]
    );
    return { ...rows[0], steps };
  }

  async listExecutions(query: ListQueryDto) {
    const offset = (query.page - 1) * query.limit;
    const search = `%${query.search ?? ''}%`;
    const filters = query.status ? 'AND outcome=$4' : '';
    const params = query.status
      ? [search, query.limit, offset, query.status]
      : [search, query.limit, offset];
    const countParams = query.status ? [search, query.status] : [search];
    const countFilter = query.status ? 'AND outcome=$2' : '';
    const [items, countRows] = await Promise.all([
      this.dataSource.query(
        `SELECT id::text,customer_id AS "customerId",application_id AS "applicationId",
                product_id AS "productId",customer_category AS "customerCategory",
                ai_score::numeric AS "aiScore",allocated_limit::numeric AS "allocatedLimit",
                available_limit::numeric AS "availableLimit",outcome,simulation,
                started_at AS "startedAt",completed_at AS "completedAt"
         FROM public.credit_rule_executions
         WHERE (customer_id ILIKE $1 OR COALESCE(application_id,'') ILIKE $1) ${filters}
         ORDER BY started_at DESC LIMIT $2 OFFSET $3`,
        params
      ),
      this.dataSource.query(
        `SELECT count(*)::integer AS total FROM public.credit_rule_executions
         WHERE (customer_id ILIKE $1 OR COALESCE(application_id,'') ILIKE $1) ${countFilter}`,
        countParams
      )
    ]);
    return {
      items,
      page: query.page,
      limit: query.limit,
      total: Number(countRows[0]?.total ?? 0)
    };
  }

  private async resolveScore(dto: EvaluateCreditDto, cache: Map<string, unknown>): Promise<ScoreResult> {
    const provider = await this.findScoreProvider(dto.scoreProviderCode);
    if (dto.aiResult) {
      const result: AiResult = { ...dto.aiResult, category: dto.aiResult.category.toUpperCase() };
      this.validateScore(result, provider);
      return {
        result,
        snapshotId: provider ? await this.saveSnapshot(dto.customerId, provider, result) : null
      };
    }
    if (!provider) throw new Error('No active score provider is configured');
    if (!dto.forceRescore) {
      const cached = await this.dataSource.query(
        `SELECT id::text,score::numeric,customer_category,model_id,model_version,
                external_reference,scored_at,expires_at
         FROM public.credit_ai_score_snapshots
         WHERE customer_id=$1 AND provider_id=$2::bigint AND expires_at>CURRENT_TIMESTAMP
         ORDER BY scored_at DESC LIMIT 1`,
        [dto.customerId, provider.id]
      );
      if (cached[0]) {
        return {
          snapshotId: cached[0].id,
          result: {
            score: Number(cached[0].score),
            category: cached[0].customer_category,
            modelId: cached[0].model_id ?? undefined,
            modelVersion: cached[0].model_version ?? undefined,
            referenceId: cached[0].external_reference ?? undefined,
            scoredAt: cached[0].scored_at,
            expiresAt: cached[0].expires_at
          }
        };
      }
    }

    const integration = await this.getIntegration(provider.http_integration_id);
    const payload = await this.http.call(integration, this.httpContext(dto), cache);
    const scoredAtValue = provider.scored_at_response_path
      ? this.http.readPath(payload, provider.scored_at_response_path)
      : undefined;
    const scoredAt = scoredAtValue ? new Date(String(scoredAtValue)) : new Date();
    if (!Number.isFinite(scoredAt.getTime())) throw new Error('Score provider returned an invalid scored-at date');
    const result: AiResult = {
      score: Number(this.http.readPath(payload, provider.score_response_path)),
      category: String(this.http.readPath(payload, provider.category_response_path) ?? '').toUpperCase(),
      modelId: this.optionalPath(payload, provider.model_id_response_path),
      modelVersion: this.optionalPath(payload, provider.model_version_response_path),
      referenceId: this.optionalPath(payload, provider.reference_response_path),
      scoredAt: scoredAt.toISOString(),
      expiresAt: new Date(scoredAt.getTime() + provider.validity_minutes * 60_000).toISOString()
    };
    this.validateScore(result, provider);
    return { result, snapshotId: await this.saveSnapshot(dto.customerId, provider, result) };
  }

  private async findScoreProvider(code?: string): Promise<ScoreProviderRow | null> {
    const rows = await this.dataSource.query<ScoreProviderRow[]>(
      `SELECT id::text,code,name,http_integration_id::text,score_response_path,
              category_response_path,model_id_response_path,model_version_response_path,
              reference_response_path,scored_at_response_path,score_min::text,score_max::text,
              validity_minutes,is_default,is_active
       FROM public.credit_score_providers
       WHERE is_active AND ($1::text IS NULL OR code=upper($1))
       ORDER BY CASE WHEN code=upper($1) THEN 0 WHEN is_default THEN 1 ELSE 2 END,id
       LIMIT 1`,
      [code ?? null]
    );
    return rows[0] ?? null;
  }

  private validateScore(result: AiResult, provider: ScoreProviderRow | null): void {
    if (!Number.isFinite(result.score)) throw new Error('AI score is not numeric');
    if (!result.category) throw new Error('AI customer category is empty');
    if (provider?.score_min !== null && provider && result.score < Number(provider.score_min)) {
      throw new Error('AI score is below the provider range');
    }
    if (provider?.score_max !== null && provider && result.score > Number(provider.score_max)) {
      throw new Error('AI score is above the provider range');
    }
  }

  private async saveSnapshot(customerId: string, provider: ScoreProviderRow, result: AiResult): Promise<string> {
    const scoredAt = result.scoredAt ? new Date(result.scoredAt) : new Date();
    const expiresAt = result.expiresAt
      ? new Date(result.expiresAt)
      : new Date(scoredAt.getTime() + provider.validity_minutes * 60_000);
    if (!Number.isFinite(scoredAt.getTime()) || !Number.isFinite(expiresAt.getTime()) || expiresAt <= scoredAt) {
      throw new Error('AI score dates are invalid');
    }
    const rows = await this.dataSource.query(
      `INSERT INTO public.credit_ai_score_snapshots(
         customer_id,provider_id,score,customer_category,model_id,model_version,
         external_reference,scored_at,expires_at
       ) VALUES($1,$2::bigint,$3,upper($4),$5,$6,$7,$8,$9)
       ON CONFLICT(provider_id,external_reference)
         WHERE external_reference IS NOT NULL
       DO UPDATE SET customer_id=EXCLUDED.customer_id
       RETURNING id::text`,
      [
        customerId,
        provider.id,
        result.score,
        result.category,
        result.modelId ?? null,
        result.modelVersion ?? null,
        result.referenceId ?? null,
        scoredAt.toISOString(),
        expiresAt.toISOString()
      ]
    );
    return rows[0].id;
  }

  private async findMaster(dto: EvaluateCreditDto, ai: AiResult): Promise<MasterRuleRow | null> {
    const params: unknown[] = [dto.productId, ai.category, ai.score, dto.currency ?? null];
    let scope =
      `status='ACTIVE'
       AND product_id=$1
       AND customer_category=upper($2)
       AND (minimum_score IS NULL OR minimum_score<=$3)
       AND (maximum_score IS NULL OR maximum_score>=$3)
       AND (currency IS NULL OR currency=upper($4))
       AND (effective_from IS NULL OR effective_from<=CURRENT_TIMESTAMP)
       AND (effective_to IS NULL OR effective_to>=CURRENT_TIMESTAMP)`;
    if (dto.simulation && dto.masterRuleId) {
      params.push(dto.masterRuleId);
      scope =
        `id=$5::bigint AND status IN ('DRAFT','PENDING_APPROVAL','APPROVED','ACTIVE')
         AND product_id=$1 AND customer_category=upper($2)
         AND (minimum_score IS NULL OR minimum_score<=$3)
         AND (maximum_score IS NULL OR maximum_score>=$3)
         AND (currency IS NULL OR currency=upper($4))`;
    }
    const rows = await this.dataSource.query<MasterRuleRow[]>(
      `SELECT id::text,rule_code,version,name,customer_category,product_id,currency,
              minimum_score::text,maximum_score::text,base_limit::text,minimum_limit::text,
              maximum_limit::text,default_outcome,auto_approval_enabled,
              default_repayment_option_ids,score_provider_id::text,status,
              effective_from,effective_to,created_by
       FROM public.credit_master_rules WHERE ${scope}
       ORDER BY version DESC,id DESC LIMIT 1`,
      params
    );
    return rows[0] ?? null;
  }

  private async readSource(
    rule: CreditRuleRow,
    context: EvaluationContext,
    httpCache: Map<string, unknown>
  ): Promise<SourceResult> {
    if (rule.source_type === 'AI_RESULT') {
      const value = this.http.readPath(context.aiResult, rule.ai_result_field ?? '');
      return { value, reference: `aiResult.${rule.ai_result_field}` };
    }
    if (rule.source_type === 'HTTP_API') {
      const integration = await this.getIntegration(rule.http_integration_id ?? '');
      const payload = await this.http.call(integration, this.httpContext(context), httpCache);
      return {
        value: this.http.readPath(payload, rule.response_path ?? ''),
        reference: `http:${integration.code}:${rule.response_path}`
      };
    }
    return this.readPostgres(rule, context.customerId);
  }

  private async readPostgres(rule: CreditRuleRow, customerId: string): Promise<SourceResult> {
    const schema = this.identifier(rule.schema_name);
    const table = this.identifier(rule.table_name);
    const lookup = this.identifier(rule.lookup_column);
    const value = this.identifier(rule.value_column);
    const from = `"${schema}"."${table}"`;
    let sql: string;
    switch (rule.read_mode) {
      case 'LATEST':
        sql = `SELECT "${value}" AS value FROM ${from} WHERE "${lookup}"=$1
               ORDER BY "${this.identifier(rule.order_by_column)}" DESC LIMIT 1`;
        break;
      case 'SUM':
        sql = `SELECT sum("${value}") AS value FROM ${from} WHERE "${lookup}"=$1`;
        break;
      case 'AVERAGE':
        sql = `SELECT avg("${value}") AS value FROM ${from} WHERE "${lookup}"=$1`;
        break;
      case 'COUNT':
        sql = `SELECT count("${value}") AS value FROM ${from} WHERE "${lookup}"=$1`;
        break;
      case 'MINIMUM':
        sql = `SELECT min("${value}") AS value FROM ${from} WHERE "${lookup}"=$1`;
        break;
      case 'MAXIMUM':
        sql = `SELECT max("${value}") AS value FROM ${from} WHERE "${lookup}"=$1`;
        break;
      case 'EXISTS':
        sql = `SELECT EXISTS(SELECT 1 FROM ${from} WHERE "${lookup}"=$1) AS value`;
        break;
      default:
        sql = `SELECT "${value}" AS value FROM ${from} WHERE "${lookup}"=$1 LIMIT 2`;
    }
    const rows = await this.dataSource.query(sql, [customerId]);
    if (rule.read_mode === 'SINGLE' && rows.length > 1) {
      throw new Error('SINGLE source returned more than one row');
    }
    return {
      value: rows[0]?.value ?? null,
      reference: `postgres:${schema}.${table}.${value}`
    };
  }

  private applyAction(action: RuleAction, sourceValue: unknown, context: EvaluationContext): void {
    const numericSource = Number(sourceValue);
    switch (action.type) {
      case 'REJECT':
        context.outcome = 'REJECTED';
        break;
      case 'MANUAL_REVIEW':
        context.outcome = 'MANUAL_REVIEW';
        break;
      case 'SET_LIMIT_FIXED':
        context.currentLimit = Number(action.value);
        break;
      case 'SET_LIMIT_FROM_VALUE':
        this.requireNumericSource(numericSource, action.type);
        context.currentLimit = numericSource;
        break;
      case 'SET_LIMIT_FROM_VALUE_MULTIPLIER':
        this.requireNumericSource(numericSource, action.type);
        context.currentLimit = numericSource * Number(action.multiplier);
        break;
      case 'ADD_LIMIT_FIXED':
        context.currentLimit += Number(action.value);
        break;
      case 'SUBTRACT_LIMIT_FIXED':
        context.currentLimit = Math.max(0, context.currentLimit - Number(action.value));
        break;
      case 'CAP_LIMIT_FIXED':
        context.currentLimit = Math.min(context.currentLimit, Number(action.value));
        break;
      case 'CAP_LIMIT_FROM_VALUE_MULTIPLIER':
        this.requireNumericSource(numericSource, action.type);
        context.currentLimit = Math.min(context.currentLimit, numericSource * Number(action.multiplier));
        break;
      case 'SET_CREDIT_OFFER':
        context.currentLimit = Number(action.limit);
        break;
      default:
        break;
    }
    if (action.repaymentOptionIds) context.repaymentOptionIds = [...action.repaymentOptionIds];
    if (action.reasonCode) context.reasonCodes.push(action.reasonCode);
  }

  private async recordStep(
    rule: CreditRuleRow,
    context: EvaluationContext,
    before: number,
    source: SourceResult | undefined,
    conditionResult: boolean | null,
    action: RuleAction,
    errorMessage: string | null,
    duration: number
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO public.credit_rule_execution_steps(
         execution_id,rule_id,priority,source_type,source_reference,source_value,
         condition_result,applied_action,limit_before,limit_after,outcome_after,
         reason_code,error_message,duration_ms
       ) VALUES($1::uuid,$2::bigint,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9,$10,$11,$12,$13,$14)`,
      [
        context.executionId,
        rule.id,
        rule.priority,
        rule.source_type,
        source?.reference ?? null,
        source ? JSON.stringify(source.value ?? null) : null,
        conditionResult,
        JSON.stringify(action),
        this.money(before),
        this.money(context.currentLimit),
        context.outcome === 'PROCESSING' ? null : context.outcome,
        action.reasonCode ?? null,
        errorMessage,
        duration
      ]
    );
  }

  private async getIntegration(id: string): Promise<HttpIntegrationRow> {
    const rows = await this.dataSource.query<HttpIntegrationRow[]>(
      `SELECT id::text,code,name,method,url_template,request_template,auth_type,auth_header,
              auth_secret_env,timeout_ms,cache_ttl_seconds,is_active
       FROM public.credit_http_integrations WHERE id=$1::bigint AND is_active`,
      [id]
    );
    if (!rows[0]) throw new Error('HTTP integration is missing or inactive');
    return rows[0];
  }

  private httpContext(input: EvaluateCreditDto | EvaluationContext): Record<string, unknown> {
    return {
      customerId: input.customerId,
      applicationId: input.applicationId ?? '',
      productId: input.productId,
      currency: input.currency ?? '',
      requestedAmount: input.requestedAmount,
      existingExposure: input.existingExposure,
      pendingReservations: input.pendingReservations
    };
  }

  private optionalPath(payload: unknown, path: string | null): string | undefined {
    if (!path) return undefined;
    const value = this.http.readPath(payload, path);
    return value === null || value === undefined ? undefined : String(value);
  }

  private identifier(value: string | null): string {
    if (!value || !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(value)) {
      throw new Error(`Unsafe database identifier ${String(value)}`);
    }
    return value;
  }

  private requireNumericSource(value: number, action: string): void {
    if (!Number.isFinite(value)) throw new Error(`${action} requires a numeric source value`);
  }

  private money(value: number): number {
    return Math.round(Math.max(0, Number.isFinite(value) ? value : 0) * 100) / 100;
  }

  private async finishFailure(
    executionId: string,
    outcome: DecisionOutcome,
    reason: string,
    startedAt: number
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE public.credit_rule_executions SET outcome=$2,reason_codes=$3::jsonb,
              completed_at=CURRENT_TIMESTAMP,duration_ms=$4 WHERE id=$1::uuid`,
      [executionId, outcome, JSON.stringify([reason]), Date.now() - startedAt]
    );
  }
}
