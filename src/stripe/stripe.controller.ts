import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  Req,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { StripeService } from './stripe.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@ApiTags('Stripe')
@Controller('stripe')
export class StripeController {
  constructor(
    private readonly stripeSvc: StripeService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('session-status')
  @ApiOperation({ summary: 'Vérifier le statut du paiement Stripe via session_id' })
  async getSessionStatus(@Query('session_id') sessionId: string) {
    if (!sessionId) {
      throw new BadRequestException('session_id manquant');
    }

    const session = await this.stripeSvc.stripe.checkout.sessions.retrieve(sessionId);

    return {
      sessionId,
      status: session.status,
      paymentStatus: session.payment_status,
      confirmed: session.payment_status === 'paid',
      mode: session.mode,
      customer: session.customer,
      subscription: session.subscription ?? null,
    };
  }
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('checkout/subscription/:entrepriseId/:abonnementId')
  @ApiOperation({ summary: 'Créer une session Stripe Checkout (abonnement) - Backend only' })
  async checkoutSubscription(
    @Param('entrepriseId') entrepriseId: string,
    @Param('abonnementId') abonnementId: string,
    @Req() req: any,
  ) {
    const user = req.user;

    if (!user) {
      throw new ForbiddenException('Utilisateur non authentifié');
    }

    if (user.role !== 'ADMINISTRATEUR') {
      if (!user.entrepriseId || user.entrepriseId !== entrepriseId) {
        throw new ForbiddenException(
          "Vous ne pouvez créer un checkout que pour votre propre entreprise",
        );
      }
    }

    const session = await this.stripeSvc.createCheckoutSessionSubscription(
      entrepriseId,
      abonnementId,
    );

    return {
      url: session.url,
      sessionId: session.id,
    };
  }
  // ────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('entreprise/invoices/:entrepriseId')
  @ApiOperation({ summary: "Lister les factures Stripe d'une entreprise" })
  async getEntrepriseInvoices(
    @Param('entrepriseId') entrepriseId: string,
    @Req() req: any,
  ) {
    const user = req.user;

    if (!user) {
      throw new ForbiddenException('Utilisateur non authentifié');
    }

    // ADMIN peut tout voir
    if (user.role === 'ADMINISTRATEUR') {
      return this.stripeSvc.listEntrepriseInvoices(entrepriseId);
    }

    // Propriétaire / Directeur → seulement sa propre entreprise
    if (!['PROPRIETAIRE', 'DIRECTEUR'].includes(user.role)) {
      throw new ForbiddenException('Accès refusé');
    }

    if (!user.entrepriseId || user.entrepriseId !== entrepriseId) {
      throw new ForbiddenException("Vous ne pouvez consulter que les factures de votre propre entreprise");
    }

    return this.stripeSvc.listEntrepriseInvoices(entrepriseId);
  }

  //  Factures d'un CLIENT FINAL
  // ────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('client/invoices/:userId')
  @ApiOperation({ summary: "Lister les factures Stripe d'un client final" })
  async getClientInvoices(
    @Param('userId') userId: string,
    @Req() req: any,
  ) {
    const user = req.user;

    if (!user) {
      throw new ForbiddenException('Utilisateur non authentifié');
    }

   

    // 2. Le client lui-même peut voir SES factures
    if (user.role === 'CLIENT') {
      if (user.id !== userId) {
        throw new ForbiddenException('Vous ne pouvez consulter que vos propres factures');
      }
      return this.stripeSvc.listClientInvoices(userId);
    }

    // 3. Propriétaire / Directeur → peut voir les factures des clients de SON entreprise
    if (['PROPRIETAIRE', 'DIRECTEUR'].includes(user.role)) {
      if (!user.entrepriseId) {
        throw new ForbiddenException('Aucune entreprise associée à votre compte');
      }

      const client = await this.prisma.utilisateur.findUnique({
        where: { id: userId },
        select: {
          id: true,
          entrepriseId: true,
          role: true,
        },
      });

      if (!client) {
        throw new BadRequestException('Client introuvable');
      }

      if (client.role !== 'CLIENT') {
        throw new BadRequestException("L'utilisateur demandé n'est pas un client final");
      }

      if (client.entrepriseId !== user.entrepriseId) {
        throw new ForbiddenException("Ce client n'appartient pas à votre entreprise");
      }

      return this.stripeSvc.listClientInvoices(userId);
    }

    // Tout le reste → accès interdit
    throw new ForbiddenException('Accès refusé');
  }

  @Get('success')
  async handleSuccess(
    @Query('session_id') sessionId: string,
    @Res() res: Response,
  ) {
    return res.send(`
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              text-align: center;
              padding: 50px;
              background-color: #f0f8ff;
            }
            .success {
              color: #4CAF50;
              font-size: 48px;
              margin-bottom: 20px;
            }
            .message {
              font-size: 24px;
              margin-bottom: 30px;
            }
            .session-id {
              color: #666;
              font-size: 14px;
              margin-top: 50px;
            }
          </style>
        </head>
        <body>
          <div class="success">✓</div>
          <div class="message">Paiement réussi !</div>
          <div>Votre abonnement a été activé avec succès.</div>
          <div class="session-id">Session: ${sessionId}</div>
        </body>
      </html>
    `);
  }

  @Get('cancel')
  async handleCancel(@Res() res: Response) {
    return res.send(`
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              text-align: center;
              padding: 50px;
              background-color: #fff0f0;
            }
            .cancel {
              color: #f44336;
              font-size: 48px;
              margin-bottom: 20px;
            }
            .message {
              font-size: 24px;
              margin-bottom: 30px;
            }
          </style>
        </head>
        <body>
          <div class="cancel">✗</div>
          <div class="message">Paiement annulé</div>
          <div>Vous pouvez réessayer quand vous le souhaitez.</div>
          <div>Aucun montant n'a été débité.</div>
        </body>
      </html>
    `);
  }
}