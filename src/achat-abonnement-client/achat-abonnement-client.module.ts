import { Module } from '@nestjs/common';
import { AchatAbonnementClientService } from './achat-abonnement-client.service';
import { AchatAbonnementClientController } from './achat-abonnement-client.controller';

@Module({
  providers: [AchatAbonnementClientService],
  controllers: [AchatAbonnementClientController]
})
export class AchatAbonnementClientModule {}
