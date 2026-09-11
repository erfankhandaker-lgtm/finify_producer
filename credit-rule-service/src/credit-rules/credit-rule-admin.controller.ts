import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AdminApiKeyGuard } from '../common/api-key.guard';
import {
  CreateHttpIntegrationDto,
  CreateMasterRuleDto,
  CreateRuleDto,
  CreateScoreProviderDto,
  EvaluateCreditDto,
  ListQueryDto,
  ManualReviewDecisionDto,
  ManualReviewRecommendationDto,
  RejectDto,
  ReviewDto,
  UpdateHttpIntegrationDto,
  UpdateMasterRuleDto,
  UpdateRuleDto,
  UpdateScoreProviderDto
} from './credit-rule.dto';
import { CreditRuleEvaluatorService } from './credit-rule-evaluator.service';
import { CreditRuleManagementService } from './credit-rule-management.service';
import { CreditManualReviewService } from './credit-manual-review.service';
import { SourceValidatorService } from './source-validator.service';

@ApiTags('Credit rule administration')
@ApiSecurity('api-key')
@ApiSecurity('actor-id')
@UseGuards(AdminApiKeyGuard)
@Controller('v1')
export class CreditRuleAdminController {
  constructor(
    private readonly management: CreditRuleManagementService,
    private readonly evaluator: CreditRuleEvaluatorService,
    private readonly manualReviews: CreditManualReviewService,
    private readonly sources: SourceValidatorService
  ) {}

  @Get('credit-rule-integrations')
  listIntegrations(@Query() query: ListQueryDto) {
    return this.management.listIntegrations(query);
  }

  @Post('credit-rule-integrations')
  createIntegration(
    @Body() dto: CreateHttpIntegrationDto,
    @Headers('x-actor-id') actor?: string
  ) {
    return this.management.createIntegration(dto, this.actor(actor));
  }

  @Patch('credit-rule-integrations/:id')
  updateIntegration(
    @Param('id') id: string,
    @Body() dto: UpdateHttpIntegrationDto,
    @Headers('x-actor-id') actor?: string
  ) {
    return this.management.updateIntegration(id, dto, this.actor(actor));
  }

  @Post('credit-rule-integrations/:id/approve')
  approveIntegration(@Param('id') id: string, @Headers('x-actor-id') actor?: string) {
    return this.management.approveIntegration(id, this.actor(actor));
  }

  @Get('credit-score-providers')
  listScoreProviders() {
    return this.management.listScoreProviders();
  }

  @Post('credit-score-providers')
  createScoreProvider(
    @Body() dto: CreateScoreProviderDto,
    @Headers('x-actor-id') actor?: string
  ) {
    return this.management.createScoreProvider(dto, this.actor(actor));
  }

  @Post('credit-score-providers/:id/approve')
  approveScoreProvider(@Param('id') id: string, @Headers('x-actor-id') actor?: string) {
    return this.management.approveScoreProvider(id, this.actor(actor));
  }

  @Patch('credit-score-providers/:id')
  updateScoreProvider(
    @Param('id') id: string,
    @Body() dto: UpdateScoreProviderDto,
    @Headers('x-actor-id') actor?: string
  ) {
    return this.management.updateScoreProvider(id, dto, this.actor(actor));
  }

  @Get('credit-rule-masters')
  listMasters(@Query() query: ListQueryDto) {
    return this.management.listMasters(query);
  }

  @Post('credit-rule-masters')
  createMaster(@Body() dto: CreateMasterRuleDto, @Headers('x-actor-id') actor?: string) {
    return this.management.createMaster(dto, this.actor(actor));
  }

  @Get('credit-rule-masters/:id')
  getMaster(@Param('id') id: string) {
    return this.management.getMaster(id);
  }

  @Patch('credit-rule-masters/:id')
  updateMaster(
    @Param('id') id: string,
    @Body() dto: UpdateMasterRuleDto,
    @Headers('x-actor-id') actor?: string
  ) {
    return this.management.updateMaster(id, dto, this.actor(actor));
  }

  @Post('credit-rule-masters/:id/clone')
  cloneMaster(@Param('id') id: string, @Headers('x-actor-id') actor?: string) {
    return this.management.cloneMaster(id, this.actor(actor));
  }

  @Get('credit-rule-masters/:id/rules')
  listRules(@Param('id') id: string) {
    return this.management.listRules(id);
  }

  @Post('credit-rule-masters/:id/rules')
  addRule(
    @Param('id') id: string,
    @Body() dto: CreateRuleDto,
    @Headers('x-actor-id') actor?: string
  ) {
    return this.management.addRule(id, dto, this.actor(actor));
  }

  @Patch('credit-rule-masters/:id/rules/:ruleId')
  updateRule(
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateRuleDto,
    @Headers('x-actor-id') actor?: string
  ) {
    return this.management.updateRule(id, ruleId, dto, this.actor(actor));
  }

  @Delete('credit-rule-masters/:id/rules/:ruleId')
  deleteRule(
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
    @Headers('x-actor-id') actor?: string
  ) {
    this.actor(actor);
    return this.management.deleteRule(id, ruleId);
  }

  @Post('credit-rule-masters/:id/submit')
  submit(
    @Param('id') id: string,
    @Body() dto: ReviewDto,
    @Headers('x-actor-id') actor?: string
  ) {
    return this.management.submit(id, this.actor(actor), dto.comment);
  }

  @Post('credit-rule-masters/:id/approve')
  approve(
    @Param('id') id: string,
    @Body() dto: ReviewDto,
    @Headers('x-actor-id') actor?: string
  ) {
    return this.management.approve(id, this.actor(actor), dto.comment);
  }

  @Post('credit-rule-masters/:id/reject')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectDto,
    @Headers('x-actor-id') actor?: string
  ) {
    return this.management.reject(id, this.actor(actor), dto.reason);
  }

  @Post('credit-rule-masters/:id/activate')
  activate(@Param('id') id: string, @Headers('x-actor-id') actor?: string) {
    return this.management.activate(id, this.actor(actor));
  }

  @Post('credit-rule-masters/:id/retire')
  retire(@Param('id') id: string, @Headers('x-actor-id') actor?: string) {
    return this.management.retire(id, this.actor(actor));
  }

  @Post('credit-rule-masters/:id/simulate')
  simulate(@Param('id') id: string, @Body() dto: EvaluateCreditDto) {
    return this.evaluator.evaluate({ ...dto, simulation: true, masterRuleId: id });
  }

  @Get('credit-rule-metadata/database')
  databaseMetadata(
    @Query('schema') schemaName: string,
    @Query('table') tableName?: string
  ) {
    if (!schemaName) throw new BadRequestException('schema query parameter is required');
    return this.sources.metadata(schemaName, tableName);
  }

  @Get('credit-rule-metadata/capabilities')
  capabilities() {
    return {
      sourceTypes: ['AI_RESULT', 'DECISION_INPUT', 'POSTGRES', 'HTTP_API'],
      dataTypes: ['STRING', 'DECIMAL', 'INTEGER', 'BOOLEAN', 'DATE', 'DATETIME'],
      readModes: ['SINGLE', 'LATEST', 'SUM', 'AVERAGE', 'COUNT', 'MINIMUM', 'MAXIMUM', 'EXISTS'],
      conditionOperators: [
        'EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL',
        'LESS_THAN', 'LESS_THAN_OR_EQUAL', 'BETWEEN', 'RANGE',
        'IN', 'NOT_IN', 'IS_NULL', 'IS_NOT_NULL'
      ],
      conditionGroups: ['all', 'any', 'not'],
      actionTypes: [
        'CONTINUE', 'REJECT', 'MANUAL_REVIEW', 'SET_LIMIT_FIXED',
        'SET_LIMIT_FROM_VALUE', 'SET_LIMIT_FROM_VALUE_MULTIPLIER',
        'ADD_LIMIT_FIXED', 'SUBTRACT_LIMIT_FIXED', 'CAP_LIMIT_FIXED',
        'CAP_LIMIT_FROM_VALUE_MULTIPLIER', 'SET_CREDIT_OFFER',
        'SET_LIMIT_FROM_INPUT_MULTIPLIER'
      ],
      aiResultFields: [
        'score', 'category', 'modelId', 'modelVersion', 'scoredAt', 'expiresAt', 'referenceId'
      ],
      decisionInputFields: [
        'grade','channel','countryCode','kycStatus','bureauStatus','ageYears',
        'dominantCashFlow','modelProposedLimit','telecomTenureMonths','currentDpd',
        'count30PlusDpd6Months','maxDpd6Months','maxDpd12Months','currentOpenLoans',
        'dpd30Days','dpd60Days','dpd90Days','churnBand','dormantAfterAllocation',
        'schoolAggregatorTermPaid'
      ]
    };
  }

  @Get('credit-rule-executions')
  listExecutions(@Query() query: ListQueryDto) {
    return this.evaluator.listExecutions(query);
  }

  @Get('credit-rule-executions/:id')
  getExecution(@Param('id') id: string) {
    return this.evaluator.getExecution(id);
  }

  @Get('credit-manual-reviews')
  listManualReviews(@Query() query: ListQueryDto) {
    return this.manualReviews.list(query);
  }

  @Get('credit-manual-reviews/:id')
  getManualReview(@Param('id') id: string) {
    return this.manualReviews.get(id);
  }

  @Post('credit-manual-reviews/:id/recommend')
  recommendManualReview(@Param('id') id: string,@Body() dto: ManualReviewRecommendationDto,
    @Headers('x-actor-id') actor?: string) {
    return this.manualReviews.recommend(id,dto,this.actor(actor));
  }

  @Post('credit-manual-reviews/:id/decide')
  decideManualReview(@Param('id') id: string,@Body() dto: ManualReviewDecisionDto,
    @Headers('x-actor-id') actor?: string) {
    return this.manualReviews.decide(id,dto,this.actor(actor));
  }

  private actor(value?: string): string {
    const actor = value?.trim();
    if (!actor) throw new BadRequestException('x-actor-id header is required');
    return actor;
  }
}
