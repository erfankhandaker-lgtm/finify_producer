import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AdminApiGuard } from '../common/admin-api.guard';
import { GeneralLedgerQueryDto, JournalReportQueryDto } from './accounting-report.dto';
import { AccountingReportService } from './accounting-report.service';

@ApiTags('Accounting reports')
@ApiSecurity('admin-api-key')
@UseGuards(AdminApiGuard)
@Controller('v1/accounting/reports')
export class AccountingReportController {
  constructor(private readonly reports: AccountingReportService) {}

  @Get('journals')
  @ApiOperation({ summary: 'Search the accounting journal with bounded pagination' })
  journals(@Query() query: JournalReportQueryDto) {
    return this.reports.journals(query);
  }

  @Get('journals/:id')
  @ApiOperation({ summary: 'Get one journal and its double-entry lines' })
  journal(@Param('id') id: string) {
    return this.reports.journal(id);
  }

  @Get('general-ledger')
  @ApiOperation({ summary: 'Get mapped general-ledger activity and account control totals' })
  generalLedger(@Query() query: GeneralLedgerQueryDto) {
    return this.reports.generalLedger(query);
  }
}
