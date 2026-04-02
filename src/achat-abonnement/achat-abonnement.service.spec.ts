import { Test, TestingModule } from '@nestjs/testing';
import { AchatAbonnementService } from './achat-abonnement.service';

describe('AchatAbonnementService', () => {
  let service: AchatAbonnementService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AchatAbonnementService],
    }).compile();

    service = module.get<AchatAbonnementService>(AchatAbonnementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
