import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccountStatementsModule } from './account-statements/account-statements.module';
import { AccountingConfigModule } from './accounting-config/accounting-config.module';
import { AccountingPeriodModule } from './accounting-period/accounting-period.module';
import { ChartOfAccountsModule } from './chart-of-accounts/chart-of-accounts.module';
import { CommonModule } from './common/common.module';
import { DatabaseModule } from './config/database.module';
import { EodModule } from './eod/eod.module';
import { FinancialStatementsModule } from './financial-statements/financial-statements.module';
import { HealthController } from './health.controller';
import { ReconciliationModule } from './reconciliation/reconciliation.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    CommonModule,
    AccountingConfigModule,
    AccountingPeriodModule,
    ChartOfAccountsModule,
    EodModule,
    FinancialStatementsModule,
    AccountStatementsModule,
    ReconciliationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
