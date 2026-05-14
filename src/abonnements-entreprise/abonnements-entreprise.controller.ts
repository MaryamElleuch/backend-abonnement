import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AbonnementsEntrepriseService } from './abonnements-entreprise.service';
import { CreateAbonnementEntrepriseDto } from './dto/create-abonnement-entreprise.dto';
import { UpdateAbonnementEntrepriseDto } from './dto/update-abonnement-entreprise.dto';

@ApiTags('AbonnementsEntreprise')
@ApiBearerAuth('access-token') // ✅ IMPORTANT: doit matcher main.ts (addBearerAuth(..., 'access-token'))
@Controller('abonnements-entreprise')
export class AbonnementsEntrepriseController {
  constructor(private readonly service: AbonnementsEntrepriseService) {}

  /**
   * ✅ Entreprise (auth) : créer un abonnement spécifique
   * POST /abonnements-entreprise
   */
  @UseGuards(AuthGuard('jwt'))
  @Post()
  @ApiOperation({
    summary:
      "Créer un abonnement spécifique pour l'entreprise connectée (entreprise payée uniquement)",
  })
  create(@Req() req: any, @Body() dto: CreateAbonnementEntrepriseDto) {
    return this.service.createForMyEntreprise(req.user, dto);
  }

  /**
   * ✅ Entreprise (auth) : lister MES abonnements (actifs + inactifs)
   * GET /abonnements-entreprise/mes-offres
   */
  @UseGuards(AuthGuard('jwt'))
  @Get('mes-offres')
  @ApiOperation({
    summary: "Lister les abonnements spécifiques créés par l'entreprise connectée",
  })
  listMine(@Req() req: any) {
    return this.service.listMine(req.user);
  }
  // ✅ NEW: supprimer un abonnement de l'entreprise
  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  @ApiOperation({
    summary: "Supprimer un abonnement spécifique de l'entreprise connectée (si autorisé)",
  })
  delete(@Req() req: any, @Param('id') id: string) {
    return this.service.deleteMine(req.user, id);
  }
  @UseGuards(AuthGuard('jwt'))
@Get('choisie')
@ApiBearerAuth('access-token')
listForClient(@Req() req: any) {
  return this.service.listForClientChosenEntreprise(req.user);
}
@UseGuards(AuthGuard('jwt'))
@Put(':id')
@ApiOperation({
  summary:
    "Modifier complètement un abonnement spécifique de l'entreprise connectée",
})
update(
  @Req() req: any,
  @Param('id') id: string,
  @Body() dto: UpdateAbonnementEntrepriseDto,
) {
  return this.service.updateMine(req.user, id, dto);
}
@UseGuards(AuthGuard('jwt'))
@Patch(':id/archive')
@ApiOperation({
  summary: "Archiver un abonnement spécifique de l'entreprise connectée (PROPRIETAIRE uniquement)",
})
archive(@Req() req: any, @Param('id') id: string) {
  return this.service.archiveMine(req.user, id);
}
}