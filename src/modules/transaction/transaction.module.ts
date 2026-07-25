import { Module } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { TransactionController } from './transaction.controller';
import { DatabaseModule } from '@config/database/database.module';
import Redis from 'ioredis';
import { RedisModule } from '@config/redis/redis.module';
import { KeywordService } from './keyword.service';
import { PasswordService } from './password.service';
import { KafkaModule } from '@config/kafka/kafka.module';
import { ProcessTransactionService } from './process-transaction.service';
import { TransactionRequestService } from './transaction-request.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SwTblCharge, SwTblChargeDetail, SwTblChargeMapping, SwTblCommission, SwTblCommissionDetail, SwTblCommissionMapping, SwTblKeyword, SwTblKeywordCharge, SwTblKeywordCommission, SwTblTransactionEntry, SwTblWallet, SwTblWalletType, SwViewAllUser, TransactionRequest, WalletDetail } from '@models/index';
import { ChargeService } from './charge.service';
import { ChargeController } from './charge.controller';
import { CommissionService } from './commission.service';
import { CommissionController } from './commission.controller';
import { AmlTransactionService } from './aml-transaction.service';

@Module({
  controllers: [TransactionController, ChargeController, CommissionController],
  providers: [TransactionService,KeywordService, PasswordService, ProcessTransactionService,TransactionRequestService, ChargeService, CommissionService, AmlTransactionService],
  exports:[TransactionService,KeywordService,PasswordService, ProcessTransactionService,TransactionRequestService, ChargeService, CommissionService, AmlTransactionService],
  imports:[DatabaseModule, RedisModule,KafkaModule, TypeOrmModule.forFeature([SwTblKeyword, WalletDetail, SwViewAllUser, TransactionRequest, SwTblTransactionEntry, SwTblCharge, SwTblChargeDetail, SwTblChargeMapping, SwTblKeywordCharge, SwTblCommission, SwTblCommissionDetail, SwTblCommissionMapping, SwTblKeywordCommission, SwTblWallet, SwTblWalletType])]
})
export class TransactionModule {}
