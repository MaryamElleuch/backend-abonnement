import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StripeService {
  public stripe: Stripe;

  constructor(private prisma: PrismaService) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY manquante dans .env');
    this.stripe = new Stripe(key, { apiVersion: '2026-01-28.clover' });
  }

  async createCheckoutSessionSubscription(entrepriseId: string, abonnementId: string) {
    const backUrl = process.env.BACK_URL || 'http://localhost:3000';

    // Récupération de l'entreprise avec propriétaire actif
    const entreprise = await this.prisma.entreprise.findUnique({
      where: { id: entrepriseId },
      select: {
        id: true,
        nom: true,
        stripeCustomerId: true,
        abonnementId: true,
        utilisateurs: {
          where: { role: 'PROPRIETAIRE', statut: 'ACTIF' },
          select: { id: true, email: true },
          take: 1,
        },
      },
    });

    if (!entreprise) {
      throw new NotFoundException('Entreprise introuvable');
    }

    if (entreprise.abonnementId) {
      throw new BadRequestException('Cette entreprise est déjà abonnée');
    }

    const proprietaire = entreprise.utilisateurs?.[0];
    if (!proprietaire?.email) {
      throw new BadRequestException(
        'Aucun propriétaire actif avec email valide trouvé pour cette entreprise',
      );
    }

    // Vérification abonnement
    const abonnement = await this.prisma.abonnement.findUnique({
      where: { id: abonnementId },
      select: { id: true, nom: true, prix: true, stripePriceId: true },
    });

    if (!abonnement) {
      throw new NotFoundException('Abonnement introuvable');
    }

    if (!abonnement.stripePriceId) {
      throw new BadRequestException(
        "L'abonnement n'a pas de stripePriceId configuré. Créez un Price dans Stripe et mettez à jour la base.",
      );
    }

    // Vérifier qu'il n'y a pas de paiement en cours
    const achatEnCours = await this.prisma.achatAbonnement.findFirst({
      where: { entrepriseId, statutPaiement: 'PENDING' },
      select: { id: true, stripeSessionId: true },
    });

    if (achatEnCours) {
      throw new BadRequestException('Un paiement est déjà en cours pour cet abonnement');
    }

    // Création de l'achat en base (état PENDING)
    const achat = await this.prisma.achatAbonnement.create({
      data: {
        entrepriseId,
        abonnementId,
        montant: abonnement.prix,
        statutPaiement: 'PENDING',
        utilisateurId: proprietaire.id,
      },
      select: { id: true },
    });

    let stripeCustomerId = entreprise.stripeCustomerId;

    // Création du customer Stripe si nécessaire
    if (!stripeCustomerId) {
      try {
        const customer = await this.stripe.customers.create({
          email: proprietaire.email,
          name: entreprise.nom,
          metadata: {
            entrepriseId,
            utilisateurId: proprietaire.id,
            createdBy: 'nestjs-backend',
          },
        });

        stripeCustomerId = customer.id;

        await this.prisma.entreprise.update({
          where: { id: entrepriseId },
          data: { stripeCustomerId },
        });
      } catch (err) {
        console.error('Erreur création customer Stripe:', err);
        throw new InternalServerErrorException('Erreur lors de la création du client Stripe');
      }
    }

    // Création de la session Checkout
    try {
      const session = await this.stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: stripeCustomerId,
        client_reference_id: achat.id,
        line_items: [{ price: abonnement.stripePriceId, quantity: 1 }],
        success_url: `${backUrl}/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${backUrl}/stripe/cancel?session_id={CHECKOUT_SESSION_ID}`,
        metadata: {
          type: 'ABO_PLATEFORME',
          entrepriseId,
          abonnementId,
          achatId: achat.id,
          utilisateurId: proprietaire.id,
        },
      });

      // Mise à jour de l'achat avec l'ID session
      await this.prisma.achatAbonnement.update({
        where: { id: achat.id },
        data: { stripeSessionId: session.id },
      });

      return session;
    } catch (err) {
      console.error('Erreur création session Stripe:', err);
      throw new InternalServerErrorException('Échec de la création de la session de paiement');
    }
  }

  /**
   * Récupère et formate les factures Stripe pour un customer donné
   */
  private async listInvoicesByCustomer(stripeCustomerId: string) {
    try {
      const invoices = await this.stripe.invoices.list({
        customer: stripeCustomerId,
        limit: 20,
        status: 'paid', // optionnel : tu peux retirer pour voir toutes les factures
      });

      return invoices.data.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        hostedInvoiceUrl: invoice.hosted_invoice_url,
        pdf: invoice.invoice_pdf,
        amountPaid: invoice.amount_paid,
        amountDue: invoice.amount_due,
        currency: invoice.currency?.toUpperCase(),
        created: invoice.created,
        periodStart: invoice.period_start,
        periodEnd: invoice.period_end,
      }));
    } catch (err) {
      console.error('Erreur récupération factures Stripe:', err);
      throw new InternalServerErrorException('Impossible de récupérer les factures depuis Stripe');
    }
  }

  /**
   * Liste les factures d'une entreprise
   */
  async listEntrepriseInvoices(entrepriseId: string) {
    const entreprise = await this.prisma.entreprise.findUnique({
      where: { id: entrepriseId },
      select: { stripeCustomerId: true },
    });

    if (!entreprise) {
      throw new NotFoundException('Entreprise introuvable');
    }

    if (!entreprise.stripeCustomerId) {
      return []; // Pas encore de compte Stripe → pas de factures
    }

    return this.listInvoicesByCustomer(entreprise.stripeCustomerId);
  }

  /**
   * Liste les factures d'un utilisateur client final
   */
  async listClientInvoices(userId: string) {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });

    if (!utilisateur) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    if (!utilisateur.stripeCustomerId) {
      return [];
    }

    return this.listInvoicesByCustomer(utilisateur.stripeCustomerId);
  }
}