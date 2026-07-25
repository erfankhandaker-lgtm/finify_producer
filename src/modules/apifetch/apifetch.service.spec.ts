import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ApifetchService } from './apifetch.service';

describe('ApifetchService', () => {
  let service: ApifetchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApifetchService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
            request: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ApifetchService>(ApifetchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
