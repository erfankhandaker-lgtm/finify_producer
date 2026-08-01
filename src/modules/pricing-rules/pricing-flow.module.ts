import { Module } from '@nestjs/common';
import { PricingFlowService } from './pricing-flow.service';

@Module({
  providers: [PricingFlowService],
  exports: [PricingFlowService],
})
export class PricingFlowModule {}
