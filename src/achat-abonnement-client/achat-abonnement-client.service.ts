import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';

@Injectable()
export class AchatAbonnementClientService {
  private stripe: Stripe;

  constructor(private readonly prisma: PrismaService) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY manquante');
    this.stripe = new Stripe(key, { apiVersion: '2026-01-28.clover' });
  }

async createCheckout(user: any, abonnementEntrepriseId: string) {
  if (!user?.id) throw new ForbiddenException('Non authentifié');

  // const backUrl = process.env.BACK_URL || 'http://localhost:3000';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  const dbUser = await this.prisma.utilisateur.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, nomComplet: true, stripeCustomerId: true },
  });
  if (!dbUser) throw new ForbiddenException('Utilisateur introuvable');

  const abo = await this.prisma.abonnementEntreprise.findUnique({
    where: { id: abonnementEntrepriseId },
    include: {
      entreprise: { select: { id: true, nom: true, statut: true } },
    },
  });

  if (!abo) throw new NotFoundException('Offre introuvable');
  if (!abo.actif) throw new BadRequestException('Offre inactive');
  if (abo.entreprise.statut !== 'ACTIVE') {
    throw new BadRequestException('Entreprise inactive');
  }

  if (!abo.stripePriceId) {
    throw new BadRequestException("Cette offre n'a pas de stripePriceId");
  }

  const achatExistant = await this.prisma.achatAbonnementClient.findFirst({
    where: {
      clientId: dbUser.id,
      abonnementEntrepriseId: abo.id,
      statutPaiement: { in: ['PENDING', 'PAID'] },
    },
    select: { id: true, statutPaiement: true },
  });

  if (achatExistant?.statutPaiement === 'PENDING') {
    throw new BadRequestException('Paiement déjà en cours');
  }
  if (achatExistant?.statutPaiement === 'PAID') {
    throw new BadRequestException('Abonnement déjà acheté');
  }

  const achat = await this.prisma.achatAbonnementClient.create({
    data: {
      entrepriseId: abo.entrepriseId,
      abonnementEntrepriseId: abo.id,
      clientId: dbUser.id,
      montant: abo.prix,
      statutPaiement: 'PENDING',
    },
    select: { id: true },
  });

  let stripeCustomerId = dbUser.stripeCustomerId;

  if (!stripeCustomerId) {
    const customer = await this.stripe.customers.create({
      email: dbUser.email,
      name: dbUser.nomComplet ?? undefined,
      metadata: { utilisateurId: dbUser.id, createdBy: 'client-checkout' },
    });

    stripeCustomerId = customer.id;

    await this.prisma.utilisateur.update({
      where: { id: dbUser.id },
      data: { stripeCustomerId },
    });
  }

  const session = await this.stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: stripeCustomerId,
    client_reference_id: achat.id,
    payment_method_types: ['card'],
    line_items: [
      {
        price: abo.stripePriceId,
        quantity: 1,
      },
    ],
    customer_update: { name: 'auto', address: 'auto' },
    // success_url: `${backUrl}/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
    // cancel_url: `${backUrl}/stripe/cancel?session_id={CHECKOUT_SESSION_ID}`,
    success_url: `${frontendUrl}/client/plans?payment=success&session_id={CHECKOUT_SESSION_ID}`,
cancel_url: `${frontendUrl}/client/plans?payment=cancel&session_id={CHECKOUT_SESSION_ID}`,
    metadata: {
      type: 'ABO_CLIENT',
      achatClientId: achat.id,
      abonnementEntrepriseId: abo.id,
      clientId: dbUser.id,
      entrepriseId: abo.entrepriseId,
    },
  });

  await this.prisma.achatAbonnementClient.update({
    where: { id: achat.id },
    data: {
      stripeSessionId: session.id,
    },
  });

  return session;
}

  async getMesAchats(clientId: string) {
    return this.prisma.achatAbonnementClient.findMany({
      where: { clientId },
      include: {
        abonnementEntreprise: {
          include: {
            entreprise: { select: { id: true, nom: true, slug: true } },
          },
        },
        entreprise: { select: { id: true, nom: true } },
      },
      orderBy: { dateAchat: 'desc' },
    });
  }

  async verifierAbonnementActif(
    clientId: string,
    abonnementEntrepriseId: string,
  ): Promise<boolean> {
    const achat = await this.prisma.achatAbonnementClient.findFirst({
      where: { clientId, abonnementEntrepriseId, statutPaiement: 'PAID' },
      select: { id: true },
    });
    return !!achat;
  }
}