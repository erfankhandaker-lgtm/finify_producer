import {Injectable,OnApplicationShutdown} from '@nestjs/common'
import {Consumer,ConsumerRunConfig,ConsumerSubscribeTopic,Kafka} from 'kafkajs'
import { decrypt } from '@helpers/cipher';

const IS_CRD_PLAIN = process.env.IS_CRD_PLAIN == 'true' ? true : false
const KAFKA_BROKERS = IS_CRD_PLAIN ? process.env.KAFKA_BROKERS : decrypt(process.env.KAFKA_BROKERS)

//read message from a topic..
@Injectable()
export class ConsumerService implements OnApplicationShutdown {
    async onApplicationShutdown() {
        for (const consumer of this.consumers) {
        await consumer.disconnect()
        }
    }

    private readonly kafka = new Kafka({
        brokers: [KAFKA_BROKERS],
    })

    private readonly consumers: Consumer[] = []

    async consume(groupId: string,topic: ConsumerSubscribeTopic,config: ConsumerRunConfig) {
        const cosumer: Consumer = this.kafka.consumer({ groupId: groupId })
        await cosumer.connect().catch((e) => console.error(e))
        await cosumer.subscribe(topic)
        await cosumer.run(config)
        this.consumers.push(cosumer)
    }
}