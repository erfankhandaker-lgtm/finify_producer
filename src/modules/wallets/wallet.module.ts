import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminWalletController, CustomerWalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [CustomerWalletController, AdminWalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
