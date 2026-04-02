import { Test, TestingModule } from '@nestjs/testing';
import { AchatAbonnementController } from './achat-abonnement.controller';

describe('AchatAbonnementController', () => {
  let controller: AchatAbonnementController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AchatAbonnementController],
    }).compile();

    controller = module.get<AchatAbonnementController>(AchatAbonnementController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
