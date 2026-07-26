import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { DatabaseModule } from './config/database.module';
import { CreditRuleModule } from './credit-rules/credit-rule.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    CreditRuleModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
