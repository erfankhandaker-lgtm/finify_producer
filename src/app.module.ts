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
import { ApifetchModule } from './modules/apifetch/apifetch.module';
import { UserModule } from './modules/user/user.module'
import { RedisModule } from './config/redis/redis.module'
import { TransactionModule } from './modules/transaction/transaction.module';
import { RegistrationModule } from './modules/registration/registration.module';
import { AdminAuthModule } from './modules/admin-auth/admin-auth.module';
import { ReferenceDataModule } from './modules/reference-data/reference-data.module';
import { WalletModule } from './modules/wallets/wallet.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), 
    DatabaseModule,
    RedisModule,
    KafkaModule,
    EmailSendModule,
    AuthModule,
    ApifetchModule,
    UserModule,
    TransactionModule,
    RegistrationModule,
    AdminAuthModule,
    ReferenceDataModule,
    WalletModule,
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
