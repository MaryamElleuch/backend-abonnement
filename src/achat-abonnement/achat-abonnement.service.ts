import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
// Lazy load Prisma enums to avoid loading the stub at build time
const { RoleUtilisateur } = require('.prisma/client');

@Injectable()
export class AchatAbonnementService {
  constructor(private prisma: PrismaService) {}

  /**
   * Souscrire un abonnement pour une entreprise
   * @param entrepriseId ID de l'entreprise
   * @param abonnementId ID de l'abonnement choisi
   */
  // async acheterAbonnementEntreprise(entrepriseId: string, abonnementId: string) {
  //   // 1) Vérifier abonnement
  //   const abonnement = await this.prisma.abonnement.findUnique({
  //     where: { id: abonnementId },
  //   });
  //   if (!abonnement) throw new NotFoundException('Abonnement non trouvé');

  //   // 2) Vérifier entreprise
  //   const entreprise = await this.prisma.entreprise.findUnique({
  //     where: { id: entrepriseId },
  //   });
  //   if (!entreprise) throw new NotFoundException('Entreprise introuvable');

  //   // 3) Vérifier si l’entreprise a déjà un abonnement
  //   if (entreprise.abonnementId) {
  //     throw new BadRequestException('Cette entreprise possède déjà un abonnement actif');
  //   }

  //   // 4) Trouver un utilisateur "responsable" (PROPRIETAIRE ou DIRECTEUR) dans cette entreprise
  //   const responsable = await this.prisma.utilisateur.findFirst({
  //     where: {
  //       entrepriseId,
  //       role: { in: [RoleUtilisateur.PROPRIETAIRE, RoleUtilisateur.DIRECTEUR] },
  //     },
  //     select: { id: true, role: true },
  //   });

  //   if (!responsable) {
  //     throw new NotFoundException(
  //       'Aucun PROPRIETAIRE/DIRECTEUR trouvé pour cette entreprise',
  //     );
  //   }

  //   // 5) Créer l'achat
  //   // ⚠️ Ton schema AchatAbonnement.entrepriseId référence Utilisateur.id (pas Entreprise.id)
  //   const achat = await this.prisma.achatAbonnement.create({
  //     data: {
  //       entrepriseId: responsable.id, // ⚠️ lié à Utilisateur.id dans ton schema actuel
  //       abonnementId: abonnement.id,
  //       montant: abonnement.prix,
  //       statutPaiement: 'PAID',
  //     },
  //   });

  //   // 6) Mettre à jour l'abonnement de l'entreprise
  //   await this.prisma.entreprise.update({
  //     where: { id: entrepriseId },
  //     data: { abonnementId: abonnement.id },
  //   });

  //   return achat;
  // }

  /**
   * Récupérer les achats d’une entreprise
   * @param entrepriseId ID de l'entreprise
   */
  async getAchatsByEntreprise(entrepriseId: string) {
    // Vérifier entreprise
    const entreprise = await this.prisma.entreprise.findUnique({
      where: { id: entrepriseId },
    });
    if (!entreprise) throw new NotFoundException('Entreprise introuvable');

    // Trouver les responsables (utilisateurs) de l’entreprise
    const responsables = await this.prisma.utilisateur.findMany({
      where: {
        entrepriseId,
        role: { in: [RoleUtilisateur.PROPRIETAIRE, RoleUtilisateur.DIRECTEUR] },
      },
      select: { id: true },
    });

    const ids = responsables.map((r) => r.id);
    if (ids.length === 0) return [];

    // ⚠️ achatAbonnement.entrepriseId = Utilisateur.id dans ton schema
    return this.prisma.achatAbonnement.findMany({
      where: { entrepriseId: { in: ids } },
      include: { abonnement: true },
      orderBy: { dateAchat: 'desc' },
    });
  }
  // achat-abonnement.service.ts

  async verifierDroitsSuppression(
    achatId: string, 
    userId: string, 
    userRole: string, 
    userEntrepriseId: string | null
  ): Promise<boolean> {
    // Admin peut tout supprimer
    if (userRole === 'ADMINISTRATEUR') {
      return true;
    }

    // Récupérer l'achat avec l'entreprise
    const achat = await this.prisma.achatAbonnement.findUnique({
      where: { id: achatId },
      select: { 
        entrepriseId: true,
        entreprise: {
          select: {
            utilisateurs: {
              where: { 
                role: 'PROPRIETAIRE',
                statut: 'ACTIF'
              },
              select: { id: true }
            }
          }
        }
      }
    });

    if (!achat) {
      throw new NotFoundException('Achat introuvable');
    }

    // Vérifier si l'utilisateur est le propriétaire de l'entreprise
    if (userRole === 'PROPRIETAIRE') {
      // L'utilisateur doit appartenir à la même entreprise
      if (userEntrepriseId !== achat.entrepriseId) {
        return false;
      }

      // Vérifier que l'utilisateur est bien propriétaire de cette entreprise
      const estProprietaire = achat.entreprise.utilisateurs.some(u => u.id === userId);
      return estProprietaire;
    }

    // Les autres rôles n'ont pas le droit
    return false;
  }

  async deleteAchat(id: string) {
    const achat = await this.prisma.achatAbonnement.findUnique({
      where: { id },
      select: { 
        id: true, 
        entrepriseId: true, 
        stripeSubscriptionId: true,
        contrat: {
          select: { id: true }
        }
      },
    });

    if (!achat) throw new NotFoundException('Achat introuvable');

    return this.prisma.$transaction(async (tx) => {
      // 1) Supprimer les signatures liées au contrat (si existent)
      if (achat.contrat) {
        await tx.signature.deleteMany({
          where: { contratId: achat.contrat.id },
        });
      }

      // 2) Supprimer le contrat lié
      await tx.contratEntreprise.deleteMany({
        where: { achatId: id },
      });

      // 3) Optionnel : Annuler l'abonnement Stripe si nécessaire
      if (achat.stripeSubscriptionId) {
        // Tu peux appeler Stripe API pour annuler l'abonnement
        // await this.stripeService.cancelSubscription(achat.stripeSubscriptionId);
      }

      // 4) Mettre à jour l'entreprise (enlever la référence à l'abonnement)
      await tx.entreprise.update({
        where: { id: achat.entrepriseId },
        data: {
          abonnementId: null,
          stripeSubscriptionId: null,
          abonnementExpireLe: null,
        },
      });

      // 5) Supprimer l'achat
      return tx.achatAbonnement.delete({
        where: { id },
      });
    });
  }
}
