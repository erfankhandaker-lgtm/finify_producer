import { Module } from '@nestjs/common';
import { AccountingConfigModule } from '../accounting-config/accounting-config.module';
import { EodCloseService } from './eod-close.service';
import { EodController } from './eod.controller';
import { EodOrchestrationService } from './eod-orchestration.service';
import { EodReadinessService } from './eod-readiness.service';
import { EodSchedulerService } from './eod-scheduler.service';

@Module({
  imports: [AccountingConfigModule],
  controllers: [EodController],
  providers: [EodReadinessService, EodCloseService, EodOrchestrationService, EodSchedulerService],
  exports: [EodOrchestrationService],
})
export class EodModule {}
