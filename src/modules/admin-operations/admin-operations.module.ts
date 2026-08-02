import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { PricingFlowModule } from '../pricing-rules/pricing-flow.module';
import { TransactionModule } from '../transaction/transaction.module';
import { RedisModule } from '../../config/redis/redis.module';
import { AdminOperationsController } from './admin-operations.controller';
import { AdminOperationsService } from './admin-operations.service';
import { TreasuryDocumentService } from './treasury-document.service';

@Module({
  imports: [AdminAuthModule, TransactionModule, PricingFlowModule, RedisModule],
  controllers: [AdminOperationsController],
  providers: [AdminOperationsService, TreasuryDocumentService],
  exports: [AdminOperationsService],
})
export class AdminOperationsModule {}
