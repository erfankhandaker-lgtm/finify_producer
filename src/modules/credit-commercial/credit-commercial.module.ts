import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { CreditCommercialController } from './credit-commercial.controller';
import { CreditCommercialService } from './credit-commercial.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [CreditCommercialController],
  providers: [CreditCommercialService],
})
export class CreditCommercialModule {}
