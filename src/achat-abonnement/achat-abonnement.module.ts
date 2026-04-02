import { Module } from '@nestjs/common';
import { AchatAbonnementService } from './achat-abonnement.service';
import { AchatAbonnementController } from './achat-abonnement.controller';

@Module({
  providers: [AchatAbonnementService],
  controllers: [AchatAbonnementController]
})
export class AchatAbonnementModule {}
