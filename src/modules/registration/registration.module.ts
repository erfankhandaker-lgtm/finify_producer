import { Module } from '@nestjs/common';
import { RegistrationService } from './registration.service';
import { RegistrationController } from './registration.controller';
import { DatabaseModule } from '@config/database/database.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SwTblKeyword, SwViewAllUser, TransactionRequest, WalletDetail } from '@models/index';

@Module({
  controllers: [RegistrationController],
  providers: [RegistrationService],
  imports: [DatabaseModule, TypeOrmModule.forFeature([SwTblKeyword, WalletDetail, SwViewAllUser, TransactionRequest])],
  exports: [RegistrationService,]
})
export class RegistrationModule {}
