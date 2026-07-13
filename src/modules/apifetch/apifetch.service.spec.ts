import { Test, TestingModule } from '@nestjs/testing';
import { ApifetchService } from './apifetch.service';

describe('ApifetchService', () => {
  let service: ApifetchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApifetchService],
    }).compile();

    service = module.get<ApifetchService>(ApifetchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
