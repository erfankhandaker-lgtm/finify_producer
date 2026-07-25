import { Test, TestingModule } from '@nestjs/testing';
import { ApifetchController } from './apifetch.controller';
import { ApifetchService } from './apifetch.service';

describe('ApifetchController', () => {
  let controller: ApifetchController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApifetchController],
      providers: [
        {
          provide: ApifetchService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<ApifetchController>(ApifetchController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
