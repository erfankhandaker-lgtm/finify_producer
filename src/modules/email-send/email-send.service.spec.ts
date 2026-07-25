import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../config/kafka/producer/producer.service', () => ({
  ProducerService: class ProducerService {},
}));
jest.mock('../../config/kafka/consumer/consumer.service', () => ({
  ConsumerService: class ConsumerService {},
}));

import { EmailSendService } from './email-send.service';
import { ProducerService } from '../../config/kafka/producer/producer.service';
import { ConsumerService } from '../../config/kafka/consumer/consumer.service';

describe('EmailSendService', () => {
  let service: EmailSendService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailSendService,
        {
          provide: ProducerService,
          useValue: {
            produce: jest.fn(),
          },
        },
        {
          provide: ConsumerService,
          useValue: {
            consume: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EmailSendService>(EmailSendService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
