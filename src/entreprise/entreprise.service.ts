import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';
import { interval } from 'rxjs';
// Lazy load Prisma enums to avoid loading the stub at build time
import { RoleUtilisateur } from '@prisma/client';

@Injectable()
export class EntrepriseService {
    private stripe: Stripe;


  constructor(private readonly prisma: PrismaService) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-01-28.clover',
    });
  }  
  // 1) ✅ Toutes les entreprises (Admin)
//   async getEntreprisesAvecAbonnement(userRole: string) {
//     if (userRole !== 'ADMINISTRATEUR') {
//       throw new ForbiddenException('Accès refusé');
//     }

//     // return this.prisma.entreprise.findMany({
//     //   select: {
//     //     id: true,
//     //     nom: true,
//     //     slug: true,
//     //     statut: true,
//     //     dateCreation: true,

//     //     utilisateurs: {
//     //       where: { role: RoleUtilisateur.PROPRIETAIRE },
//     //       select: { email: true, nomComplet: true },
//     //       take: 1,
//     //     },

//     //     abonnementId: true,
//     //     abonnement: {
//     //       select: {
//     //         id: true,
//     //         nom: true,
//     //         prix: true,
//     //         duree: true,
//     //         interval:true,
//     //         actif: true,
//     //       },
//     //     },
//     //   },
//     //   orderBy: { dateCreation: 'desc' },
//     // });
//   return this.prisma.entreprise.findMany({
//   select: {
//     id: true,
//     nom: true,
//     slug: true,
//     statut: true,
//     dateCreation: true,

//     utilisateurs: {
//       where: { role: RoleUtilisateur.PROPRIETAIRE },
//       select: { email: true, nomComplet: true },
//       take: 1,
//     },

//     abonnementId: true,
//     abonnement: {
//       select: {
//         id: true,
//         nom: true,
//         prix: true,
//         duree: true,
//         interval: true,
//         actif: true,
//       },
//     },

//     contrat: {
//       select: {
//         statut: true,
//       },
//     },
//   },
//   orderBy: { dateCreation: 'desc' },
// });
//   }
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
        select: { email: true, nomComplet: true , tel:true },
        take: 1,
      },

      abonnementId: true,
      abonnement: {
        select: {
          id: true,
          nom: true,
          prix: true,
          duree: true,
          interval: true,
          actif: true,
        },
      },

      contrat: {
        select: {
          statut: true,
        },
      },
    },
    orderBy: { dateCreation: 'desc' },
  });
}

  // 2) ✅ Une entreprise (protégé dans controller)
// Dans entreprise.service.ts
async getEntrepriseById(id: string) {
  const entreprise = await this.prisma.entreprise.findUnique({
    where: { id },
    select: {
      id: true,
      nom: true,
      slug: true,
      logo:true , 
      couleurPrincipale: true, 
      statut: true,
      dateCreation: true,

      utilisateurs: {
        where: { role: RoleUtilisateur.PROPRIETAIRE },
        select: { email: true, nomComplet: true , tel:true },
        take: 1,
      },

      abonnementId: true,
      abonnement: {
        select: {
          id: true,
          nom: true,
          prix: true,
          duree: true,
          interval: true,
          actif: true,
        },
      },

      contrat: {
        select: {
          id: true,
          statut: true,
          signeLe: true,
          signatures: {  // ✅ Important: inclure les signatures
            select: {
              id: true,
              signatureImage: true,
              signedAt: true,
              methode: true,
              signerUser: {
                select: {
                  id: true,
                  nomComplet: true,
                  email: true,
                },
              },
            },
            orderBy: {
              signedAt: 'desc',
            },
          },
        },
      },
    },
  });

  if (!entreprise) {
    throw new NotFoundException('Entreprise introuvable');
  }

return {
  ...entreprise,
  email: entreprise.utilisateurs?.[0]?.email || '',
  telephone: entreprise.utilisateurs?.[0]?.tel || '',
};}

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
        select: { email: true, nomComplet: true ,     tel: true,
 },
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
        select: { email: true, nomComplet: true , tel:true },
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
//   async getDashboardStats() {

//   const totalEntreprises = await this.prisma.entreprise.count();

//   const actives = await this.prisma.entreprise.count({
//     where: { statut: 'ACTIVE' },
//   });

//   const paiements = await this.prisma.achatAbonnement.count({
//     where: { statutPaiement: 'PAID' },
//   });

//   const revenus = await this.prisma.achatAbonnement.aggregate({
//     _sum: {
//       montant: true,
//     },
//   });

//   return {
//     totalEntreprises,
//     actives,
//     paiements,
//     revenus: revenus._sum.montant || 0,
//   };
// }
// async getRevenueStats(type: 'DAY' | 'MONTH' | 'YEAR' = 'MONTH') {
//   const data = await this.prisma.achatAbonnement.findMany({
//     where: { statutPaiement: 'PAID' },
//     select: {
//       montant: true,
//       dateAchat: true,
//     },
//   });

//   const grouped = {};

//   for (const item of data) {
//     let key;

//     if (type === 'DAY') {
//       key = item.dateAchat.toISOString().slice(0, 10); // YYYY-MM-DD
//     } else if (type === 'MONTH') {
//       key = item.dateAchat.toISOString().slice(0, 7); // YYYY-MM
//     } else {
//       key = item.dateAchat.getFullYear().toString(); // YYYY
//     }

//     grouped[key] = (grouped[key] || 0) + item.montant;
//   }

//   return Object.entries(grouped).map(([label, total]) => ({
//     label,
//     total,
//   }));
// }
// // ====================== DASHBOARD POUR L'ENTREPRISE (PROPRIÉTAIRE) ======================
// async getStripeRevenue(entrepriseId: string) {
//   const entreprise = await this.prisma.entreprise.findUnique({
//     where: { id: entrepriseId },
//     select: { stripeCustomerId: true },
//   });

//   if (!entreprise?.stripeCustomerId) return 0;

//   const invoices = await this.stripe.invoices.list({
//     customer: entreprise.stripeCustomerId,
//     status: 'paid',
//     limit: 100,
//   });

//   const total = invoices.data.reduce(
//     (sum, inv) => sum + (inv.amount_paid || 0),
//     0,
//   );

//   return total / 100;
// }
// async getMyDashboard(user: any) {
//     if (!user?.entrepriseId) {
//       throw new ForbiddenException('Aucune entreprise associée à cet utilisateur');
//     }

//     const entrepriseId = user.entrepriseId;

//     // Informations de l'entreprise + son abonnement
//     const entreprise = await this.prisma.entreprise.findUnique({
//       where: { id: entrepriseId },
//       select: {
//         id: true,
//         nom: true,
//         statut: true,
//         dateCreation: true,
//         abonnementExpireLe: true,
//         abonnement: {
//           select: {
//             nom: true,
//             prix: true,
//             duree: true,
//             interval: true,
//           },
//         },
//         achatAbonnement: {
//           select: {
//             statutPaiement: true,
//             montant: true,
//             dateAchat: true,
//           },
//         },
//       },
//     });

//     // Statistiques des clients
//     const totalClients = await this.prisma.utilisateur.count({
//       where: { entrepriseId, role: RoleUtilisateur.CLIENT },
//     });

//     const clientsActifs = await this.prisma.utilisateur.count({
//       where: { 
//         entrepriseId, 
//         role: RoleUtilisateur.CLIENT,
//         statut: 'ACTIF' 
//       },
//     });

//     // Revenus générés par les clients
//     const revenusClients = await this.prisma.achatAbonnementClient.aggregate({
//       where: { 
//         entrepriseId,
//         statutPaiement: 'PAID' 
//       },
//       _sum: { montant: true },
//     });

//     // Derniers paiements clients
//     const derniersPaiements = await this.prisma.achatAbonnementClient.findMany({
//       where: { entrepriseId, statutPaiement: 'PAID' },
//       take: 5,
//       orderBy: { dateAchat: 'desc' },
//       select: {
//         montant: true,
//         dateAchat: true,
//         client: {
//           select: { nomComplet: true, email: true },
//         },
//       },
//     });

//     return {
//       entreprise,
//       stats: {
//         totalClients,
//         clientsActifs,
//         revenusGeneres: revenusClients._sum.montant || 0,
//       },
//       derniersPaiements,
//     };
//   }

//   // Revenus mensuels des clients de l'entreprise
//   async getMyRevenueStats(entrepriseId: string, type: 'MONTH' | 'YEAR' = 'MONTH') {
//     const data = await this.prisma.achatAbonnementClient.findMany({
//       where: { 
//         entrepriseId,
//         statutPaiement: 'PAID' 
//       },
//       select: { montant: true, dateAchat: true },
//     });

//     const grouped = {};

//     for (const item of data) {
//       let key = type === 'MONTH' 
//         ? item.dateAchat.toISOString().slice(0, 7) 
//         : item.dateAchat.getFullYear().toString();

//       grouped[key] = (grouped[key] || 0) + Number(item.montant);
//     }

//     return Object.entries(grouped)
//       .map(([label, total]) => ({ label, total }))
//       .sort((a, b) => a.label.localeCompare(b.label));
//   }
// =====================================================
  // OUTILS COMMUNS STRIPE
  // =====================================================

//   private async listAllPaidInvoicesByCustomer(customerId: string): Promise<Stripe.Invoice[]> {
//     const allInvoices: Stripe.Invoice[] = [];
//     let startingAfter: string | undefined = undefined;
//     let hasMore = true;

//     // while (hasMore) {
//     //   const invoices = await this.stripe.invoices.list({
//     //     customer: customerId,
//     //     status: 'paid',
//     //     limit: 100,
//     //     ...(startingAfter ? { starting_after: startingAfter } : {}),
//     //   });

//     //   allInvoices.push(...invoices.data);

//     //   hasMore = invoices.has_more;
//     //   startingAfter = hasMore
//     //     ? invoices.data[invoices.data.length - 1]?.id
//     //     : undefined;
//     // }
//     const invoices = await this.stripe.invoices.list({
//   customer: customerId,
//   status: 'paid',
//   limit: 10, // 🔥 IMPORTANT
// });
//     return allInvoices;
//   }
private async listAllPaidInvoicesByCustomer(customerId: string): Promise<Stripe.Invoice[]> {
  const invoices = await this.stripe.invoices.list({
    customer: customerId,
    status: 'paid',
    limit: 10, // ✅ limite
  });

  return invoices.data; // 🔥 CORRECTION
}

  private async sumPaidInvoicesByCustomerIds(customerIds: string[]): Promise<number> {
    let total = 0;

    for (const customerId of customerIds) {
      if (!customerId) continue;

      const invoices = await this.listAllPaidInvoicesByCustomer(customerId);

      total += invoices.reduce((sum, inv) => {
        return sum + (inv.amount_paid || 0);
      }, 0);
    }

    return total / 100; // Stripe retourne en centimes
  }

  private getDateLabelFromUnix(
    unixSeconds: number,
    type: 'DAY' | 'MONTH' | 'YEAR',
  ): string {
    const date = new Date(unixSeconds * 1000);

    if (type === 'DAY') {
      return date.toISOString().slice(0, 10); // YYYY-MM-DD
    }

    if (type === 'MONTH') {
      return date.toISOString().slice(0, 7); // YYYY-MM
    }

    return date.getFullYear().toString(); // YYYY
  }

  private async groupPaidInvoicesByCustomerIds(
    customerIds: string[],
    type: 'DAY' | 'MONTH' | 'YEAR' = 'MONTH',
  ) {
    const grouped: Record<string, number> = {};

    for (const customerId of customerIds) {
      if (!customerId) continue;

      const invoices = await this.listAllPaidInvoicesByCustomer(customerId);

      for (const inv of invoices) {
        const paidAt = inv.status_transitions?.paid_at;

        if (!paidAt) continue;

        const label = this.getDateLabelFromUnix(paidAt, type);
        grouped[label] = (grouped[label] || 0) + (inv.amount_paid || 0) / 100;
      }
    }

    return Object.entries(grouped)
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  // =====================================================
  // 1) REVENUS ADMIN = FACTURES STRIPE DES ENTREPRISES
  // =====================================================

  async getAdminRevenueFromEntrepriseInvoices(): Promise<number> {
    const entreprises = await this.prisma.entreprise.findMany({
      where: {
        stripeCustomerId: { not: null },
      },
      select: {
        stripeCustomerId: true,
      },
    });

    const customerIds = entreprises
      .map((e) => e.stripeCustomerId)
      .filter((id): id is string => !!id);

    return this.sumPaidInvoicesByCustomerIds(customerIds);
  }

  async getAdminRevenueStats(type: 'DAY' | 'MONTH' | 'YEAR' = 'MONTH') {
    const entreprises = await this.prisma.entreprise.findMany({
      where: {
        stripeCustomerId: { not: null },
      },
      select: {
        stripeCustomerId: true,
      },
    });

    const customerIds = entreprises
      .map((e) => e.stripeCustomerId)
      .filter((id): id is string => !!id);

    return this.groupPaidInvoicesByCustomerIds(customerIds, type);
  }

  // async getDashboardStats() {
  //   const totalEntreprises = await this.prisma.entreprise.count();

  //   const actives = await this.prisma.entreprise.count({
  //     where: { statut: 'ACTIVE' },
  //   });

  //   const paiements = await this.prisma.achatAbonnement.count({
  //     where: { statutPaiement: 'PAID' },
  //   });

  //   const revenus = await this.getAdminRevenueFromEntrepriseInvoices();

  //   return {
  //     totalEntreprises,
  //     actives,
  //     paiements,
  //     revenus,
  //   };
  // }
//   async getDashboardStats() {
//   const totalEntreprises = await this.prisma.entreprise.count();

//   const actives = await this.prisma.entreprise.count({
//     where: { statut: 'ACTIVE' },
//   });

//   const paiements = await this.prisma.paiementAbonnementClient.count({
//     where: { statutPaiement: 'PAID' },
//   });

//   const revenusAgg = await this.prisma.paiementAbonnementClient.aggregate({
//     where: { statutPaiement: 'PAID' },
//     _sum: { montant: true },
//   });

//   return {
//     totalEntreprises,
//     actives,
//     paiements,
//     revenus: revenusAgg._sum.montant || 0,
//   };
// }

async getDashboardStats() {
  const totalEntreprises = await this.prisma.entreprise.count();

  const actives = await this.prisma.entreprise.count({
    where: { statut: 'ACTIVE' },
  });

  const paiements = await this.prisma.paiementAbonnementEntreprise.count({
    where: { statutPaiement: 'PAID' },
  });

  const revenusAgg = await this.prisma.paiementAbonnementEntreprise.aggregate({
    where: { statutPaiement: 'PAID' },
    _sum: { montant: true },
  });

  return {
    totalEntreprises,
    actives,
    paiements,
    revenus: revenusAgg._sum.montant || 0,
  };
}

  async getRevenueStats(type: 'DAY' | 'MONTH' | 'YEAR' = 'MONTH') {
  const data = await this.prisma.paiementAbonnementEntreprise.findMany({
    where: { statutPaiement: 'PAID' },
    select: {
      montant: true,
      datePaiement: true,
    },
  });

  const grouped: Record<string, number> = {};

  for (const item of data) {
    let key: string;

    if (type === 'DAY') {
      key = item.datePaiement.toISOString().slice(0, 10);
    } else if (type === 'MONTH') {
      key = item.datePaiement.toISOString().slice(0, 7);
    } else {
      key = item.datePaiement.getFullYear().toString();
    }

    grouped[key] = (grouped[key] || 0) + Number(item.montant || 0);
  }

  return Object.entries(grouped)
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

  // =====================================================
  // 2) REVENUS ENTREPRISE = FACTURES STRIPE DE SES CLIENTS
  // =====================================================

  async getEntrepriseRevenueFromClientInvoices(entrepriseId: string): Promise<number> {
    const clients = await this.prisma.utilisateur.findMany({
      where: {
        entrepriseId,
        role: RoleUtilisateur.CLIENT,
        stripeCustomerId: { not: null },
      },
      select: {
        stripeCustomerId: true,
      },
    });

    const customerIds = clients
      .map((c) => c.stripeCustomerId)
      .filter((id): id is string => !!id);

    return this.sumPaidInvoicesByCustomerIds(customerIds);
  }

  async getEntrepriseRevenueStatsFromClientInvoices(
    entrepriseId: string,
    type: 'DAY' | 'MONTH' | 'YEAR' = 'MONTH',
  ) {
    const clients = await this.prisma.utilisateur.findMany({
      where: {
        entrepriseId,
        role: RoleUtilisateur.CLIENT,
        stripeCustomerId: { not: null },
      },
      select: {
        stripeCustomerId: true,
      },
    });

    const customerIds = clients
      .map((c) => c.stripeCustomerId)
      .filter((id): id is string => !!id);

    return this.groupPaidInvoicesByCustomerIds(customerIds, type);
  }

  // =====================================================
  // DASHBOARD ENTREPRISE
  // =====================================================

  async getMyDashboard(user: any) {
    if (!user?.entrepriseId) {
      throw new ForbiddenException('Aucune entreprise associée à cet utilisateur');
    }

    const entrepriseId = user.entrepriseId;

    const entreprise = await this.prisma.entreprise.findUnique({
      where: { id: entrepriseId },
      select: {
        id: true,
        nom: true,
        statut: true,
        dateCreation: true,
        abonnementExpireLe: true,
        abonnement: {
          select: {
            nom: true,
            prix: true,
            duree: true,
            interval: true,
          },
        },
        achatAbonnement: {
          select: {
            statutPaiement: true,
            montant: true,
            dateAchat: true,
          },
        },
      },
    });

    const totalClients = await this.prisma.utilisateur.count({
      where: { entrepriseId, role: RoleUtilisateur.CLIENT },
    });

    const clientsActifs = await this.prisma.utilisateur.count({
      where: {
        entrepriseId,
        role: RoleUtilisateur.CLIENT,
        statut: 'ACTIF',
      },
    });

    // ✅ CORRIGÉ : revenus basés sur les factures Stripe des clients de l’entreprise
const revenusAgg = await this.prisma.paiementAbonnementClient.aggregate({
  where: {
    entrepriseId,
    statutPaiement: 'PAID',
  },
  _sum: { montant: true },
});

const revenusGeneres = revenusAgg._sum.montant || 0;
    const derniersPaiements = await this.prisma.paiementAbonnementClient.findMany({
      where: { entrepriseId, statutPaiement: 'PAID' },
      take: 5,
      orderBy: { datePaiement: 'desc' },
      select: {
        montant: true,
        datePaiement: true,
        client: {
          select: { nomComplet: true, email: true },
        },
      },
    });
    const clients = await this.prisma.utilisateur.findMany({
  where: {
    entrepriseId,
    role: RoleUtilisateur.CLIENT,
  },
  select: {
    dateCreation: true,
  },
});

const nouveauxClientsParMois: Record<string, number> = {};

for (let mois = 0; mois < 12; mois++) {
  const key = `${new Date().getFullYear()}-${String(mois + 1).padStart(2, '0')}`;
  nouveauxClientsParMois[key] = 0;
}

for (const client of clients) {
  const d = new Date(client.dateCreation);
  const mois = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  nouveauxClientsParMois[mois] =
    (nouveauxClientsParMois[mois] || 0) + 1;
}

const moisNames = [
  'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
  'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc',
];

const nouveauxClients = Object.entries(nouveauxClientsParMois).map(
  ([label, total]) => {
    const monthIndex = Number(label.split('-')[1]) - 1;

    return {
      label: moisNames[monthIndex],
      total,
    };
  },
);

    return {
      entreprise,
      stats: {
        totalClients,
        clientsActifs,
        revenusGeneres,
      },
      derniersPaiements,
        nouveauxClients,
    };
  }

  // async getMyRevenueStats(
  //   entrepriseId: string,
  //   type: 'DAY' | 'MONTH' | 'YEAR' = 'MONTH',
  // ) {
  //   return this.getEntrepriseRevenueStatsFromClientInvoices(entrepriseId, type);
  // }
  async getMyRevenueStats(
  entrepriseId: string,
  type: 'DAY' | 'MONTH' | 'YEAR' = 'MONTH',
) {
  const data = await this.prisma.paiementAbonnementClient.findMany({
    where: {
      entrepriseId,
      statutPaiement: 'PAID',
    },
    select: {
      montant: true,
      datePaiement: true,
    },
  });

  const grouped: Record<string, number> = {};

  for (const item of data) {
    let key: string;

    const d = new Date(item.datePaiement);

    if (type === 'DAY') {
      key = d.toISOString().slice(0, 10);
    } else if (type === 'MONTH') {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    } else {
      key = d.getFullYear().toString();
    }

    grouped[key] = (grouped[key] || 0) + Number(item.montant || 0);
  }

  return Object.entries(grouped)
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
async getEntrepriseBySlug(slug: string) {
  const entreprise = await this.prisma.entreprise.findUnique({
    where: { slug: slug.toLowerCase() },
    select: {
      id: true,
      nom: true,
      slug: true,
      logo: true,
      couleurPrincipale: true,
      statut: true,
    },
  });

  if (!entreprise) {
    throw new NotFoundException('Entreprise introuvable');
  }

return {
  ...entreprise,
  email: entreprise.utilisateurs?.[0]?.email || '',
  telephone: entreprise.utilisateurs?.[0]?.tel || '',
};
}
// async updateMyEntreprise(user: any, data: any, file?: any) {
//     if (!user?.entrepriseId) {
//     throw new ForbiddenException('Aucune entreprise associée');
//   }

//   let logoPath = data.logo;

//   // ✅ Si un fichier est uploadé → utiliser le fichier
//   if (file) {
//     logoPath = `/uploads/logos/${file.filename}`;
//   }

//   return this.prisma.entreprise.update({
//     where: { id: user.entrepriseId },
//     data: {
//       nom: data.nom,
//       logo: logoPath,
//       couleurPrincipale: data.couleurPrincipale,
//        email: data.email,       
//   telephone: data.telephone, 
//     },
//     select: {
//       id: true,
//       nom: true,
//       slug: true,
//       logo: true,
//       couleurPrincipale: true,
//       statut: true,
//       email: true,       
//       telephone: true, 
//     },
//   });
// }
async updateMyEntreprise(user: any, data: any, file?: any) {
  if (!user?.entrepriseId) {
    throw new ForbiddenException('Aucune entreprise associée');
  }

  const updateData: any = {
    nom: data.nom,
  };

  if (data.couleurPrincipale) {
    updateData.couleurPrincipale = data.couleurPrincipale;
  }

  if (file) {
    updateData.logo = `/uploads/logos/${file.filename}`;
  }

  // ✅ 1. update entreprise
  const entreprise = await this.prisma.entreprise.update({
    where: { id: user.entrepriseId },
    data: updateData,
  });

  // ✅ 2. update utilisateur propriétaire
  await this.prisma.utilisateur.updateMany({
    where: {
      entrepriseId: user.entrepriseId,
      role: RoleUtilisateur.PROPRIETAIRE,
    },
    data: {
      email: data.email,
      tel: data.telephone,
    },
  });

  // ✅ 3. retourner données complètes
  return this.getEntrepriseById(user.entrepriseId);
}
async archiveClient(user: any, clientId: string) {
  const allowed = ['PROPRIETAIRE', 'DIRECTEUR'];

  if (!user || !allowed.includes(user.role)) {
    throw new ForbiddenException(
      'Seul le propriétaire ou directeur peut archiver un client',
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
      statut: true,
    },
  });

  if (!client) {
    throw new NotFoundException('Client introuvable');
  }

  if (client.role !== RoleUtilisateur.CLIENT) {
    throw new ForbiddenException("Cet utilisateur n'est pas un client");
  }

  if (client.entrepriseId !== user.entrepriseId) {
    throw new ForbiddenException(
      'Vous ne pouvez archiver que les clients de votre entreprise',
    );
  }

  return this.prisma.utilisateur.update({
    where: { id: clientId },
    data: {
      statut: 'BLOQUE',
    },
    select: {
      id: true,
      email: true,
      nomComplet: true,
      statut: true,
    },
  });
}
async getOffresPubliquesBySlug(slug: string) {
  const entreprise = await this.prisma.entreprise.findUnique({
    where: { slug: slug.trim().toLowerCase() },
    select: { id: true },
  });

  if (!entreprise) {
    throw new NotFoundException('Entreprise introuvable');
  }

  return this.prisma.abonnementEntreprise.findMany({
    where: {
      entrepriseId: entreprise.id,
      actif: true,
    },
    select: {
      id: true,
      nom: true,
      description: true,
      prix: true,
      duree: true,
      interval: true,
      actif: true,
    },
    orderBy: {
      dateCreation: 'desc',
    },
  });
}
// async suspendEntreprise(id: string) {
//   const entreprise = await this.prisma.entreprise.findUnique({
//     where: { id },
//   });

//   if (!entreprise) {
//     throw new NotFoundException('Entreprise introuvable');
//   }

//   return this.prisma.entreprise.update({
//     where: { id },
//     data: {
//       statut: 'SUSPENDUE', // ⚠️ correspond à ton enum
//     },
//   });
// }
// async suspendEntreprise(id: string) {
//   const entreprise = await this.prisma.entreprise.findUnique({
//     where: { id },
//     select: {
//       id: true,
//       stripeCustomerId: true,
//       stripeSubscriptionId: true,
//     },
//   });

//   if (!entreprise) {
//     throw new NotFoundException('Entreprise introuvable');
//   }

//   // 1) Suspendre / annuler les abonnements Stripe
//   if (entreprise.stripeSubscriptionId) {
//     try {
//       const sub = await this.stripe.subscriptions.retrieve(
//         entreprise.stripeSubscriptionId,
//       );

//       if (sub.status !== 'canceled') {
//         await this.stripe.subscriptions.cancel(entreprise.stripeSubscriptionId);
//       }
//     } catch (e: any) {
//       console.log('[SUSPEND ENTREPRISE] Stripe subscription cancel failed:', e?.message);
//     }
//   }

//   // 2) Annuler toutes les subscriptions du customer Stripe
//   if (entreprise.stripeCustomerId) {
//     try {
//       const subs = await this.stripe.subscriptions.list({
//         customer: entreprise.stripeCustomerId,
//         status: 'all',
//         limit: 100,
//       });

//       for (const s of subs.data) {
//         if (s.status !== 'canceled') {
//           await this.stripe.subscriptions.cancel(s.id);
//         }
//       }
//     } catch (e: any) {
//       console.log('[SUSPEND ENTREPRISE] Stripe customer subs cancel failed:', e?.message);
//     }
//   }

//   // 3) Archiver / désactiver les abonnements de l’entreprise + bloquer users
//   return this.prisma.$transaction(async (tx) => {
//     await tx.abonnementEntreprise.updateMany({
//       where: { entrepriseId: id },
//       data: { actif: false },
//     });

//     await tx.utilisateur.updateMany({
//       where: { entrepriseId: id },
//       data: { statut: 'SUSPENDU' }, // adapte selon ton enum: SUSPENDU / SUSPENDUE / INACTIF
//     });

//     return tx.entreprise.update({
//       where: { id },
//       data: {
//         statut: 'SUSPENDUE',
//       },
//     });
//   });
// }
async suspendEntreprise(id: string) {
  const entreprise = await this.prisma.entreprise.findUnique({
    where: { id },
    select: {
      id: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });

  if (!entreprise) {
    throw new NotFoundException('Entreprise introuvable');
  }

  // 1) Annuler la subscription principale Stripe
  if (entreprise.stripeSubscriptionId) {
    try {
      const sub = await this.stripe.subscriptions.retrieve(
        entreprise.stripeSubscriptionId,
      );

      if (sub.status !== 'canceled') {
        await this.stripe.subscriptions.cancel(entreprise.stripeSubscriptionId);
      }
    } catch (e: any) {
      console.log(
        '[SUSPEND ENTREPRISE] Stripe subscription cancel failed:',
        e?.message,
      );
    }
  }

  // 2) Annuler toutes les subscriptions du customer Stripe
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
    } catch (e: any) {
      console.log(
        '[SUSPEND ENTREPRISE] Stripe customer subs cancel failed:',
        e?.message,
      );
    }
  }

  // 3) Annuler toutes les factures ouvertes Stripe
  if (entreprise.stripeCustomerId) {
    try {
      const invoices = await this.stripe.invoices.list({
        customer: entreprise.stripeCustomerId,
        status: 'open',
        limit: 100,
      });

      for (const invoice of invoices.data) {
        await this.stripe.invoices.voidInvoice(invoice.id);
      }
    } catch (e: any) {
      console.log(
        '[SUSPEND ENTREPRISE] Stripe open invoices void failed:',
        e?.message,
      );
    }
  }

  // 4) Désactiver les offres + suspendre les utilisateurs + suspendre l’entreprise
  return this.prisma.$transaction(async (tx) => {
    await tx.abonnementEntreprise.updateMany({
      where: { entrepriseId: id },
      data: { actif: false },
    });

    await tx.utilisateur.updateMany({
      where: { entrepriseId: id },
      data: { statut: 'SUSPENDU' },
    });

    return tx.entreprise.update({
      where: { id },
      data: {
        statut: 'SUSPENDUE',
        abonnementId: null,
        abonnementExpireLe: null,
        stripeSubscriptionId: null,
      },
    });
  });
}
async getClientsByEntrepriseId(entrepriseId: string, userRole: string) {
  if (userRole !== 'ADMINISTRATEUR') {
    throw new ForbiddenException('Accès refusé');
  }

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
      dateCreation: true,
    },
    orderBy: { dateCreation: 'desc' },
  });
}
async getOffresByEntrepriseId(entrepriseId: string, userRole: string) {
  if (userRole !== 'ADMINISTRATEUR') {
    throw new ForbiddenException('Accès refusé');
  }

  return this.prisma.abonnementEntreprise.findMany({
    where: { entrepriseId },
    select: {
      id: true,
      nom: true,
      description: true,
      prix: true,
      duree: true,
      interval: true,
      actif: true,
    },
    orderBy: { dateCreation: 'desc' },
  });
}
async updateMyClient(user: any, data: any) {
  if (!user?.id) {
    throw new ForbiddenException('Utilisateur non authentifié');
  }

  return this.prisma.utilisateur.update({
    where: { id: user.id },
    data: {
      nomComplet: data.nomComplet,
      email: data.email,
      tel: data.telephone,
    },
    select: {
      id: true,
      nomComplet: true,
      email: true,
      tel: true,
      statut: true,
    },
  });
}
async getMyClient(user: any) {
  if (!user?.id) {
    throw new ForbiddenException('Utilisateur non authentifié');
  }

  return this.prisma.utilisateur.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      nomComplet: true,
      email: true,
      tel: true,
      statut: true,
      role: true,
    },
  });
}
}
