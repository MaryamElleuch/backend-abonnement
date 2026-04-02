import { Test, TestingModule } from '@nestjs/testing';
import { ContratClientController } from './contrat-client.controller';

describe('ContratClientController', () => {
  let controller: ContratClientController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContratClientController],
    }).compile();

    controller = module.get<ContratClientController>(ContratClientController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
