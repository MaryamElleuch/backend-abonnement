import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EntrepriseService } from './entreprise.service';

@ApiTags('Entreprises')
@Controller('entreprises')
export class EntrepriseController {
  constructor(private readonly entrepriseService: EntrepriseService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Lister toutes les entreprises (Admin uniquement)' })
  getEntreprises(@Req() req: any) {
    return this.entrepriseService.getEntreprisesAvecAbonnement(req.user.role);
  }

  // ✅ DOIT être avant :id
  @Get('entreprises-payees')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Lister seulement les entreprises payées (Admin uniquement)' })
  getEntreprisesPayees(@Req() req: any) {
    return this.entrepriseService.getEntreprisesPayees(req.user.role);
  }

  // ✅ DOIT être avant :id
  @Get('entreprises-non-payees')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Lister seulement les entreprises non payées (Admin uniquement)' })
  getEntreprisesNonPayees(@Req() req: any) {
    return this.entrepriseService.getEntreprisesNonPayees(req.user.role);
  }

  // ✅ mon entreprise - DOIT être avant :id
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "Afficher l'entreprise de l'utilisateur connecté" })
  getMyEntreprise(@Req() req: any) {
    const entrepriseId = req.user.entrepriseId;
    if (!entrepriseId) throw new ForbiddenException('Aucune entreprise associée');
    return this.entrepriseService.getEntrepriseById(entrepriseId);
  }

  // ✅ IMPORTANT: doit être avant ':id'
  @Get('mon-entreprise/clients')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "Lister les clients de l'entreprise connectée" })
  listMyClients(@Req() req: any) {
    return this.entrepriseService.listClientsOfMyEntreprise(req.user);
  }

  // ✅ APRÈS toutes les routes fixes
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Afficher une entreprise par ID (Admin uniquement)' })
  getOne(@Param('id') id: string, @Req() req: any) {
    if (req.user.role !== 'ADMINISTRATEUR') {
      throw new ForbiddenException('Accès refusé');
    }
    return this.entrepriseService.getEntrepriseById(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Supprimer une entreprise (Admin uniquement)' })
  delete(@Param('id') id: string, @Req() req: any) {
    if (req.user.role !== 'ADMINISTRATEUR') {
      throw new ForbiddenException('Accès refusé');
    }
    return this.entrepriseService.deleteEntreprise(id);
  }
  @Delete('clients/:clientId')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiOperation({
  summary: "Supprimer un client final (Propriétaire ou Directeur uniquement)",
})
deleteClient(@Req() req: any, @Param('clientId') clientId: string) {
  return this.entrepriseService.deleteClientFinal(req.user, clientId);
}
}