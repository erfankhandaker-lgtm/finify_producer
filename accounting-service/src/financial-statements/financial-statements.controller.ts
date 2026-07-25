import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AdminApiGuard } from '../common/admin-api.guard';
import { BalanceSheetService } from './balance-sheet.service';
import { FxTranslationService } from './fx-translation.service';
import { IncomeStatementService } from './income-statement.service';
import { TrialBalanceService } from './trial-balance.service';
import { ConsolidatedReportQueryDto, DailyReportQueryDto, PeriodReportQueryDto } from './report-query.dto';
import { CsvReportService } from '../common/csv-report.service';

@ApiTags('Financial statements')
@ApiSecurity('admin-api-key')
@UseGuards(AdminApiGuard)
@Controller('v1/accounting')
export class FinancialStatementsController {
  constructor(
    private readonly trialBalance: TrialBalanceService,
    private readonly balanceSheet: BalanceSheetService,
    private readonly incomeStatement: IncomeStatementService,
    private readonly fx: FxTranslationService,
    private readonly csv: CsvReportService,
  ) {}

  @Get('trial-balance.csv')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="trial-balance.csv"')
  @ApiOperation({ summary: 'Export the persisted daily trial balance as CSV' })
  async trialCsv(@Query() query: DailyReportQueryDto) {
    const report = await this.trialBalance.get(query.businessDate, query.currency, query.reportingEntity);
    return this.csv.serialize(report.accounts);
  }

  @Get('trial-balance')
  @ApiOperation({ summary: 'Get the persisted daily trial balance' })
  @ApiQuery({ name: 'businessDate', example: '2026-07-25' })
  @ApiQuery({ name: 'currency', required: false, example: 'GBP' })
  @ApiQuery({ name: 'reportingEntity', required: false, example: 'FINIFY_UK' })
  trial(@Query() query: DailyReportQueryDto) {
    return this.trialBalance.get(query.businessDate, query.currency, query.reportingEntity);
  }

  @Get('balance-sheet.csv')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="balance-sheet.csv"')
  @ApiOperation({ summary: 'Export the balance sheet account rows as CSV' })
  async balanceCsv(@Query() query: DailyReportQueryDto) {
    const report = await this.balanceSheet.get(query.businessDate, query.currency, query.reportingEntity);
    return this.csv.serialize(report.accounts);
  }

  @Get('balance-sheet')
  @ApiOperation({ summary: 'Get the balance sheet for a closed business date' })
  @ApiQuery({ name: 'businessDate', example: '2026-07-25' })
  @ApiQuery({ name: 'currency', required: false, example: 'GBP' })
  @ApiQuery({ name: 'reportingEntity', required: false, example: 'FINIFY_UK' })
  balance(@Query() query: DailyReportQueryDto) {
    return this.balanceSheet.get(query.businessDate, query.currency, query.reportingEntity);
  }

  @Get('income-statement.csv')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="income-statement.csv"')
  @ApiOperation({ summary: 'Export income-statement account rows as CSV' })
  async incomeCsv(@Query() query: PeriodReportQueryDto) {
    const report = await this.incomeStatement.get(
      query.dateFrom, query.dateTo, query.currency, query.reportingEntity,
    );
    return this.csv.serialize(report.accounts);
  }

  @Get('balance-sheet/consolidated')
  @ApiOperation({ summary: 'Get a balance sheet translated into the base currency' })
  @ApiQuery({ name: 'businessDate', example: '2026-07-25' })
  @ApiQuery({ name: 'baseCurrency', required: false, example: 'GBP' })
  @ApiQuery({ name: 'reportingEntity', required: false, example: 'FINIFY_UK' })
  consolidated(@Query() query: ConsolidatedReportQueryDto) {
    return this.fx.consolidatedBalanceSheet(query.businessDate, query.reportingEntity, query.baseCurrency);
  }

  @Get('income-statement')
  @ApiOperation({ summary: 'Get income and expenses for a closed date range' })
  @ApiQuery({ name: 'dateFrom', example: '2026-07-01' })
  @ApiQuery({ name: 'dateTo', example: '2026-07-31' })
  @ApiQuery({ name: 'currency', required: false, example: 'GBP' })
  @ApiQuery({ name: 'reportingEntity', required: false, example: 'FINIFY_UK' })
  income(@Query() query: PeriodReportQueryDto) {
    return this.incomeStatement.get(query.dateFrom, query.dateTo, query.currency, query.reportingEntity);
  }
}
