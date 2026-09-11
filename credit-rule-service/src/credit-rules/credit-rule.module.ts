import { Module } from '@nestjs/common';
import { AdminApiKeyGuard, EvaluationApiKeyGuard } from '../common/api-key.guard';
import { ConditionEngineService } from './condition-engine.service';
import { CreditDecisionController } from './credit-decision.controller';
import { CreditRuleAdminController } from './credit-rule-admin.controller';
import { CreditRuleEvaluatorService } from './credit-rule-evaluator.service';
import { CreditRuleManagementService } from './credit-rule-management.service';
import { CreditManualReviewService } from './credit-manual-review.service';
import { HttpSourceService } from './http-source.service';
import { SourceValidatorService } from './source-validator.service';

@Module({
  controllers: [CreditRuleAdminController, CreditDecisionController],
  providers: [
    AdminApiKeyGuard,
    EvaluationApiKeyGuard,
    ConditionEngineService,
    CreditRuleManagementService,
    CreditManualReviewService,
    CreditRuleEvaluatorService,
    HttpSourceService,
    SourceValidatorService
  ]
})
export class CreditRuleModule {}
