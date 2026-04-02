import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAbonnementEntrepriseDto } from './dto/create-abonnement-entreprise.dto';
import { UpdateAbonnementEntrepriseDto } from './dto/update-abonnement-entreprise.dto';
import { StripeService } from 'src/stripe/stripe.service';

@Injectable()
export class AbonnementsEntrepriseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {}

  private assertEntrepriseAccess(user: any) {
    const allowed = ['PROPRIETAIRE', 'DIRECTEUR', 'ADMINISTRATEUR'];

    if (!user) throw new ForbiddenException('Non authentifié');
    if (!allowed.includes(user.role)) throw new ForbiddenException('Accès refusé');
    if (user.role !== 'ADMINISTRATEUR' && !user.entrepriseId) {
      throw new ForbiddenException('Aucune entreprise associée');
    }
  }

  private async ensureEntrepriseIsPaid(entrepriseId: string) {
    const entreprise = await this.prisma.entreprise.findUnique({
      where: { id: entrepriseId },
      select: {
        id: true,
        statut: true,
        abonnementId: true,
        abonnementExpireLe: true,
      },
    });

    if (!entreprise) throw new NotFoundException('Entreprise introuvable');
    if (entreprise.statut !== 'ACTIVE') {
      throw new ForbiddenException('Entreprise non ACTIVE');
    }

    const now = new Date();
    const isActive =
      !!entreprise.abonnementId &&
      !!entreprise.abonnementExpireLe &&
      entreprise.abonnementExpireLe > now;

    if (!isActive) {
      throw new ForbiddenException(
        "Votre abonnement plateforme n'est pas actif. Veuillez payer/renouveler.",
      );
    }
  }

  async createForMyEntreprise(user: any, dto: CreateAbonnementEntrepriseDto) {
    this.assertEntrepriseAccess(user);

    if (user.role !== 'ADMINISTRATEUR') {
      await this.ensureEntrepriseIsPaid(user.entrepriseId);
    }

    const stripeIntervalMap: Record<'DAY' | 'MONTH' | 'YEAR', 'day' | 'month' | 'year'> = {
      DAY: 'day',
      MONTH: 'month',
      YEAR: 'year',
    };

    const stripeInterval = stripeIntervalMap[dto.interval];

    const product = await this.stripeService.stripe.products.create({
      name: dto.nom,
      description: dto.description ?? undefined,
      metadata: {
        source: 'BWS',
        type: 'ABONNEMENT_ENTREPRISE',
        entrepriseId: user.entrepriseId,
      },
    });

    const price = await this.stripeService.stripe.prices.create({
      currency: 'eur',
      unit_amount: Math.round(dto.prix * 100),
      recurring: {
        interval: stripeInterval,
        interval_count: dto.duree,
      },
      product: product.id,
      metadata: {
        source: 'BWS',
        type: 'ABONNEMENT_ENTREPRISE',
        entrepriseId: user.entrepriseId,
        interval: dto.interval,
        duree: String(dto.duree),
      },
    });

    return this.prisma.abonnementEntreprise.create({
      data: {
        entrepriseId: user.entrepriseId,
        nom: dto.nom,
        description: dto.description,
        prix: dto.prix,
        duree: dto.duree,
        interval: dto.interval,
        actif: dto.actif ?? true,
        stripeProductId: product.id,
        stripePriceId: price.id,
      },
    });
  }

  async listMine(user: any) {
    this.assertEntrepriseAccess(user);

    return this.prisma.abonnementEntreprise.findMany({
      where: { entrepriseId: user.entrepriseId },
      orderBy: { dateCreation: 'desc' },
    });
  }

  async listForClientChosenEntreprise(user: any) {
    if (!user) throw new ForbiddenException('Non authentifié');
    if (user.role !== 'CLIENT') {
      throw new ForbiddenException('Accès réservé au client');
    }

    if (!user.entrepriseId) {
      throw new BadRequestException('Aucune entreprise choisie');
    }

    const entreprise = await this.prisma.entreprise.findUnique({
      where: { id: user.entrepriseId },
      select: { id: true, statut: true },
    });

    if (!entreprise) throw new NotFoundException('Entreprise introuvable');
    if (entreprise.statut !== 'ACTIVE') return [];

    return this.prisma.abonnementEntreprise.findMany({
      where: { entrepriseId: entreprise.id, actif: true },
      orderBy: { prix: 'asc' },
      select: {
        id: true,
        nom: true,
        description: true,
        prix: true,
        duree: true,
        interval: true,
      },
    });
  }

  async updateMine(
    user: any,
    abonnementEntrepriseId: string,
    dto: UpdateAbonnementEntrepriseDto,
  ) {
    this.assertEntrepriseAccess(user);

    if (user.role !== 'ADMINISTRATEUR') {
      await this.ensureEntrepriseIsPaid(user.entrepriseId);
    }

    const abo = await this.prisma.abonnementEntreprise.findUnique({
      where: { id: abonnementEntrepriseId },
      select: {
        id: true,
        entrepriseId: true,
        stripeProductId: true,
        stripePriceId: true,
        prix: true,
        duree: true,
        interval: true,
      },
    });

    if (!abo) {
      throw new NotFoundException('Abonnement entreprise introuvable');
    }

    if (user.role !== 'ADMINISTRATEUR' && abo.entrepriseId !== user.entrepriseId) {
      throw new ForbiddenException("Vous ne pouvez pas modifier l'offre d'une autre entreprise");
    }

    let newPriceId: string | undefined = undefined;

    const prixChanged = typeof dto.prix === 'number';
    const dureeChanged = typeof dto.duree === 'number';
    const intervalChanged = typeof dto.interval === 'string';

    if ((prixChanged || dureeChanged || intervalChanged) && abo.stripeProductId) {
      const stripeIntervalMap: Record<'DAY' | 'MONTH' | 'YEAR', 'day' | 'month' | 'year'> = {
        DAY: 'day',
        MONTH: 'month',
        YEAR: 'year',
      };

      const finalPrix = dto.prix ?? abo.prix;
      const finalDuree = dto.duree ?? abo.duree;
      const finalInterval = dto.interval ?? abo.interval;

      const price = await this.stripeService.stripe.prices.create({
        currency: 'eur',
        unit_amount: Math.round(finalPrix * 100),
        recurring: {
          interval: stripeIntervalMap[finalInterval],
          interval_count: finalDuree,
        },
        product: abo.stripeProductId,
        metadata: {
          source: 'BWS',
          type: 'ABONNEMENT_ENTREPRISE_UPDATE',
          aboId: abo.id,
          interval: finalInterval,
          duree: String(finalDuree),
        },
      });

      newPriceId = price.id;
    }

    return this.prisma.abonnementEntreprise.update({
      where: { id: abonnementEntrepriseId },
      data: {
        nom: dto.nom,
        description: dto.description,
        prix: dto.prix,
        duree: dto.duree,
        interval: dto.interval,
        actif: dto.actif,
        ...(newPriceId ? { stripePriceId: newPriceId } : {}),
      },
    });
  }

  async deleteMine(user: any, abonnementEntrepriseId: string) {
    this.assertEntrepriseAccess(user);

    if (user.role !== 'ADMINISTRATEUR') {
      await this.ensureEntrepriseIsPaid(user.entrepriseId);
    }

    const abo = await this.prisma.abonnementEntreprise.findUnique({
      where: { id: abonnementEntrepriseId },
      select: { id: true, entrepriseId: true },
    });

    if (!abo) throw new NotFoundException('Abonnement entreprise introuvable');

    if (user.role !== 'ADMINISTRATEUR' && abo.entrepriseId !== user.entrepriseId) {
      throw new ForbiddenException("Vous ne pouvez pas supprimer l'offre d'une autre entreprise");
    }

    const nbAchats = await this.prisma.achatAbonnementClient.count({
      where: { abonnementEntrepriseId },
    });

    if (nbAchats > 0) {
      throw new BadRequestException(
        "Impossible de supprimer : des clients ont déjà acheté cet abonnement (désactive-le plutôt).",
      );
    }

    await this.prisma.abonnementEntreprise.delete({
      where: { id: abonnementEntrepriseId },
    });

    return { message: 'Abonnement entreprise supprimé ✅', id: abonnementEntrepriseId };
  }
}