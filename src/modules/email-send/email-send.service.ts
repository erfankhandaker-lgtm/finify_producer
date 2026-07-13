import { Injectable, OnModuleInit  } from '@nestjs/common'
import { ProducerService } from '../../config/kafka/producer/producer.service'
import { ConsumerService } from '../../config/kafka/consumer/consumer.service'

@Injectable()
export class EmailSendService implements OnModuleInit {

    constructor(
        private readonly _kafka: ProducerService,
        private readonly _consumer: ConsumerService
        ) {}

    async producerExample() {
        this._kafka.produce({
            topic: process.env.KAFKA_PRODUCER_TOPIC,
            messages: [{ value: 'this is emplotyee create' }],
          })
    }

    async onModuleInit() {
        this._consumer.consume(
            process.env.KAFKA_GROUP_ID,
          { topic: process.env.KAFKA_CONSUMER_TOPIC },
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
