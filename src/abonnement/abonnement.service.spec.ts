import { Test, TestingModule } from '@nestjs/testing';
import { AbonnementService } from './abonnement.service';

describe('AbonnementService', () => {
  let service: AbonnementService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AbonnementService],
    }).compile();

    service = module.get<AbonnementService>(AbonnementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
