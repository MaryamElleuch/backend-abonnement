import { Test, TestingModule } from '@nestjs/testing';
import { AchatAbonnementClientController } from './achat-abonnement-client.controller';

describe('AchatAbonnementClientController', () => {
  let controller: AchatAbonnementClientController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AchatAbonnementClientController],
    }).compile();

    controller = module.get<AchatAbonnementClientController>(AchatAbonnementClientController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
