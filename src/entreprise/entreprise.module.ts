import { Module } from '@nestjs/common';
import { EntrepriseService } from './entreprise.service';
import { EntrepriseController } from './entreprise.controller';

@Module({
  providers: [EntrepriseService],
  controllers: [EntrepriseController]
})
export class EntrepriseModule {}
