import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './nest/prisma/prisma.module';
import { AbonnementModule } from './abonnement/abonnement.module';
import { AchatAbonnementModule } from './achat-abonnement/achat-abonnement.module';
import { EntrepriseModule } from './entreprise/entreprise.module';
import { StripeModule } from './stripe/stripe.module';
import { ContratModule } from './contrat/contrat.module';
import { AbonnementsEntrepriseModule } from './abonnements-entreprise/abonnements-entreprise.module';
import { AchatAbonnementClientModule } from './achat-abonnement-client/achat-abonnement-client.module';
import { ContratClientModule } from './contrat-client/contrat-client.module';

@Module({
  imports: [AuthModule, PrismaModule, AbonnementModule, AchatAbonnementModule, EntrepriseModule, StripeModule, ContratModule, AbonnementsEntrepriseModule, AchatAbonnementClientModule, ContratClientModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
