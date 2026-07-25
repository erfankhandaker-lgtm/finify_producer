import { Global, Module } from '@nestjs/common';
import { AdminApiGuard } from './admin-api.guard';
import { AccountingLoggerService } from './accounting-logger.service';
import { WalletAuthGuard } from './wallet-auth.guard';
import { CsvReportService } from './csv-report.service';

@Global()
@Module({
  providers: [AccountingLoggerService, AdminApiGuard, WalletAuthGuard, CsvReportService],
  exports: [AccountingLoggerService, AdminApiGuard, WalletAuthGuard, CsvReportService],
})
export class CommonModule {}
