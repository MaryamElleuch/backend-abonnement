// src/achat-abonnement-client/achat-abonnement-client.controller.ts
import { Controller, Post, Param, UseGuards, Req, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AchatAbonnementClientService } from './achat-abonnement-client.service';

@ApiTags('Achat Abonnement Client')
@Controller('abonnements-entreprise')
export class AchatAbonnementClientController {
  constructor(private readonly achatClientService: AchatAbonnementClientService) {}

  @Post(':id/checkout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Client : créer une session Stripe Checkout pour acheter un abonnement' })
  async createCheckout(@Param('id') abonnementEntrepriseId: string, @Req() req: any) {
    const session = await this.achatClientService.createCheckout(req.user, abonnementEntrepriseId);
    return { 
      url: session.url, 
      sessionId: session.id,
      message: 'Redirection vers Stripe pour le paiement'
    };
  }

  @Get('client/mes-achats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Client : voir ses achats' })
  async getMesAchats(@Req() req: any) {
    return this.achatClientService.getMesAchats(req.user.id);
  }
}