import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminOnboardingController } from './admin-onboarding.controller';
import { AdminChannelController } from './admin-channel.controller';
import { ChannelService } from './channel.service';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { OnboardingRuntimeService } from './onboarding-runtime.service';
import { WalletModule } from '../wallets/wallet.module';

@Module({
  imports:[AdminAuthModule,WalletModule],
  controllers:[AdminOnboardingController,AdminChannelController,OnboardingController],
  providers:[OnboardingService,OnboardingRuntimeService,ChannelService],
  exports:[OnboardingService,OnboardingRuntimeService,ChannelService],
})
export class OnboardingModule {}
