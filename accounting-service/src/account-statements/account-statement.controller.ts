import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AdminApiGuard } from '../common/admin-api.guard';
import { WalletAuthGuard, WalletRequest } from '../common/wallet-auth.guard';
import { AccountStatementService } from './account-statement.service';
import { PeriodReportQueryDto } from '../financial-statements/report-query.dto';

@ApiTags('Account statements')
@Controller('v1/accounting')
export class AccountStatementController {
  constructor(private readonly service: AccountStatementService) {}

  @Get('my/statement')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated wallet holder statement for a date range' })
  @ApiQuery({ name: 'dateFrom', example: '2026-07-01' })
  @ApiQuery({ name: 'dateTo', example: '2026-07-31' })
  @ApiQuery({ name: 'currency', required: false, example: 'GBP' })
  @UseGuards(WalletAuthGuard)
  own(@Req() request: WalletRequest, @Query() query: PeriodReportQueryDto) {
    return this.service.get(request.walletUser!.username, query.dateFrom, query.dateTo, query.currency);
  }

  @Get('accounts/:wallet/statement')
  @ApiSecurity('admin-api-key')
  @ApiOperation({ summary: 'Get an account statement by wallet identifier' })
  @ApiParam({ name: 'wallet', example: '447700900123' })
  @ApiQuery({ name: 'dateFrom', example: '2026-07-01' })
  @ApiQuery({ name: 'dateTo', example: '2026-07-31' })
  @ApiQuery({ name: 'currency', required: false, example: 'GBP' })
  @UseGuards(AdminApiGuard)
  account(@Param('wallet') wallet: string, @Query() query: PeriodReportQueryDto) {
    return this.service.get(wallet, query.dateFrom, query.dateTo, query.currency);
  }
}
