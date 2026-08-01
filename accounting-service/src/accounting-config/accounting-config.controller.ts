import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AdminApiGuard } from '../common/admin-api.guard';
import { CreateAccountingConfigDto, ProvisionCurrencyDto } from './accounting-config.dto';
import { AccountingConfigService } from './accounting-config.service';

@ApiTags('Accounting configuration')
@ApiSecurity('admin-api-key')
@UseGuards(AdminApiGuard)
@Controller('v1/accounting/configurations')
export class AccountingConfigController {
  constructor(private readonly service: AccountingConfigService) {}

  @Get()
  @ApiOperation({ summary: 'List effective-dated timezone, cutoff, currency, and master-wallet configurations' })
  list() { return this.service.list(); }

  @Get('currencies')
  @ApiOperation({ summary: 'List configured and observed currencies with close-control status' })
  currencies(
    @Query('reportingEntity') reportingEntity = 'FINIFY_UK',
    @Query('businessDate') businessDate?: string,
  ) {
    return this.service.currencyOverview(reportingEntity, businessDate);
  }

  @Post('currencies')
  @ApiOperation({ summary: 'Provision a new currency and every required zero-balance system wallet atomically' })
  provisionCurrency(@Body() dto: ProvisionCurrencyDto) {
    return this.service.provisionCurrency(dto);
  }

  @Post()
  @ApiOperation({ summary: 'Add a future effective configuration with different maker and checker' })
  create(@Body() dto: CreateAccountingConfigDto) { return this.service.create(dto); }
}
