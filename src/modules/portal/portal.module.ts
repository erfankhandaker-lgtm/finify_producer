import { Module } from '@nestjs/common';
import { TransactionModule } from '../transaction/transaction.module';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [TransactionModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
