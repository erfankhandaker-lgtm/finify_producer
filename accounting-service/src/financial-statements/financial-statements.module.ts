import { Module } from '@nestjs/common';
import { BalanceSheetService } from './balance-sheet.service';
import { FinancialStatementsController } from './financial-statements.controller';
import { FxTranslationService } from './fx-translation.service';
import { IncomeStatementService } from './income-statement.service';
import { TrialBalanceService } from './trial-balance.service';

@Module({
  controllers: [FinancialStatementsController],
  providers: [TrialBalanceService, BalanceSheetService, IncomeStatementService, FxTranslationService],
})
export class FinancialStatementsModule {}
