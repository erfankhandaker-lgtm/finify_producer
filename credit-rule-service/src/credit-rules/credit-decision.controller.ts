import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { EvaluationApiKeyGuard } from '../common/api-key.guard';
import { EvaluateCreditDto } from './credit-rule.dto';
import { CreditRuleEvaluatorService } from './credit-rule-evaluator.service';

@ApiTags('Credit decisions')
@ApiSecurity('api-key')
@UseGuards(EvaluationApiKeyGuard)
@Controller('v1/credit-decisions')
export class CreditDecisionController {
  constructor(private readonly evaluator: CreditRuleEvaluatorService) {}

  @Post('evaluate')
  evaluate(@Body() dto: EvaluateCreditDto) {
    return this.evaluator.evaluate({ ...dto, simulation: false, masterRuleId: undefined });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.evaluator.getExecution(id);
  }
}
