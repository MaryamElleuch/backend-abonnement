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

  async updateAbonnement(id: string, data: UpdateAbonnementDto) {
    return this.prisma.abonnement.update({
      where: { id },
      data,
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