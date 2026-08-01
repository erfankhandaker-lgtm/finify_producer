import { Module } from '@nestjs/common';
import { AccountingReportController } from './accounting-report.controller';
import { AccountingReportService } from './accounting-report.service';

@Module({
  controllers: [AccountingReportController],
  providers: [AccountingReportService],
})
export class AccountingReportModule {}
