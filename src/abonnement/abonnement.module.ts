import { Module } from '@nestjs/common';
import { AbonnementService } from './abonnement.service';
import { AbonnementController } from './abonnement.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { StripeModule } from 'src/stripe/stripe.module';

@Module({
  imports: [StripeModule] ,
  controllers: [AbonnementController],        // ✅ seulement les controllers
  providers: [AbonnementService, PrismaService], // ✅ services
})
export class AbonnementModule {}
