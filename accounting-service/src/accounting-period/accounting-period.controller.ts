import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AdminApiGuard } from '../common/admin-api.guard';
import { AccountingPeriodService } from './accounting-period.service';

@ApiTags('Accounting periods')
@ApiSecurity('admin-api-key')
@UseGuards(AdminApiGuard)
@Controller('v1/accounting/periods')
export class AccountingPeriodController {
  constructor(private readonly service: AccountingPeriodService) {}
  @Get()
  @ApiOperation({ summary: 'List historical OPEN, FAILED, and CLOSED accounting periods' })
  @ApiQuery({ name: 'reportingEntity', required: false, example: 'FINIFY_UK' })
  @ApiQuery({ name: 'limit', required: false, example: 90 })
  list(@Query('reportingEntity') entity = 'FINIFY_UK', @Query('limit') limit = '90') {
    return this.service.list(entity, Number(limit) || 90);
  }
}
