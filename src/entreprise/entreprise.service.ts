import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';
import { interval } from 'rxjs';
// Lazy load Prisma enums to avoid loading the stub at build time
const { RoleUtilisateur } = require('.prisma/client');

@Injectable()
export class EntrepriseService {
    private stripe: Stripe;


  constructor(private readonly prisma: PrismaService) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-01-28.clover',
    });
  }  
  // 1) ✅ Toutes les entreprises (Admin)
  async getEntreprisesAvecAbonnement(userRole: string) {
    if (userRole !== 'ADMINISTRATEUR') {
      throw new ForbiddenException('Accès refusé');
    }

    return this.prisma.entreprise.findMany({
      select: {
        id: true,
        nom: true,
        slug: true,
        statut: true,
        dateCreation: true,

        utilisateurs: {
          where: { role: RoleUtilisateur.PROPRIETAIRE },
          select: { email: true, nomComplet: true },
          take: 1,
        },

        abonnementId: true,
        abonnement: {
          select: {
            id: true,
            nom: true,
            prix: true,
            duree: true,
            interval:true,
            actif: true,
          },
        },
      },
      orderBy: { dateCreation: 'desc' },
    });
  }

  // 2) ✅ Une entreprise (protégé dans controller)
  async getEntrepriseById(id: string) {
    const entreprise = await this.prisma.entreprise.findUnique({
      where: { id },
      select: {
        id: true,
        nom: true,
        slug: true,
        statut: true,
        dateCreation: true,

        utilisateurs: {
          where: { role: RoleUtilisateur.PROPRIETAIRE },
          select: { email: true, nomComplet: true },
          take: 1,
        },

        abonnementId: true,
        abonnement: {
          select: {
            id: true,
            nom: true,
            prix: true,
            duree: true,
            interval:true,
            actif: true,
          },
        },
      },
    });

    if (!entreprise) {
      throw new NotFoundException('Entreprise introuvable');
    }

    return entreprise;
  }

  // 3) ✅ Delete entreprise (Admin check fait dans controller)
async deleteEntreprise(id: string) {
    // 0) Charger entreprise
    const entreprise = await this.prisma.entreprise.findUnique({
      where: { id },
      select: {
        id: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    });

    if (!entreprise) throw new NotFoundException('Entreprise introuvable');

    // 1) Stripe (avant DB)
    // 1.1 cancel subscription directe si présente
    if (entreprise.stripeSubscriptionId) {
      try {
        const sub = await this.stripe.subscriptions.retrieve(
          entreprise.stripeSubscriptionId,
        );
        if ((sub as any)?.status !== 'canceled') {
          await this.stripe.subscriptions.cancel(entreprise.stripeSubscriptionId);
        }
      } catch (e: any) {
        console.log(
          '[DELETE ENTREPRISE] Stripe cancel subscription failed:',
          entreprise.stripeSubscriptionId,
          e?.message,
        );
      }
    }

    // 1.2 cancel toutes les subs du customer + delete customer
    if (entreprise.stripeCustomerId) {
      try {
        const subs = await this.stripe.subscriptions.list({
          customer: entreprise.stripeCustomerId,
          status: 'all',
          limit: 100,
        });

        for (const s of subs.data) {
          if (s.status !== 'canceled') {
            await this.stripe.subscriptions.cancel(s.id);
          }
        }

        await this.stripe.customers.del(entreprise.stripeCustomerId);
      } catch (e: any) {
        console.log(
          '[DELETE ENTREPRISE] Stripe delete customer failed:',
          entreprise.stripeCustomerId,
          e?.message,
        );
      }
    }

    // 2) DB (transaction)
    return this.prisma.$transaction(async (tx) => {
      // A) Contrat + signatures
      const contrat = await tx.contratEntreprise.findUnique({
        where: { entrepriseId: id },
        select: { id: true },
      });

      if (contrat) {
        await tx.signature.deleteMany({ where: { contratId: contrat.id } });
        await tx.contratEntreprise.delete({ where: { entrepriseId: id } });
      }

      // B) Achats client + achats entreprise
      await tx.achatAbonnementClient.deleteMany({ where: { entrepriseId: id } });
      await tx.achatAbonnement.deleteMany({ where: { entrepriseId: id } });

      // C) Offres de l’entreprise
      await tx.abonnementEntreprise.deleteMany({ where: { entrepriseId: id } });

      // D) ⚠️ IMPORTANT: neutraliser les FK vers Utilisateur (sinon deleteMany utilisateur peut échouer)
      // 1) signatures qui pointent vers signerUserId
      await tx.signature.updateMany({
        where: { signerUser: { entrepriseId: id } },
        data: { signerUserId: null },
      });

      // 2) achatAbonnement.utilisateurId
      await tx.achatAbonnement.updateMany({
        where: { utilisateur: { entrepriseId: id } },
        data: { utilisateurId: null },
      });

      // E) Supprimer TOUS les utilisateurs liés (propriétaire + clients + etc.)
      await tx.utilisateur.deleteMany({ where: { entrepriseId: id } });

      // F) Supprimer l’entreprise
      return tx.entreprise.delete({ where: { id } });
    });
  }



async getEntreprisesPayees(userRole: string) {
  if (userRole !== 'ADMINISTRATEUR') {
    throw new ForbiddenException('Accès refusé');
  }

  return this.prisma.entreprise.findMany({
    where: {
      // ✅ relation 1–1 => "is"
      achatAbonnement: {
        is: { statutPaiement: 'PAID' },
      },
      // (optionnel) tu peux aussi exiger abonnementId non null
      // abonnementId: { not: null },
    },
    select: {
      id: true,
      nom: true,
      slug: true,
      statut: true,
      dateCreation: true,

      utilisateurs: {
        where: { role: RoleUtilisateur.PROPRIETAIRE },
        select: { email: true, nomComplet: true },
        take: 1,
      },

      abonnementId: true,
      abonnement: {
        select: { id: true, nom: true, prix: true, duree: true,interval:true ,  actif: true },
      },

      // ✅ relation 1–1 => pas de take/orderBy
      achatAbonnement: {
        select: {
          statutPaiement: true,
          montant: true,
          dateAchat: true,
          stripeSessionId: true,
          paymentIntentId: true,
        },
      },
    },
    orderBy: { dateCreation: 'desc' },
  });
}
async listClientsOfMyEntreprise(user: any) {
    // rôles qui peuvent voir la liste
    const allowed = ['PROPRIETAIRE', 'DIRECTEUR', 'COMPTABLE', 'EMPLOYE', 'ADMINISTRATEUR'];
    if (!user || !allowed.includes(user.role)) throw new ForbiddenException('Accès refusé');

    // si pas admin => doit avoir entrepriseId
    if (user.role !== 'ADMINISTRATEUR' && !user.entrepriseId) {
      throw new ForbiddenException('Aucune entreprise associée');
    }

    const entrepriseId = user.entrepriseId;

    return this.prisma.utilisateur.findMany({
      where: {
        entrepriseId,
        role: RoleUtilisateur.CLIENT,
      },
      select: {
        id: true,
        email: true,
        nomComplet: true,
        statut: true,
        emailVerifie: true,
        tel: true,
        telVerifie: true,
        dateCreation: true,
      },
       orderBy: { dateCreation: 'desc' },
    });
  }
 async getEntreprisesNonPayees(userRole: string) {
  if (userRole !== 'ADMINISTRATEUR') {
    throw new ForbiddenException('Accès refusé');
  }

  const entreprises = await this.prisma.entreprise.findMany({
    where: {
      OR: [
        { achatAbonnement: { is: null } },
        { achatAbonnement: { isNot: { statutPaiement: 'PAID' } } },
      ],
    },
    select: {
      id: true,
      nom: true,
      slug: true,
      statut: true,
      dateCreation: true,

      utilisateurs: {
        where: { role: RoleUtilisateur.PROPRIETAIRE },
        select: { email: true, nomComplet: true },
        take: 1,
      },

      achatAbonnement: {
        select: {
          statutPaiement: true,
          montant: true,
          dateAchat: true,
        },
      },
    },
    orderBy: { dateCreation: 'desc' },
  });

  // ✅ si aucun résultat
  if (entreprises.length === 0) {
    return {
      message: 'Aucune entreprise non payée. Toutes les entreprises sont payées ✅',
      data: [],
      count: 0,
    };
  }

  return {
    message: 'Liste des entreprises non payées',
    data: entreprises,
    count: entreprises.length,
  };
}
  async deleteClientFinal(user: any, clientId: string) {
    const allowed = ['PROPRIETAIRE', 'DIRECTEUR'];
    if (!user || !allowed.includes(user.role)) {
      throw new ForbiddenException(
        'Seul le propriétaire ou directeur peut supprimer un client',
      );
    }

    if (!user.entrepriseId) {
      throw new ForbiddenException('Aucune entreprise associée');
    }

    const client = await this.prisma.utilisateur.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        role: true,
        entrepriseId: true,
        stripeCustomerId: true, // ✅ pour suppression Stripe
      },
    });

    if (!client) throw new NotFoundException('Client introuvable');
    if (client.role !== 'CLIENT') {
      throw new ForbiddenException("Cet utilisateur n'est pas un client");
    }

    if (client.entrepriseId !== user.entrepriseId) {
      throw new ForbiddenException(
        'Vous ne pouvez supprimer que les clients de votre entreprise',
      );
    }

    // ✅ Transaction DB (et Stripe avant / pendant avec try-catch)
    // Idée: si Stripe échoue, on peut quand même supprimer DB (ou bloquer).
    // Ici: on ESSAIE Stripe, mais on ne bloque pas DB si Stripe échoue.
    if (client.stripeCustomerId) {
      try {
        // 1) Annuler subscriptions liées au customer (si existantes)
        const subs = await this.stripe.subscriptions.list({
          customer: client.stripeCustomerId,
          status: 'all',
          limit: 100,
        });

        for (const s of subs.data) {
          // évite double cancel
          if (s.status !== 'canceled') {
            await this.stripe.subscriptions.cancel(s.id);
          }
        }

        // 2) Supprimer customer Stripe (marqué deleted)
        await this.stripe.customers.del(client.stripeCustomerId);
      } catch (e: any) {
        console.log(
          '[DELETE CLIENT] Stripe delete failed:',
          client.stripeCustomerId,
          e?.message,
        );
        // Si tu veux BLOQUER suppression DB quand Stripe échoue, décommente :
        // throw new BadRequestException("Impossible de supprimer le customer Stripe");
      }
    }

    // ✅ DB: supprimer achats + user
    await this.prisma.$transaction(async (tx) => {
      await tx.achatAbonnementClient.deleteMany({
        where: { clientId: client.id },
      });

      // (Optionnel) si tu as d'autres tables liées au client, supprime-les ici

      await tx.utilisateur.delete({
        where: { id: client.id },
      });
    });

    return {
      message: 'Client supprimé (DB + Stripe)',
      id: client.id,
    };
  }
}