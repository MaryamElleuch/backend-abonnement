import { Module } from '@nestjs/common';
import { StripeController } from './stripe.controller';
import { StripeService } from './stripe.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripeWebhookController } from './stripe-webhook/stripe-webhook.controller';
import { StripeWebhookService } from './stripe-webhook/stripe-webhook.service';
import { ContratModule } from 'src/contrat/contrat.module';
import { ContratClientModule } from 'src/contrat-client/contrat-client.module';

@Module({
  imports: [ContratModule , ContratClientModule],
  controllers: [StripeController, StripeWebhookController],
  providers: [StripeService, PrismaService, StripeWebhookService],
  exports: [StripeService],
})
export class StripeModule {}
