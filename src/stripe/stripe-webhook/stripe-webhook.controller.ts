  import { BadRequestException, Controller, Headers, Post, Req } from '@nestjs/common';
  import { PrismaService } from 'src/prisma/prisma.service';
  import Stripe from 'stripe';
  import { ContratService } from 'src/contrat/contrat.service';
  import { ContratClientService } from 'src/contrat-client/contrat-client.service';

  @Controller('stripe')
  export class StripeWebhookController {
    private stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-01-28.clover',
    });

    constructor(
      private prisma: PrismaService,
      private contratService: ContratService,
      private contratClientService: ContratClientService,
    ) {}

    @Post('webhook')
    async handleWebhook(@Req() req: any, @Headers('stripe-signature') signature: string) {
      if (!signature) {
        throw new BadRequestException('Missing stripe-signature header');
      }

      const rawBody: Buffer = req.body;

      let event: Stripe.Event;
      try {
        event = this.stripe.webhooks.constructEvent(
          rawBody,
          signature,
          process.env.STRIPE_WEBHOOK_SECRET!,
        );
      } catch (err: any) {
        throw new BadRequestException(`Webhook Error: ${err.message}`);
      }

      // Idempotence robuste: on "réserve" l'event avant traitement
      try {
        await this.prisma.stripeEvent.create({
          data: { id: event.id, type: event.type },
        });
      } catch (e: any) {
        if (e?.code === 'P2002') {
          return { received: true };
        }
        throw e;
      }

      try {
        if (event.type === 'checkout.session.completed') {
          const session = event.data.object as Stripe.Checkout.Session;

          if (session.metadata?.type === 'ABO_PLATEFORME') {
            await this.handleEntreprisePayment(session);
          }

          if (session.metadata?.type === 'ABO_CLIENT') {
            await this.handleClientPayment(session);
          }
        }

        if (event.type === 'invoice.payment_succeeded') {
          const invoice = event.data.object as Stripe.Invoice;
          await this.handleEntrepriseInvoicePaid(invoice);
          await this.handleClientInvoicePaid(invoice);
        }

        if (event.type === 'invoice.payment_failed') {
          const invoice = event.data.object as Stripe.Invoice;
          await this.handleEntrepriseInvoiceFailed(invoice);
          await this.handleClientInvoiceFailed(invoice);
        }

        if (event.type === 'customer.subscription.deleted') {
          const sub = event.data.object as Stripe.Subscription;
          await this.handleEntrepriseSubscriptionDeleted(sub);
          await this.handleClientSubscriptionDeleted(sub);
        }

        return { received: true };
      } catch (e: any) {
        console.error('Erreur webhook Stripe:', e);
        throw e;
      }
    }

    private async handleClientPayment(session: Stripe.Checkout.Session) {
      const achatClientId = session.client_reference_id || session.metadata?.achatClientId;
      if (!achatClientId) return;

      const achat = await this.prisma.achatAbonnementClient.findUnique({
        where: { id: achatClientId },
        select: {
          id: true,
          entrepriseId: true,
          clientId: true,
          statutPaiement: true,
        },
      });

      if (!achat) return;

      const paidLike =
        session.payment_status === 'paid' ||
        session.payment_status === 'no_payment_required';

      if (!paidLike) return;

      const stripeSubscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : (session.subscription as any)?.id ?? null;

      await this.prisma.achatAbonnementClient.update({
        where: { id: achat.id },
        data: {
          statutPaiement: 'PAID',
          stripeSessionId: session.id,
          stripeSubscriptionId: stripeSubscriptionId ?? undefined,
          paymentIntentId:
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : null,
        } as any,
      });

      const contratClient = await this.contratClientService.createContratClientFromAchat(
        achat.id,
      );

      await this.contratClientService.generatePdfDraft(contratClient.id);
    }

    private async handleEntreprisePayment(session: Stripe.Checkout.Session) {
      const achatId = session.client_reference_id || session.metadata?.achatId;
      if (!achatId) return;

      const achat = await this.prisma.achatAbonnement.findUnique({
        where: { id: achatId },
        select: {
          id: true,
          entrepriseId: true,
          abonnementId: true,
          statutPaiement: true,
        },
      });

      if (!achat) return;

      const stripeSubscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : (session.subscription as any)?.id ?? null;

      const stripeCustomerId =
        typeof session.customer === 'string'
          ? session.customer
          : (session.customer as any)?.id ?? null;

      const paidLike =
        session.payment_status === 'paid' ||
        session.payment_status === 'no_payment_required';

      let expireLe: Date | null = null;

      if (stripeSubscriptionId) {
        const sub = await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
        const end = (sub as any)?.current_period_end;
        if (typeof end === 'number') {
          expireLe = new Date(end * 1000);
        }
      }

      if (!expireLe) {
        const abo = await this.prisma.abonnement.findUnique({
          where: { id: achat.abonnementId },
          select: { duree: true, interval: true },
        });

        const d = new Date();

        if (abo?.interval === 'DAY') {
          d.setDate(d.getDate() + (abo?.duree ?? 1));
        } else if (abo?.interval === 'MONTH') {
          d.setMonth(d.getMonth() + (abo?.duree ?? 1));
        } else if (abo?.interval === 'YEAR') {
          d.setFullYear(d.getFullYear() + (abo?.duree ?? 1));
        }

        expireLe = d;
      }

      let contratId: string | null = null;
      let invoiceId: string | null = null;
let paymentIntentId: string | null = null;

if (typeof session.invoice === 'string') {
  invoiceId = session.invoice;

  const invoice = await this.stripe.invoices.retrieve(session.invoice);
  const anyInvoice = invoice as any;

  paymentIntentId =
    typeof anyInvoice.payment_intent === 'string'
      ? anyInvoice.payment_intent
      : null;
}
      await this.prisma.$transaction(async (tx) => {
        await tx.achatAbonnement.update({
          where: { id: achat.id },
          data: {
            stripeSubscriptionId: stripeSubscriptionId ?? undefined,
            statutPaiement: paidLike ? 'PAID' : achat.statutPaiement,
          } as any,
        });
        if (paidLike && invoiceId) {
  await tx.paiementAbonnementEntreprise.upsert({
    where: {
      stripeInvoiceId: invoiceId,
    },
    update: {},
    create: {
      entrepriseId: achat.entrepriseId,
      achatAbonnementId: achat.id,
      montant: session.amount_total ? session.amount_total / 100 : achat.montant,
      statutPaiement: 'PAID',
      stripeInvoiceId: invoiceId,
      paymentIntentId,
      stripeSubscriptionId: stripeSubscriptionId ?? null,
    },
  });
}

        const createdOrExisting = await tx.contratEntreprise.upsert({
          where: { entrepriseId: achat.entrepriseId },
          update: {
            achatId: achat.id,
            abonnementId: achat.abonnementId,
          } as any,
          create: {
            entrepriseId: achat.entrepriseId,
            achatId: achat.id,
            abonnementId: achat.abonnementId,
            statut: 'DRAFT',
          } as any,
          select: { id: true, statut: true },
        });

        contratId = createdOrExisting.id;

        const isSigned = createdOrExisting.statut === 'SIGNED';

        await tx.entreprise.update({
          where: { id: achat.entrepriseId },
          data: {
            stripeCustomerId: stripeCustomerId ?? undefined,
            stripeSubscriptionId: stripeSubscriptionId ?? undefined,
            ...(paidLike
              ? {
                  abonnementId: achat.abonnementId,
                  abonnementExpireLe: expireLe!,
                }
              : {}),
            ...(paidLike 
              ? { statut: 'ACTIVE' }
              : {}) , 
          } as any,
        });
      });

      if (paidLike && contratId) {
        await this.contratService.generatePdfDraft(contratId);
      }
    }

  //   private async handleEntrepriseInvoicePaid(invoice: Stripe.Invoice) {
  //     await tx.paiementAbonnementEntreprise.create({
  //   data: {
  //     entrepriseId: achat.entrepriseId,
  //     achatAbonnementId: achat.id,
  //     montant: invoice.amount_paid / 100,
  //     statutPaiement: 'PAID',
  //     stripeInvoiceId: invoice.id,
  //     paymentIntentId: invoice.payment_intent as string,
  //     stripeSubscriptionId: subscriptionId,
  //   }
  // });
  //     const anyInvoice = invoice as any;

  //     const subscriptionId: string | null =
  //       typeof anyInvoice.subscription === 'string'
  //         ? anyInvoice.subscription
  //         : typeof anyInvoice.subscription?.id === 'string'
  //           ? anyInvoice.subscription.id
  //           : typeof anyInvoice.subscription_details?.subscription === 'string'
  //             ? anyInvoice.subscription_details.subscription
  //             : null;

  //     if (!subscriptionId) return;

  //     const achat = await this.prisma.achatAbonnement.findFirst({
  //       where: { stripeSubscriptionId: subscriptionId },
  //       orderBy: { dateAchat: 'desc' },
  //     });

  //     if (!achat) return;

  //     const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
  //     const end = (sub as any)?.current_period_end;
  //     const expireLe = typeof end === 'number' ? new Date(end * 1000) : null;

  //     await this.prisma.$transaction(async (tx) => {
  //       await tx.achatAbonnement.update({
  //         where: { id: achat.id },
  //         data: {
  //           statutPaiement: 'PAID',
  //           latestInvoiceId: invoice.id,
  //         } as any,
  //       });

  //       const contrat = await tx.contratEntreprise.findUnique({
  //         where: { entrepriseId: achat.entrepriseId },
  //         select: { statut: true },
  //       });

  //       const isSigned = contrat?.statut === 'SIGNED';

  //       await tx.entreprise.update({
  //         where: { id: achat.entrepriseId },
  //         data: {
  //           abonnementId: achat.abonnementId,
  //           ...(expireLe ? { abonnementExpireLe: expireLe } : {}),
  //           ...(isSigned ? { statut: 'ACTIVE' } : { statut: 'SUSPENDUE' }),
  //         } as any,
  //       });
  //     });
  //   }
  private async handleEntrepriseInvoicePaid(invoice: Stripe.Invoice) {
    const anyInvoice = invoice as any;

    const subscriptionId: string | null =
      typeof anyInvoice.subscription === 'string'
        ? anyInvoice.subscription
        : typeof anyInvoice.subscription?.id === 'string'
          ? anyInvoice.subscription.id
          : typeof anyInvoice.subscription_details?.subscription === 'string'
            ? anyInvoice.subscription_details.subscription
            : null;

    if (!subscriptionId) return;

    const achat = await this.prisma.achatAbonnement.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
      orderBy: { dateAchat: 'desc' },
    });

    if (!achat) return;

    const paymentIntentId =
      typeof anyInvoice.payment_intent === 'string'
        ? anyInvoice.payment_intent
        : null;

    const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
    const end = (sub as any)?.current_period_end;
    const expireLe = typeof end === 'number' ? new Date(end * 1000) : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.paiementAbonnementEntreprise.upsert({
        where: { stripeInvoiceId: invoice.id },
        update: {},
        create: {
          entrepriseId: achat.entrepriseId,
          achatAbonnementId: achat.id,
          montant: invoice.amount_paid / 100,
          statutPaiement: 'PAID',
          stripeInvoiceId: invoice.id,
          paymentIntentId,
          stripeSubscriptionId: subscriptionId,
        },
      });

      await tx.achatAbonnement.update({
        where: { id: achat.id },
        data: {
          statutPaiement: 'PAID',
          latestInvoiceId: invoice.id,
        } as any,
      });

      const contrat = await tx.contratEntreprise.findUnique({
        where: { entrepriseId: achat.entrepriseId },
        select: { statut: true },
      });

     await tx.entreprise.update({
  where: { id: achat.entrepriseId },
  data: {
    abonnementId: achat.abonnementId,
    ...(expireLe ? { abonnementExpireLe: expireLe } : {}),
    statut: 'ACTIVE',
  } as any,
});
    });
  }
    // private async handleClientInvoicePaid(invoice: Stripe.Invoice) {
    //   const anyInvoice = invoice as any;

    //   const subscriptionId: string | null =
    //     typeof anyInvoice.subscription === 'string'
    //       ? anyInvoice.subscription
    //       : typeof anyInvoice.subscription?.id === 'string'
    //         ? anyInvoice.subscription.id
    //         : typeof anyInvoice.subscription_details?.subscription === 'string'
    //           ? anyInvoice.subscription_details.subscription
    //           : null;

    //   if (!subscriptionId) return;

    //   const achat = await this.prisma.achatAbonnementClient.findFirst({
    //     where: { stripeSubscriptionId: subscriptionId },
    //     orderBy: { dateAchat: 'desc' },
    //   });

    //   if (!achat) return;

    //   await this.prisma.achatAbonnementClient.update({
    //     where: { id: achat.id },
    //     data: {
    //       statutPaiement: 'PAID',
    //       latestInvoiceId: invoice.id,
    //     } as any,
    //   });
    // }
    private async handleClientInvoicePaid(invoice: Stripe.Invoice) {
    const anyInvoice = invoice as any;

    const subscriptionId: string | null =
      typeof anyInvoice.subscription === 'string'
        ? anyInvoice.subscription
        : typeof anyInvoice.subscription?.id === 'string'
          ? anyInvoice.subscription.id
          : typeof anyInvoice.subscription_details?.subscription === 'string'
            ? anyInvoice.subscription_details.subscription
            : null;

    if (!subscriptionId) return;

    const achat = await this.prisma.achatAbonnementClient.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
      orderBy: { dateAchat: 'desc' },
    });

    if (!achat) return;

    const paymentIntentId =
      typeof anyInvoice.payment_intent === 'string'
        ? anyInvoice.payment_intent
        : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.paiementAbonnementClient.upsert({
        where: { stripeInvoiceId: invoice.id },
        update: {},
        create: {
          entrepriseId: achat.entrepriseId,
          clientId: achat.clientId,
          achatClientId: achat.id,
          montant: invoice.amount_paid / 100,
          statutPaiement: 'PAID',
          stripeInvoiceId: invoice.id,
          paymentIntentId,
          stripeSubscriptionId: subscriptionId,
        },
      });

      await tx.achatAbonnementClient.update({
        where: { id: achat.id },
        data: {
          statutPaiement: 'PAID',
          latestInvoiceId: invoice.id,
        } as any,
      });
    });
  }

    private async handleEntrepriseInvoiceFailed(invoice: Stripe.Invoice) {
      const anyInvoice = invoice as any;

      const subscriptionId: string | null =
        typeof anyInvoice.subscription === 'string'
          ? anyInvoice.subscription
          : typeof anyInvoice.subscription?.id === 'string'
            ? anyInvoice.subscription.id
            : typeof anyInvoice.subscription_details?.subscription === 'string'
              ? anyInvoice.subscription_details.subscription
              : null;

      if (!subscriptionId) return;

      const achat = await this.prisma.achatAbonnement.findFirst({
        where: { stripeSubscriptionId: subscriptionId },
        orderBy: { dateAchat: 'desc' },
      });

      if (!achat) return;

      await this.prisma.achatAbonnement.update({
        where: { id: achat.id },
        data: {
          statutPaiement: 'FAILED',
          latestInvoiceId: invoice.id,
        } as any,
      });

     await this.prisma.entreprise.update({
  where: { id: achat.entrepriseId },
  data: {
    abonnementId: null,
    abonnementExpireLe: null,
  } as any,
});
    }

    private async handleClientInvoiceFailed(invoice: Stripe.Invoice) {
      const anyInvoice = invoice as any;

      const subscriptionId: string | null =
        typeof anyInvoice.subscription === 'string'
          ? anyInvoice.subscription
          : typeof anyInvoice.subscription?.id === 'string'
            ? anyInvoice.subscription.id
            : typeof anyInvoice.subscription_details?.subscription === 'string'
              ? anyInvoice.subscription_details.subscription
              : null;

      if (!subscriptionId) return;

      const achat = await this.prisma.achatAbonnementClient.findFirst({
        where: { stripeSubscriptionId: subscriptionId },
        orderBy: { dateAchat: 'desc' },
      });

      if (!achat) return;

      await this.prisma.achatAbonnementClient.update({
        where: { id: achat.id },
        data: {
          statutPaiement: 'FAILED',
          latestInvoiceId: invoice.id,
        } as any,
      });
    }

    private async handleEntrepriseSubscriptionDeleted(sub: Stripe.Subscription) {
      const subscriptionId = sub.id;

      const achat = await this.prisma.achatAbonnement.findFirst({
        where: { stripeSubscriptionId: subscriptionId },
        orderBy: { dateAchat: 'desc' },
      });

      if (!achat) return;

      await this.prisma.entreprise.update({
        where: { id: achat.entrepriseId },
        data: {
          abonnementId: null,
          abonnementExpireLe: null,
          stripeSubscriptionId: null,
          statut: 'SUSPENDUE',
        } as any,
      });
    }

    private async handleClientSubscriptionDeleted(sub: Stripe.Subscription) {
      const subscriptionId = sub.id;

      const achat = await this.prisma.achatAbonnementClient.findFirst({
        where: { stripeSubscriptionId: subscriptionId },
        orderBy: { dateAchat: 'desc' },
      });

      if (!achat) return;

      await this.prisma.achatAbonnementClient.update({
        where: { id: achat.id },
        data: {
          statutPaiement: 'FAILED',
        } as any,
      });
    }
  }