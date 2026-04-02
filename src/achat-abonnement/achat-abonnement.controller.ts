// src/achat-abonnement/achat-abonnement.controller.ts
import { Controller, Post, Get, Param, Delete, UseGuards, ForbiddenException, Req } from '@nestjs/common';
import { AchatAbonnementService } from './achat-abonnement.service';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('achats-abonnements')
export class AchatAbonnementController {
  constructor(private readonly achatService: AchatAbonnementService) {}

//  @Post(':entrepriseId/:abonnementId')
//   @ApiOperation({ summary: 'Souscrire un abonnement pour une entreprise' })  acheter(
//     @Param('entrepriseId') entrepriseId: string,
//     @Param('abonnementId') abonnementId: string,
//   ) {
//     return this.achatService.acheterAbonnementEntreprise(entrepriseId, abonnementId);
//   }

  @Get(':entrepriseId')
  @ApiOperation({ summary: 'Lister les achats d’abonnements d’une entreprise' })
  getAchats(@Param('entrepriseId') entrepriseId: string) {
    return this.achatService.getAchatsByEntreprise(entrepriseId);
  }
@Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Supprimer un achat (Admin ou Propriétaire de l\'entreprise)' })
  async deleteAchat(@Param('id') id: string, @Req() req: any) {
    const userId = req.user.id;
    const userRole = req.user.role;
    const userEntrepriseId = req.user.entrepriseId;

    // Vérifier les droits
    const canDelete = await this.achatService.verifierDroitsSuppression(id, userId, userRole, userEntrepriseId);
    
    if (!canDelete) {
      throw new ForbiddenException('Vous n\'avez pas les droits pour supprimer cet achat');
    }

    return this.achatService.deleteAchat(id);
  }
}
