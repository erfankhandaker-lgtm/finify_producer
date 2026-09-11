import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './config/database/database.module'
import { LoggerMiddleware, NoSniffMiddleware, XPoweredByMiddleware } from './middleware'

import { interceptorProviders } from './helpers/interceptor'

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EmailSendModule } from './modules/email-send/email-send.module';
import { KafkaModule } from './config/kafka/kafka.module'
import { AuthModule } from './modules/auth/auth.module';
import { RedisModule } from './config/redis/redis.module'
import { TransactionModule } from './modules/transaction/transaction.module';
import { AdminAuthModule } from './modules/admin-auth/admin-auth.module';
import { ReferenceDataModule } from './modules/reference-data/reference-data.module';
import { WalletModule } from './modules/wallets/wallet.module';
import { AdminOperationsModule } from './modules/admin-operations/admin-operations.module';
import { PortalModule } from './modules/portal/portal.module';
import { MrFinifyModule } from './modules/mr-finify/mr-finify.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { CreditCommercialModule } from './modules/credit-commercial/credit-commercial.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), 
    DatabaseModule,
    RedisModule,
    KafkaModule,
    EmailSendModule,
    AuthModule,
    TransactionModule,
    AdminAuthModule,
    ReferenceDataModule,
    WalletModule,
    AdminOperationsModule,
    MrFinifyModule,
    PortalModule,
    OnboardingModule,
    CreditCommercialModule,
  ],
  controllers: [
    AppController,
  ],
  providers: [
     AppService,
     ...interceptorProviders
  ],
})

export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
    .apply(LoggerMiddleware)
    .forRoutes('*');
  }
}
