import { Module } from '@nestjs/common';
import { AbonnementsEntrepriseService } from './abonnements-entreprise.service';
import { AbonnementsEntrepriseController } from './abonnements-entreprise.controller';
import { StripeModule } from 'src/stripe/stripe.module';

@Module({
   imports: [StripeModule],
  providers: [AbonnementsEntrepriseService],
  controllers: [AbonnementsEntrepriseController]
})
export class AbonnementsEntrepriseModule {}
