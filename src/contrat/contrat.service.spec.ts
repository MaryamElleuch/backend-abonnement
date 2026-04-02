import { Test, TestingModule } from '@nestjs/testing';
import { ContratService } from './contrat.service';

describe('ContratService', () => {
  let service: ContratService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContratService],
    }).compile();

    service = module.get<ContratService>(ContratService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
