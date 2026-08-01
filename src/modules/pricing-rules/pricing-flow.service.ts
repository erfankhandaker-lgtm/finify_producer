import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { DataSource, EntityManager } from 'typeorm';
import {
  PricingAmountRule,
  PricingCalculation,
  PricingChargeRange,
  PricingCommissionRange,
  PricingFlowDefinition,
  PricingFlowRecord,
  PricingSimulation,
} from './pricing-flow.types';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

@Injectable()
export class PricingFlowService {
  constructor(private readonly dataSource: DataSource) {}

  async list(query: { status?: string; keyword?: string; limit?: string }) {
    const values: unknown[] = [];
    const conditions = ['1=1'];
    const add = (clause: string, value: unknown) => {
      values.push(value);
      conditions.push(clause.replace('?', `$${values.length}`));
    };
    if (query.status?.trim()) add('status=?', query.status.trim().toUpperCase());
    if (query.keyword?.trim()) {
      values.push(query.keyword.trim());
      conditions.push(
        `(keyword=upper($${values.length}) OR definition->'trigger'->'keywords' ? upper($${values.length}))`,
      );
    }
    const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 200);
    const rows = await this.dataSource.query(
      `${this.selectSql()}
       WHERE ${conditions.join(' AND ')}
       ORDER BY updated_at DESC,id DESC
       LIMIT $${values.length + 1}`,
      [...values, limit],
    );
    return rows.map((row: PricingFlowRecord) => this.normalizeRow(row));
  }

  async get(id: string): Promise<PricingFlowRecord> {
    this.assertId(id);
    const [row] = await this.dataSource.query(
      `${this.selectSql()} WHERE id=$1::bigint`,
      [id],
    );
    if (!row) throw new NotFoundException('Pricing flow was not found');
    return this.normalizeRow(row);
  }

  async create(body: Record<string, unknown>, actor: string) {
    const definition = this.validateDefinition(body.definition);
    const ruleCode = this.ruleCode(body.ruleCode);
    const name = this.requiredText(body.name, 'Pricing flow name', 160);
    const priority = this.integer(body.priority, 'Priority', 1, 10000, 100);
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [ruleCode]);
      const [versionRow] = await manager.query(
        'SELECT COALESCE(max(version),0)+1 AS version FROM public.pricing_rule_flows WHERE rule_code=$1',
        [ruleCode],
      );
      const [created] = await manager.query(
        `INSERT INTO public.pricing_rule_flows(
           rule_code,version,name,keyword,source_wallet_type,destination_wallet_type,
           currency,priority,status,definition,created_by
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT',$9::jsonb,$10)
         RETURNING id::text`,
        [
          ruleCode,
          Number(versionRow.version),
          name,
          definition.trigger.keyword,
          definition.route.sourceWalletType,
          definition.route.destinationWalletType || null,
          definition.trigger.currency,
          priority,
          JSON.stringify(definition),
          actor,
        ],
      );
      const row = await this.getWithManager(manager, created.id);
      await this.audit(manager, created.id, 'CREATE', null, row, actor);
      return row;
    });
  }

  async update(id: string, body: Record<string, unknown>, actor: string) {
    this.assertId(id);
    return this.dataSource.transaction(async (manager) => {
      const current = await this.getForUpdate(manager, id);
      if (!['DRAFT', 'REJECTED'].includes(current.status)) {
        throw new ConflictException('Only draft or rejected pricing flows can be edited');
      }
      const definition = this.validateDefinition(body.definition ?? current.definition);
      const name = body.name === undefined
        ? current.name
        : this.requiredText(body.name, 'Pricing flow name', 160);
      const priority = body.priority === undefined
        ? current.priority
        : this.integer(body.priority, 'Priority', 1, 10000, current.priority);
      await manager.query(
        `UPDATE public.pricing_rule_flows SET
           name=$2,keyword=$3,source_wallet_type=$4,destination_wallet_type=$5,
           currency=$6,priority=$7,definition=$8::jsonb,status='DRAFT',
           modified_by=$9,updated_at=CURRENT_TIMESTAMP,approved_by=NULL,
           approved_at=NULL,activated_at=NULL
         WHERE id=$1::bigint`,
        [
          id,
          name,
          definition.trigger.keyword,
          definition.route.sourceWalletType,
          definition.route.destinationWalletType || null,
          definition.trigger.currency,
          priority,
          JSON.stringify(definition),
          actor,
        ],
      );
      const next = await this.getWithManager(manager, id);
      await this.audit(manager, id, 'UPDATE', current, next, actor);
      return next;
    });
  }

  async transition(
    id: string,
    action: 'submit' | 'approve' | 'activate' | 'retire' | 'reject',
    actor: string,
    reason?: string,
    bypassMakerChecker = false,
  ) {
    this.assertId(id);
    const transitions = {
      submit: { from: ['DRAFT', 'REJECTED'], to: 'SUBMITTED' },
      approve: { from: ['SUBMITTED'], to: 'APPROVED' },
      activate: { from: ['APPROVED'], to: 'ACTIVE' },
      retire: { from: ['ACTIVE', 'APPROVED'], to: 'RETIRED' },
      reject: { from: ['SUBMITTED'], to: 'REJECTED' },
    } as const;
    const transition = transitions[action];
    return this.dataSource.transaction(async (manager) => {
      const current = await this.getForUpdate(manager, id);
      if (!(transition.from as readonly string[]).includes(current.status)) {
        throw new ConflictException(
          `Cannot ${action} a pricing flow in ${current.status} status`,
        );
      }
      if (action === 'approve' &&
          !bypassMakerChecker &&
          actor.trim().toLowerCase() === String(current.modifiedBy || current.createdBy).trim().toLowerCase()) {
        throw new ForbiddenException('Maker and checker must be different administrators');
      }
      if (action === 'reject' && !reason?.trim()) {
        throw new BadRequestException('A rejection reason is required');
      }
      if (action === 'activate') {
        const activeRows = await manager.query(
          `${this.selectSql()}
           WHERE status='ACTIVE' AND currency=$1 AND id<>$2::bigint`,
          [current.currency, id],
        );
        const currentKeywords = new Set(current.definition.trigger.keywords);
        const currentSources = new Set(
          current.definition.route.sourceWalletTypes,
        );
        const conflictingIds = activeRows
          .map((row: PricingFlowRecord) => this.normalizeRow(row))
          .filter(
            (row: PricingFlowRecord) =>
              row.definition.trigger.keywords.some((keyword) =>
                currentKeywords.has(keyword),
              ) &&
              row.definition.route.sourceWalletTypes.some((walletType) =>
                currentSources.has(walletType),
              ),
          )
          .map((row: PricingFlowRecord) => row.id);
        if (conflictingIds.length) {
          await manager.query(
            `UPDATE public.pricing_rule_flows
             SET status='RETIRED',updated_at=CURRENT_TIMESTAMP
             WHERE id = ANY($1::bigint[])`,
            [conflictingIds],
          );
        }
      }
      const approval = action === 'approve'
        ? ',approved_by=$3,approved_at=CURRENT_TIMESTAMP'
        : '';
      const activation = action === 'activate' ? ',activated_at=CURRENT_TIMESTAMP' : '';
      await manager.query(
        `UPDATE public.pricing_rule_flows
         SET status=$2,updated_at=CURRENT_TIMESTAMP${approval}${activation}
         WHERE id=$1::bigint`,
        action === 'approve' ? [id, transition.to, actor] : [id, transition.to],
      );
      const next = await this.getWithManager(manager, id);
      await this.audit(manager, id, action.toUpperCase(), current, { ...next, reason }, actor);
      return next;
    });
  }

  async findActive(
    keyword: string,
    sourceWalletType: number,
    currency?: string,
    destinationWalletType?: number,
  ) {
    const [row] = await this.dataSource.query(
      `${this.selectSql()}
       WHERE status='ACTIVE'
         AND (
           keyword=upper($1)
           OR definition->'trigger'->'keywords' ? upper($1)
         )
         AND (
           source_wallet_type=$2
           OR definition->'route'->'sourceWalletTypes' @>
              to_jsonb(ARRAY[$2]::integer[])
         )
         AND currency=upper($3)
         AND (
           $4::integer IS NULL
           OR COALESCE(
                jsonb_array_length(definition->'route'->'destinationWalletTypes'),
                0
              )=0
           OR destination_wallet_type=$4
           OR definition->'route'->'destinationWalletTypes' @>
              to_jsonb(ARRAY[$4]::integer[])
         )
       ORDER BY priority ASC,id DESC LIMIT 1`,
      [keyword, sourceWalletType, currency || 'UGX', destinationWalletType || null],
    );
    return row ? this.normalizeRow(row) : undefined;
  }

  simulate(
    definitionInput: unknown,
    amountInput: unknown,
    sourceWalletTypeInput?: unknown,
    destinationWalletTypeInput?: unknown,
  ): PricingSimulation {
    const definition = this.validateDefinition(definitionInput);
    const amount = this.decimal(amountInput, 'Transaction amount');
    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Transaction amount must be greater than zero');
    }
    const routeProvided =
      sourceWalletTypeInput !== undefined ||
      destinationWalletTypeInput !== undefined;
    if (
      routeProvided &&
      (sourceWalletTypeInput === undefined ||
        destinationWalletTypeInput === undefined)
    ) {
      throw new BadRequestException(
        'Source and destination wallet types are both required for route simulation',
      );
    }
    const sourceWalletType = routeProvided
      ? this.integer(
          sourceWalletTypeInput,
          'Source wallet type',
          1,
          2147483647,
        )
      : undefined;
    const destinationWalletType = routeProvided
      ? this.integer(
          destinationWalletTypeInput,
          'Destination wallet type',
          1,
          2147483647,
        )
      : undefined;
    const sourceRouteMatched =
      sourceWalletType === undefined ||
      definition.route.sourceWalletTypes.includes(sourceWalletType);
    const destinationRouteMatched =
      destinationWalletType === undefined ||
      definition.route.destinationWalletTypes.length === 0 ||
      definition.route.destinationWalletTypes.includes(destinationWalletType);
    const routeMatched = sourceRouteMatched && destinationRouteMatched;
    const matchedRangeIndex = !definition.charge.enabled || definition.charge.mode === 'FIXED'
      ? -1
      : definition.charge.ranges.findIndex((range) => {
          const lower = new Decimal(range.minimumAmount);
          const upper = range.maximumAmount === undefined
            ? null
            : new Decimal(range.maximumAmount);
          return amount.greaterThanOrEqualTo(lower) &&
            (!upper || amount.lessThanOrEqualTo(upper));
        });
    const matchedRange = matchedRangeIndex >= 0
      ? definition.charge.ranges[matchedRangeIndex]
      : undefined;
    const chargeMatched = routeMatched && definition.charge.enabled &&
      (definition.charge.mode === 'FIXED' || Boolean(matchedRange));
    const chargeCalculationId = definition.charge.mode === 'FIXED'
      ? definition.charge.defaultCalculationId
      : matchedRange?.chargeCalculationId || definition.charge.defaultCalculationId;
    const appliedChargeRule = definition.charge.calculations.find(
      (calculation) => calculation.id === chargeCalculationId,
    )!;
    const charge = chargeMatched
      ? this.calculateAmount(appliedChargeRule, amount)
      : new Decimal(0);
    const matchedCommissionRangeIndex =
      !definition.commission.enabled || definition.commission.mode === 'FIXED'
        ? -1
        : definition.commission.ranges.findIndex((range) => {
            const lower = new Decimal(range.minimumAmount);
            const upper =
              range.maximumAmount === undefined
                ? null
                : new Decimal(range.maximumAmount);
            return (
              amount.greaterThanOrEqualTo(lower) &&
              (!upper || amount.lessThanOrEqualTo(upper))
            );
          });
    const matchedCommissionRange =
      matchedCommissionRangeIndex >= 0
        ? definition.commission.ranges[matchedCommissionRangeIndex]
        : undefined;
    const commissionMatched = routeMatched && definition.commission.enabled &&
      (definition.commission.mode === 'FIXED' || Boolean(matchedCommissionRange));
    const commissionCalculationId = definition.commission.mode === 'FIXED'
      ? definition.commission.defaultCalculationId
      : matchedCommissionRange?.commissionCalculationId;
    const appliedCommissionRule = commissionCalculationId
      ? definition.commission.calculations.find(
          (calculation) => calculation.id === commissionCalculationId,
        )
      : undefined;
    const commission = commissionMatched && appliedCommissionRule
      ? this.calculateAmount(appliedCommissionRule, amount)
      : new Decimal(0);
    const sourceDebit = !routeMatched
      ? new Decimal(0)
      : definition.charge.payer === 'S'
        ? amount.plus(charge)
        : amount;
    const destinationCredit = !routeMatched
      ? new Decimal(0)
      : definition.charge.payer === 'D'
        ? amount.minus(charge)
        : amount;
    return {
      matched: routeMatched && (chargeMatched || commissionMatched),
      routeMatched,
      sourceWalletType,
      destinationWalletType,
      transactionAmount: this.money(amount),
      chargeAmount: this.money(charge),
      commissionAmount: this.money(commission),
      sourceDebitAmount: this.money(sourceDebit),
      destinationCreditAmount: this.money(destinationCredit),
      chargePayer: definition.charge.payer,
      commissionReceiver: definition.commission.receiver,
      chargeCalculationType: appliedChargeRule.type,
      chargeCalculationValue: appliedChargeRule.value,
      chargeCalculationId,
      commissionCalculationType: appliedCommissionRule?.type,
      commissionCalculationValue: appliedCommissionRule?.value,
      commissionCalculationId,
      matchedChargeRange: matchedRange ? {
        id: matchedRange.id,
        index: matchedRangeIndex,
        minimumAmount: matchedRange.minimumAmount,
        maximumAmount: matchedRange.maximumAmount,
        chargeCalculationId: matchedRange.chargeCalculationId,
      } : undefined,
      matchedCommissionRange: matchedCommissionRange ? {
        id: matchedCommissionRange.id,
        index: matchedCommissionRangeIndex,
        minimumAmount: matchedCommissionRange.minimumAmount,
        maximumAmount: matchedCommissionRange.maximumAmount,
        commissionCalculationId: matchedCommissionRange.commissionCalculationId,
      } : undefined,
      currency: definition.trigger.currency,
      trace: [
        { node: 'TRIGGER', status: 'PASSED', detail: `${definition.trigger.keywords.join(', ')} / ${definition.trigger.currency}` },
        {
          node: 'WALLET_ROUTE',
          status: routeMatched ? 'PASSED' : 'FAILED',
          detail: routeProvided
            ? `Selected route ${sourceWalletType} → ${destinationWalletType} ${
                routeMatched ? 'matches' : 'does not match'
              } this rule`
            : `${definition.route.sourceWalletTypes.join(', ')} → ${
                definition.route.destinationWalletTypes.join(', ') || 'ANY'
              }`,
        },
        {
          node: 'CHARGE_CONDITION',
          status: !definition.charge.enabled
            ? 'SKIPPED'
            : definition.charge.mode === 'FIXED'
              ? 'SKIPPED'
              : chargeMatched ? 'PASSED' : 'FAILED',
          detail: !definition.charge.enabled
            ? 'Charge disabled'
            : definition.charge.mode === 'FIXED'
            ? 'Fixed charge bypasses transaction amount ranges'
            : matchedRange
              ? `${this.money(amount)} matched charge range ${matchedRangeIndex + 1}`
              : `${this.money(amount)} did not match a charge range`,
        },
        {
          node: 'CHARGE',
          status: chargeMatched ? 'PASSED' : 'SKIPPED',
          detail: !definition.charge.enabled
            ? 'Charge disabled'
            : `${this.money(charge)} ${definition.charge.mode.toLowerCase()} charge applied to ${definition.charge.payer}`,
        },
        {
          node: 'COMMISSION_CONDITION',
          status: !definition.commission.enabled
            ? 'SKIPPED'
            : definition.commission.mode === 'FIXED'
              ? 'SKIPPED'
              : commissionMatched ? 'PASSED' : 'FAILED',
          detail: !definition.commission.enabled
            ? 'Commission disabled'
            : definition.commission.mode === 'FIXED'
              ? 'Fixed commission bypasses its amount ranges'
              : matchedCommissionRange
                ? `${this.money(amount)} matched commission range ${matchedCommissionRangeIndex + 1}`
                : `${this.money(amount)} did not match a commission range`,
        },
        {
          node: 'COMMISSION',
          status: commissionMatched && appliedCommissionRule ? 'PASSED' : 'SKIPPED',
          detail: !definition.commission.enabled
            ? 'Commission disabled'
            : appliedCommissionRule
              ? `${this.money(commission)} ${definition.commission.mode.toLowerCase()} commission (${appliedCommissionRule.name}) credited to ${definition.commission.receiver}`
              : 'No commission calculation is connected to the matched range',
        },
        {
          node: 'SETTLEMENT',
          status: chargeMatched || commissionMatched ? 'PASSED' : 'SKIPPED',
          detail: `Charge wallet ${definition.settlement.chargeWalletType} / commission wallet ${definition.settlement.commissionWalletType}`,
        },
      ],
    };
  }

  validateDefinition(input: unknown): PricingFlowDefinition {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('Pricing flow definition must be an object');
    }
    const raw = input as Record<string, any>;
    const keywords = this.textArray(
      raw.trigger?.keywords,
      raw.trigger?.keyword,
      'Keyword',
      100,
    );
    const keyword = keywords[0];
    const currency = this.requiredText(raw.trigger?.currency || 'UGX', 'Currency', 8).toUpperCase();
    const sourceWalletTypes = this.integerArray(
      raw.route?.sourceWalletTypes,
      raw.route?.sourceWalletType,
      'Source wallet type',
      false,
    );
    const sourceWalletType = sourceWalletTypes[0];
    const destinationWalletTypes = this.integerArray(
      raw.route?.destinationWalletTypes,
      raw.route?.destinationWalletType,
      'Destination wallet type',
      true,
    );
    const destinationWalletType = destinationWalletTypes[0];
    const minimumAmount = this.number(raw.condition?.minimumAmount ?? 0, 'Minimum amount', 0);
    const maximumAmount = raw.condition?.maximumAmount === undefined || raw.condition?.maximumAmount === null
      ? undefined
      : this.number(raw.condition.maximumAmount, 'Maximum amount', minimumAmount);
    const charge = this.chargeRule(raw.charge, { minimumAmount, maximumAmount });
    const commission = this.commissionRule(
      raw.commission,
      Array.isArray(raw.charge?.ranges) ? raw.charge.ranges : [],
      { minimumAmount, maximumAmount },
    );
    if (!charge.enabled && !commission.enabled) {
      throw new BadRequestException(
        'At least one of charge or commission must be enabled',
      );
    }
    return {
      trigger: { keyword, keywords, currency },
      route: {
        sourceWalletType,
        sourceWalletTypes,
        destinationWalletType,
        destinationWalletTypes,
      },
      condition: { minimumAmount, maximumAmount },
      charge,
      commission,
      settlement: {
        chargeWalletType: this.integer(raw.settlement?.chargeWalletType ?? 113, 'Charge settlement wallet', 1, 2147483647),
        commissionWalletType: this.integer(raw.settlement?.commissionWalletType ?? 114, 'Commission settlement wallet', 1, 2147483647),
      },
    };
  }

  private amountRule(raw: Record<string, unknown> | undefined, label: string): PricingAmountRule {
    const type = String(raw?.type || '').toUpperCase();
    if (!['FIXED', 'PERCENTAGE'].includes(type)) {
      throw new BadRequestException(`${label} calculation type must be FIXED or PERCENTAGE`);
    }
    const value = this.number(raw?.value, `${label} value`, 0);
    if (type === 'PERCENTAGE' && value > 100) {
      throw new BadRequestException(`${label} percentage cannot exceed 100`);
    }
    const minimum = raw?.minimum === undefined ? undefined : this.number(raw.minimum, `${label} minimum`, 0);
    const maximum = raw?.maximum === undefined ? undefined : this.number(raw.maximum, `${label} maximum`, minimum ?? 0);
    return { type: type as PricingAmountRule['type'], value, minimum, maximum };
  }

  private chargeRule(
    raw: Record<string, any> | undefined,
    legacyRange: { minimumAmount: number; maximumAmount?: number },
  ): PricingFlowDefinition['charge'] {
    const mode = String(raw?.mode || 'FLEXIBLE').toUpperCase();
    if (mode !== 'FIXED' && mode !== 'FLEXIBLE') {
      throw new BadRequestException('Charge mode must be FIXED or FLEXIBLE');
    }
    const base = this.amountRule(raw, 'Charge');
    const payer = this.party(raw?.payer, 'Charge payer');
    const inputRanges = Array.isArray(raw?.ranges) && raw.ranges.length
      ? raw.ranges
      : [{ ...legacyRange, ...base }];
    const calculations = Array.isArray(raw?.calculations) && raw.calculations.length
      ? raw.calculations.map((calculation: Record<string, unknown>, index: number) =>
          this.calculationRule(calculation, `Charge calculation ${index + 1}`, `charge-calculation-${index + 1}`))
      : mode === 'FLEXIBLE'
        ? inputRanges.map((range: Record<string, unknown>, index: number) =>
            this.calculationRule(range, `Charge calculation ${index + 1}`, `charge-calculation-${index + 1}`))
        : [{ id: 'charge-default', name: 'Default charge', ...base }];
    this.assertUniqueCalculationIds(calculations, 'Charge');
    const calculationIds = new Set(calculations.map((calculation) => calculation.id));
    const defaultCalculationId = String(
      raw?.defaultCalculationId || calculations[0].id,
    ).trim();
    if (!calculationIds.has(defaultCalculationId)) {
      throw new BadRequestException('Default charge calculation does not exist');
    }
    const ranges = mode === 'FLEXIBLE'
      ? inputRanges.map((range: Record<string, unknown>, index: number) =>
          this.chargeRange(
            range,
            index,
            calculations[Math.min(index, calculations.length - 1)].id,
          ))
      : [];
    const sorted = [...ranges].sort((left, right) => left.minimumAmount - right.minimumAmount);
    if (new Set(sorted.map((range) => range.id)).size !== sorted.length) {
      throw new BadRequestException('Amount range IDs must be unique');
    }
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      if (previous.maximumAmount === undefined ||
          sorted[index].minimumAmount <= previous.maximumAmount) {
        throw new BadRequestException('Flexible charge ranges cannot overlap');
      }
    }
    ranges.forEach((range, index) => {
      if (!calculationIds.has(range.chargeCalculationId)) {
        throw new BadRequestException(
          `Amount range ${index + 1} references an unknown charge calculation`,
        );
      }
    });
    return {
      ...base,
      enabled: raw?.enabled !== false,
      mode,
      payer,
      calculations,
      defaultCalculationId,
      ranges: sorted,
    };
  }

  private chargeRange(
    raw: Record<string, unknown>,
    index: number,
    fallbackCalculationId: string,
  ): PricingChargeRange {
    const label = `Charge range ${index + 1}`;
    const minimumAmount = this.number(raw.minimumAmount, `${label} minimum amount`, 0);
    const maximumAmount = raw.maximumAmount === undefined || raw.maximumAmount === null
      ? undefined
      : this.number(raw.maximumAmount, `${label} maximum amount`, minimumAmount);
    return {
      id: String(raw.id || `amount-range-${index + 1}`).trim(),
      minimumAmount,
      maximumAmount,
      chargeCalculationId: String(
        raw.chargeCalculationId || fallbackCalculationId,
      ).trim(),
    };
  }

  private commissionRule(
    raw: Record<string, any> | undefined,
    legacyChargeRanges: Array<Record<string, unknown>>,
    legacyRange: { minimumAmount: number; maximumAmount?: number },
  ): PricingFlowDefinition['commission'] {
    const base = this.amountRule(raw, 'Commission');
    const requestedMode = String(raw?.mode || 'FIXED').toUpperCase();
    const mode = requestedMode === 'DIRECT'
      ? 'FIXED'
      : requestedMode === 'RANGE_LINKED'
        ? 'FLEXIBLE'
        : requestedMode;
    if (mode !== 'FIXED' && mode !== 'FLEXIBLE') {
      throw new BadRequestException('Commission mode must be FIXED or FLEXIBLE');
    }
    const calculations = Array.isArray(raw?.calculations) && raw.calculations.length
      ? raw.calculations.map((calculation: Record<string, unknown>, index: number) =>
          this.calculationRule(calculation, `Commission calculation ${index + 1}`, `commission-calculation-${index + 1}`))
      : [{ id: 'commission-default', name: 'Default commission', ...base }];
    this.assertUniqueCalculationIds(calculations, 'Commission');
    const defaultCalculationId = String(
      raw?.defaultCalculationId || calculations[0].id,
    ).trim();
    if (!calculations.some((calculation) => calculation.id === defaultCalculationId)) {
      throw new BadRequestException('Default commission calculation does not exist');
    }
    const migratedRanges = legacyChargeRanges
      .filter((range) => range.commissionCalculationId)
      .map((range, index) => ({
        id: `commission-range-${index + 1}`,
        minimumAmount: range.minimumAmount,
        maximumAmount: range.maximumAmount,
        commissionCalculationId: range.commissionCalculationId,
      }));
    const inputRanges = Array.isArray(raw?.ranges) && raw.ranges.length
      ? raw.ranges
      : migratedRanges.length
        ? migratedRanges
        : [{ ...legacyRange, commissionCalculationId: defaultCalculationId }];
    const ranges = mode === 'FLEXIBLE'
      ? inputRanges.map((range: Record<string, unknown>, index: number) =>
          this.commissionRange(range, index, defaultCalculationId))
      : [];
    const sorted = [...ranges].sort(
      (left, right) => left.minimumAmount - right.minimumAmount,
    );
    if (new Set(sorted.map((range) => range.id)).size !== sorted.length) {
      throw new BadRequestException('Commission range IDs must be unique');
    }
    const calculationIds = new Set(
      calculations.map((calculation) => calculation.id),
    );
    sorted.forEach((range, index) => {
      if (!calculationIds.has(range.commissionCalculationId)) {
        throw new BadRequestException(
          `Commission range ${index + 1} references an unknown calculation`,
        );
      }
      if (index > 0) {
        const previous = sorted[index - 1];
        if (
          previous.maximumAmount === undefined ||
          range.minimumAmount <= previous.maximumAmount
        ) {
          throw new BadRequestException('Flexible commission ranges cannot overlap');
        }
      }
    });
    return {
      ...base,
      enabled: raw?.enabled !== false,
      mode,
      receiver: this.party(raw?.receiver, 'Commission receiver'),
      calculations,
      defaultCalculationId,
      ranges: sorted,
    };
  }

  private commissionRange(
    raw: Record<string, unknown>,
    index: number,
    fallbackCalculationId: string,
  ): PricingCommissionRange {
    const label = `Commission range ${index + 1}`;
    const minimumAmount = this.number(
      raw.minimumAmount,
      `${label} minimum amount`,
      0,
    );
    const maximumAmount =
      raw.maximumAmount === undefined || raw.maximumAmount === null
        ? undefined
        : this.number(
            raw.maximumAmount,
            `${label} maximum amount`,
            minimumAmount,
          );
    return {
      id: String(raw.id || `commission-range-${index + 1}`).trim(),
      minimumAmount,
      maximumAmount,
      commissionCalculationId: String(
        raw.commissionCalculationId || fallbackCalculationId,
      ).trim(),
    };
  }

  private calculationRule(
    raw: Record<string, unknown>,
    label: string,
    fallbackId: string,
  ): PricingCalculation {
    const id = String(raw.id || fallbackId).trim();
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(id)) {
      throw new BadRequestException(`${label} ID is invalid`);
    }
    const name = String(raw.name || label).trim();
    if (!name || name.length > 100) {
      throw new BadRequestException(`${label} name is invalid`);
    }
    return { id, name, ...this.amountRule(raw, label) };
  }

  private assertUniqueCalculationIds(
    calculations: PricingCalculation[],
    label: string,
  ) {
    if (new Set(calculations.map((calculation) => calculation.id)).size !== calculations.length) {
      throw new BadRequestException(`${label} calculation IDs must be unique`);
    }
  }

  private calculateAmount(rule: PricingAmountRule, amount: Decimal) {
    let result = rule.type === 'FIXED'
      ? new Decimal(rule.value)
      : amount.times(rule.value).dividedBy(100);
    if (rule.minimum !== undefined) result = Decimal.max(result, rule.minimum);
    if (rule.maximum !== undefined) result = Decimal.min(result, rule.maximum);
    return result.toDecimalPlaces(2);
  }

  private selectSql() {
    return `SELECT id::text,rule_code AS "ruleCode",version,name,keyword,
                   source_wallet_type AS "sourceWalletType",
                   destination_wallet_type AS "destinationWalletType",
                   currency,priority,status,definition,
                   created_by AS "createdBy",modified_by AS "modifiedBy",
                   approved_by AS "approvedBy",created_at AS "createdAt",
                   updated_at AS "updatedAt",approved_at AS "approvedAt",
                   activated_at AS "activatedAt"
            FROM public.pricing_rule_flows`;
  }

  private async getForUpdate(manager: EntityManager, id: string) {
    const [row] = await manager.query(
      `${this.selectSql()} WHERE id=$1::bigint FOR UPDATE`,
      [id],
    );
    if (!row) throw new NotFoundException('Pricing flow was not found');
    return this.normalizeRow(row);
  }

  private async getWithManager(manager: EntityManager, id: string) {
    const [row] = await manager.query(`${this.selectSql()} WHERE id=$1::bigint`, [id]);
    if (!row) throw new NotFoundException('Pricing flow was not found');
    return this.normalizeRow(row);
  }

  private async audit(
    manager: EntityManager,
    id: string,
    action: string,
    previous: unknown,
    next: unknown,
    actor: string,
  ) {
    await manager.query(
      `INSERT INTO public.pricing_rule_flow_audit(
         pricing_rule_flow_id,action,previous_state,new_state,actor_id
       ) VALUES($1::bigint,$2,$3::jsonb,$4::jsonb,$5)`,
      [id, action, previous ? JSON.stringify(previous) : null, JSON.stringify(next), actor],
    );
  }

  private normalizeRow(row: PricingFlowRecord): PricingFlowRecord {
    return { ...row, definition: this.validateDefinition(row.definition) };
  }

  private ruleCode(value: unknown) {
    const code = this.requiredText(value, 'Rule code', 64).toUpperCase();
    if (!/^[A-Z][A-Z0-9_]*$/.test(code)) {
      throw new BadRequestException('Rule code must contain uppercase letters, numbers, and underscores');
    }
    return code;
  }

  private requiredText(value: unknown, label: string, max: number) {
    const text = String(value || '').trim();
    if (!text) throw new BadRequestException(`${label} is required`);
    if (text.length > max) throw new BadRequestException(`${label} is too long`);
    return text;
  }

  private textArray(
    values: unknown,
    legacyValue: unknown,
    label: string,
    max: number,
  ) {
    const input = Array.isArray(values) ? values : [legacyValue];
    const normalized = [
      ...new Set(
        input
          .map((value) => String(value || '').trim().toUpperCase())
          .filter(Boolean),
      ),
    ];
    if (!normalized.length) {
      throw new BadRequestException(
        `At least one ${label.toLowerCase()} is required`,
      );
    }
    if (normalized.some((value) => value.length > max)) {
      throw new BadRequestException(`${label} is too long`);
    }
    return normalized;
  }

  private integerArray(
    values: unknown,
    legacyValue: unknown,
    label: string,
    allowEmpty: boolean,
  ) {
    const input = Array.isArray(values)
      ? values
      : legacyValue === undefined || legacyValue === null
        ? []
        : [legacyValue];
    const normalized = [
      ...new Set(
        input.map((value) =>
          this.integer(value, label, 1, 2147483647),
        ),
      ),
    ];
    if (!allowEmpty && !normalized.length) {
      throw new BadRequestException(
        `At least one ${label.toLowerCase()} is required`,
      );
    }
    return normalized;
  }

  private party(value: unknown, label: string) {
    const party = String(value || '').trim().toUpperCase();
    if (party !== 'S' && party !== 'D') {
      throw new BadRequestException(`${label} must be S or D`);
    }
    return party;
  }

  private integer(value: unknown, label: string, minimum: number, maximum: number, fallback?: number) {
    const numeric = value === undefined && fallback !== undefined ? fallback : Number(value);
    if (!Number.isInteger(numeric) || numeric < minimum || numeric > maximum) {
      throw new BadRequestException(`${label} must be an integer between ${minimum} and ${maximum}`);
    }
    return numeric;
  }

  private number(value: unknown, label: string, minimum: number) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < minimum) {
      throw new BadRequestException(`${label} must be a number greater than or equal to ${minimum}`);
    }
    return numeric;
  }

  private decimal(value: unknown, label: string) {
    try {
      return new Decimal(String(value));
    } catch {
      throw new BadRequestException(`${label} must be a valid decimal`);
    }
  }

  private money(value: Decimal) {
    return value.toDecimalPlaces(2).toFixed(2);
  }

  private assertId(id: string) {
    if (!/^[1-9][0-9]*$/.test(id)) throw new BadRequestException('Pricing flow ID is invalid');
  }
}
