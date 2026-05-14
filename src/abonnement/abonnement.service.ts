import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAbonnementDto } from './dto/create-abonnement.dto';
import { UpdateAbonnementDto } from './dto/update-abonnement.dto';
import { StripeService } from 'src/stripe/stripe.service';

@Injectable()
export class AbonnementService {
  constructor(
    private prisma: PrismaService,
    private stripeService: StripeService,
  ) {}

  async getAbonnementsDisponibles() {
    return this.prisma.abonnement.findMany({
      where: { actif: true },
      orderBy: { prix: 'asc' },
    });
  }

  async getAbonnementById(id: string) {
    const abonnement = await this.prisma.abonnement.findUnique({
      where: { id },
    });

    if (!abonnement) {
      throw new NotFoundException('Abonnement non trouvé');
    }

    return abonnement;
  }

  async createAbonnement(data: CreateAbonnementDto) {
    const product = await this.stripeService.stripe.products.create({
      name: data.nom,
      description: data.description ?? undefined,
      metadata: {
        source: 'BWS',
        type: 'ABONNEMENT',
      },
    });

    // Prisma: DAY | MONTH | YEAR
    // Stripe: day | month | year
    const stripeIntervalMap: Record<'DAY' | 'MONTH' | 'YEAR', 'day' | 'month' | 'year'> = {
      DAY: 'day',
      MONTH: 'month',
      YEAR: 'year',
    };

    const stripeInterval = stripeIntervalMap[data.interval];

    const price = await this.stripeService.stripe.prices.create({
      currency: 'eur',
      unit_amount: Math.round(data.prix * 100),
      recurring: {
        interval: stripeInterval,
        interval_count: data.duree,
      },
      product: product.id,
      metadata: {
        source: 'BWS',
        abonnementNom: data.nom,
        interval: data.interval,
        duree: String(data.duree),
      },
    });

    return this.prisma.abonnement.create({
      data: {
        nom: data.nom,
        description: data.description,
        prix: data.prix,
        duree: data.duree,
        interval: data.interval, // reste en DAY / MONTH / YEAR pour Prisma
        stripeProductId: product.id,
        stripePriceId: price.id,
      },
    });
  }

  // async updateAbonnement(id: string, data: UpdateAbonnementDto) {
  //   return this.prisma.abonnement.update({
  //     where: { id },
  //     data,
  //   });
  // }
  async updateAbonnement(id: string, data: UpdateAbonnementDto) {
  const abonnement = await this.prisma.abonnement.findUnique({
    where: { id },
  });

  if (!abonnement) {
    throw new NotFoundException('Abonnement non trouvé');
  }

  const stripeIntervalMap: Record<'DAY' | 'MONTH' | 'YEAR', 'day' | 'month' | 'year'> = {
    DAY: 'day',
    MONTH: 'month',
    YEAR: 'year',
  };

  const newNom = data.nom ?? abonnement.nom;
  const newDescription = data.description ?? abonnement.description;
  const newPrix = data.prix ?? abonnement.prix;
  const newDuree = data.duree ?? abonnement.duree;
  const newInterval = data.interval ?? abonnement.interval;

  const prixChanged = Number(newPrix) !== Number(abonnement.prix);
  const dureeChanged = Number(newDuree) !== Number(abonnement.duree);
  const intervalChanged = newInterval !== abonnement.interval;

  let newStripePriceId = abonnement.stripePriceId;

  // 1) Mettre à jour le produit Stripe
  if (abonnement.stripeProductId) {
    await this.stripeService.stripe.products.update(abonnement.stripeProductId, {
      name: newNom,
      description: newDescription ?? undefined,
    });
  }

  // 2) Si prix/durée/intervalle change => Stripe exige un nouveau Price
  if (prixChanged || dureeChanged || intervalChanged) {
    const newPrice = await this.stripeService.stripe.prices.create({
      currency: 'eur',
      unit_amount: Math.round(Number(newPrix) * 100),
      recurring: {
        interval: stripeIntervalMap[newInterval],
        interval_count: Number(newDuree),
      },
      product: abonnement.stripeProductId,
      metadata: {
        source: 'BWS',
        abonnementId: abonnement.id,
        abonnementNom: newNom,
        interval: newInterval,
        duree: String(newDuree),
      },
    });

    newStripePriceId = newPrice.id;

    // Désactiver ancien prix Stripe
    if (abonnement.stripePriceId) {
      await this.stripeService.stripe.prices.update(abonnement.stripePriceId, {
        active: false,
      });
    }

    // 3) Mettre à jour les subscriptions existantes
   const achats = await this.prisma.achatAbonnement.findMany({
  where: {
    abonnementId: id,
    stripeSubscriptionId: {
      not: null,
    },
  },
  select: {
    id: true,
    statutPaiement: true,
    stripeSubscriptionId: true,
  },
});

console.log('Achats avec subscription trouvés =', achats);

    for (const achat of achats) {
      const subscription = await this.stripeService.stripe.subscriptions.retrieve(
        achat.stripeSubscriptionId!,
      );

      const item = subscription.items.data.find(
        (item) => item.price.id === abonnement.stripePriceId,
      ) || subscription.items.data[0];

      if (!item) continue;

      await this.stripeService.stripe.subscriptions.update(
        achat.stripeSubscriptionId!,
        {
          items: [
            {
              id: item.id,
              price: newStripePriceId,
            },
          ],
          proration_behavior: 'none',
        },
      );
    }
  }

  // 4) Mettre à jour la base locale
  return this.prisma.abonnement.update({
    where: { id },
    data: {
      nom: newNom,
      description: newDescription,
      prix: newPrix,
      duree: newDuree,
      interval: newInterval,
      stripePriceId: newStripePriceId,
    },
  });
}
  async archiveAbonnement(id: string) {
  const abonnement = await this.prisma.abonnement.findUnique({
    where: { id },
  });

  if (!abonnement) {
    throw new NotFoundException('Abonnement non trouvé');
  }

  return this.prisma.abonnement.update({
    where: { id },
    data: { actif: false },
  });
}

  async deleteAbonnement(id: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.entreprise.updateMany({
          where: { abonnementId: id },
          data: { abonnementId: null },
        });

        await tx.utilisateur.updateMany({
          where: { abonnementId: id },
          data: { abonnementId: null },
        });

        await tx.achatAbonnement.deleteMany({
          where: { abonnementId: id },
        });

        return tx.abonnement.delete({
          where: { id },
        });
      });
    } catch (e: any) {
      throw new BadRequestException(
        'Impossible de supprimer cet abonnement (il est lié à des entreprises/utilisateurs/achats).',
      );
    }
  }
}