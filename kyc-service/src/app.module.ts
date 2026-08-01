import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiKeyGuard } from './api-key.guard';
import { databaseProvider } from './database';
import { HealthController } from './health.controller';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { KycStorageService } from './kyc-storage.service';
import { SanctionsController } from './sanctions.controller';
import { SanctionsService } from './sanctions.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController, KycController, SanctionsController],
  providers: [databaseProvider, ApiKeyGuard, KycStorageService, KycService, SanctionsService],
})
export class AppModule {}
