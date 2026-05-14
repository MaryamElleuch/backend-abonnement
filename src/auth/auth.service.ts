import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import Stripe from 'stripe';

// Lazy load Prisma enums
const { RoleUtilisateur, StatutEntreprise } = require('.prisma/client');

@Injectable()
export class AuthService {
  private stripe: Stripe;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY manquante');
    this.stripe = new Stripe(key, { apiVersion: '2026-01-28.clover' });
  }

  async login(email: string, motDePasse: string, entrepriseSlug?: string) {
    // 1) On cherche d'abord un compte "entreprise" / interne
    // Ici : tout ce qui n'est pas CLIENT
    const utilisateurInterne = await this.prisma.utilisateur.findFirst({
      where: {
        email,
        role: {
          not: RoleUtilisateur.CLIENT,
        },
      },
      select: {
        id: true,
        role: true,
        entrepriseId: true,
        motDePasseHash: true,
        // entreprise: { select: { slug: true } },
        statut: true,
entreprise: { select: { slug: true, statut: true } },
      },
    });
 if (utilisateurInterne && entrepriseSlug) {
  if (utilisateurInterne.role !== RoleUtilisateur.PROPRIETAIRE) {
    throw new UnauthorizedException('Cette page est réservée aux clients et à l’entreprise');
  }

  if (utilisateurInterne.entreprise?.slug !== entrepriseSlug) {
    throw new UnauthorizedException('Cette entreprise ne correspond pas à cette page');
  }
}

    if (utilisateurInterne) {
      const ok = await bcrypt.compare(motDePasse, utilisateurInterne.motDePasseHash);
      if (!ok) {
        throw new UnauthorizedException('Identifiants invalides');
      }
      if (
  utilisateurInterne.statut === 'SUSPENDU' ||
  utilisateurInterne.statut === 'SUSPENDUE' ||
  utilisateurInterne.entreprise?.statut === 'SUSPENDU' ||
  utilisateurInterne.entreprise?.statut === 'SUSPENDUE'
) {
  throw new UnauthorizedException('Compte ou entreprise suspendu');
}

      const payload = {
        sub: utilisateurInterne.id,
        role: utilisateurInterne.role,
        entrepriseId: utilisateurInterne.entrepriseId ?? null,
        entrepriseSlug: utilisateurInterne.entreprise?.slug ?? null,
      };

      return { access_token: await this.jwt.signAsync(payload) };
    }

    // 2) Sinon on traite le cas CLIENT final
    if (!entrepriseSlug) {
      throw new BadRequestException(
        'entrepriseSlug est obligatoire pour la connexion client',
      );
    }

    const utilisateurClient = await this.prisma.utilisateur.findFirst({
      where: {
        email,
        role: RoleUtilisateur.CLIENT,
        entreprise: {
          slug: entrepriseSlug,
        },
      },
      select: {
        id: true,
        role: true,
        entrepriseId: true,
        motDePasseHash: true,
        statut: true, 
        entreprise: { select: { slug: true, statut: true } },
      },
    });

    if (!utilisateurClient) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const ok = await bcrypt.compare(motDePasse, utilisateurClient.motDePasseHash);
    if (!ok) {
      throw new UnauthorizedException('Identifiants invalides');
    }
    if (
  utilisateurClient.statut === 'SUSPENDU' ||
  utilisateurClient.statut === 'SUSPENDUE' ||
  utilisateurClient.entreprise?.statut === 'SUSPENDU' ||
  utilisateurClient.entreprise?.statut === 'SUSPENDUE'
) {
  throw new UnauthorizedException('Compte ou entreprise suspendu');
}

    const payload = {
      sub: utilisateurClient.id,
      role: utilisateurClient.role,
      entrepriseId: utilisateurClient.entrepriseId ?? null,
      entrepriseSlug: utilisateurClient.entreprise?.slug ?? null,
    };

    return { access_token: await this.jwt.signAsync(payload) };
  }

  async register(dto: any) {
    const motDePasseHash = await bcrypt.hash(dto.motDePasse, 10);

    // REGISTER ENTREPRISE
    if (dto.type === 'ENTREPRISE') {
      const existSlug = await this.prisma.entreprise.findUnique({
        where: { slug: dto.slug },
      });
      if (existSlug) {
        throw new BadRequestException('Slug déjà utilisé');
      }

      // IMPORTANT :
      // pour les comptes entreprise / propriétaire,
      // on interdit le même email globalement
      const emailExistGlobal = await this.prisma.utilisateur.findFirst({
        where: { email: dto.email },
        select: { id: true },
      });

      if (emailExistGlobal) {
        throw new BadRequestException('Email déjà utilisé');
      }

      return this.prisma.$transaction(async (tx) => {
        const entreprise = await tx.entreprise.create({
          data: {
            nom: dto.nomEntreprise,
            slug: dto.slug,
            statut: StatutEntreprise.ACTIVE,
            logo: dto.logo ?? null,
            couleurPrincipale: dto.couleurPrincipale ?? null,
          },
        });

        const proprietaire = await tx.utilisateur.create({
          data: {
            email: dto.email,
            motDePasseHash,
            nomComplet: dto.nomComplet,
            role: RoleUtilisateur.PROPRIETAIRE,
            entrepriseId: entreprise.id,
          },
        });

        const customer = await this.stripe.customers.create({
          email: proprietaire.email,
          name: entreprise.nom,
          metadata: {
            entrepriseId: entreprise.id,
            utilisateurId: proprietaire.id,
            type: 'ENTREPRISE',
          },
        });

        const entrepriseUpdated = await tx.entreprise.update({
          where: { id: entreprise.id },
          data: { stripeCustomerId: customer.id },
        });

        return { entreprise: entrepriseUpdated, proprietaire };
      });
    }

    // REGISTER CLIENT
    if (dto.type === 'CLIENT') {
      const entreprise = await this.prisma.entreprise.findUnique({
        where: { slug: dto.entrepriseSlug },
      });

      if (!entreprise) {
        throw new NotFoundException('Entreprise introuvable');
      }

      // Ici on interdit seulement le même email dans la MEME entreprise
      const emailExistInSameCompany = await this.prisma.utilisateur.findFirst({
        where: {
          email: dto.email,
          entrepriseId: entreprise.id,
        },
        select: { id: true },
      });

      if (emailExistInSameCompany) {
        throw new BadRequestException('Email déjà utilisé dans cette entreprise');
      }

      const client = await this.prisma.utilisateur.create({
        data: {
          email: dto.email,
          motDePasseHash,
          nomComplet: dto.nomComplet,
          role: RoleUtilisateur.CLIENT,
          entrepriseId: entreprise.id,
        },
      });

      const customer = await this.stripe.customers.create({
        email: client.email,
        name: client.nomComplet ?? client.email,
        metadata: {
          clientId: client.id,
          entrepriseId: entreprise.id,
          type: 'CLIENT',
        },
      });

      const clientUpdated = await this.prisma.utilisateur.update({
        where: { id: client.id },
        data: { stripeCustomerId: customer.id },
      });

      return clientUpdated;
    }

    throw new BadRequestException('Type invalide');
  }
}