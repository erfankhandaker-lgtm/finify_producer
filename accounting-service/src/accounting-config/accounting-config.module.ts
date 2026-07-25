import { Module } from '@nestjs/common';
import { AccountingConfigController } from './accounting-config.controller';
import { AccountingConfigService } from './accounting-config.service';

@Module({
  controllers: [AccountingConfigController],
  providers: [AccountingConfigService],
  exports: [AccountingConfigService],
})
export class AccountingConfigModule {}
