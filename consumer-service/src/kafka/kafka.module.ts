import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { KafkaConsumerService } from './kafka-consumer.service';

@Module({
  imports: [TransactionsModule],
  providers: [KafkaConsumerService],
  exports: [KafkaConsumerService],
})
export class KafkaModule {}
