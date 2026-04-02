import { Test, TestingModule } from '@nestjs/testing';
import { ContratClientService } from './contrat-client.service';

describe('ContratClientService', () => {
  let service: ContratClientService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContratClientService],
    }).compile();

    service = module.get<ContratClientService>(ContratClientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
