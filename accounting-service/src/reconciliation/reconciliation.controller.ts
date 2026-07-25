import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AdminApiGuard } from '../common/admin-api.guard';
import { ReconciliationService } from './reconciliation.service';
import { DailyReportQueryDto } from '../financial-statements/report-query.dto';

@ApiTags('Reconciliation')
@ApiSecurity('admin-api-key')
@UseGuards(AdminApiGuard)
@Controller('v1/accounting/reconciliation')
export class ReconciliationController {
  constructor(private readonly service: ReconciliationService) {}
  @Get('safeguarding')
  @ApiOperation({ summary: 'Get safeguarding master balance, liabilities, variance, and exceptions' })
  @ApiQuery({ name: 'businessDate', example: '2026-07-25' })
  @ApiQuery({ name: 'currency', required: false, example: 'GBP' })
  @ApiQuery({ name: 'reportingEntity', required: false, example: 'FINIFY_UK' })
  get(@Query() query: DailyReportQueryDto) {
    return this.service.get(query.businessDate, query.currency, query.reportingEntity);
  }
}
