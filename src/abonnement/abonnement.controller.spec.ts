import { Test, TestingModule } from '@nestjs/testing';
import { AbonnementController } from './abonnement.controller';

describe('AbonnementController', () => {
  let controller: AbonnementController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AbonnementController],
    }).compile();

    controller = module.get<AbonnementController>(AbonnementController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
