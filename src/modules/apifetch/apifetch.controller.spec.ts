import { Test, TestingModule } from '@nestjs/testing';
import { ApifetchController } from './apifetch.controller';

describe('ApifetchController', () => {
  let controller: ApifetchController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApifetchController],
    }).compile();

    controller = module.get<ApifetchController>(ApifetchController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
