import { Injectable, OnModuleInit  } from '@nestjs/common'
import { ProducerService } from '@config/kafka/producer/producer.service'
import { ConsumerService } from '@config/kafka/consumer/consumer.service'


@Injectable()
export class ProcessTransactionService implements OnModuleInit {
  constructor(
        private readonly _kafka: ProducerService,
        private readonly _consumer: ConsumerService
  ) {}

  async sendTransaction(message: any, Topic: string) {
    await this._kafka.produce({
      topic: Topic,
      messages: [{ value: JSON.stringify(message) }],
    });
  }

  async onModuleInit() {
        const replyTopic = process.env.KAFKA_CONSUMER_TOPIC;
        if (!replyTopic) {
          throw new Error('KAFKA_CONSUMER_TOPIC is required');
        }
        await this._consumer.consume(
            process.env.KAFKA_GROUP_ID,
          { topic: replyTopic },
          {
            eachMessage: async ({ topic, partition, message }) => {
              console.log({
                source: 'update-consumer',
                message: message.value.toString(),
                partition: partition.toString(),
                topic: topic.toString(),
              });
            },
          },
        );
      }
}
