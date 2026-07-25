import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AdminApiGuard } from '../common/admin-api.guard';
import { ChartOfAccountsService } from './chart-of-accounts.service';

@ApiTags('Chart of accounts')
@ApiSecurity('admin-api-key')
@UseGuards(AdminApiGuard)
@Controller('v1/accounting/chart-of-accounts')
export class ChartOfAccountsController {
  constructor(private readonly service: ChartOfAccountsService) {}
  @Get()
  @ApiOperation({ summary: 'List the effective chart of accounts' })
  accounts() { return this.service.accounts(); }
  @Get('wallet-mappings')
  @ApiOperation({ summary: 'List wallet-code to GL-account mappings' })
  mappings() { return this.service.mappings(); }
}
