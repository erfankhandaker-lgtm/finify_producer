import { Injectable, OnApplicationShutdown,  OnModuleInit } from '@nestjs/common'
import { Kafka, Producer, ProducerRecord } from 'kafkajs'
import { decrypt } from '@helpers/cipher';

const IS_CRD_PLAIN = process.env.IS_CRD_PLAIN == 'true' ? true : false
const KAFKA_BROKERS = IS_CRD_PLAIN ? process.env.KAFKA_BROKERS : decrypt(process.env.KAFKA_BROKERS)

//publish meesaage / write message in a topic..
@Injectable()
export class ProducerService implements OnModuleInit, OnApplicationShutdown {
    async onApplicationShutdown() {
        await this.producer.disconnect()
    }
    async onModuleInit() {
        await this.producer.connect()
    }

    private readonly kafka = new Kafka({
        brokers: [KAFKA_BROKERS],
    })

    private readonly producer: Producer = this.kafka.producer()

    async produce(record: ProducerRecord) {
        await this.producer.send(record)
    }
}