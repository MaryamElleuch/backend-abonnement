import { Controller, Get, Post, Put, Delete, Param, Body , Patch} from '@nestjs/common';
import { AbonnementService } from './abonnement.service';
import { CreateAbonnementDto } from './dto/create-abonnement.dto';
import { UpdateAbonnementDto } from './dto/update-abonnement.dto';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Abonnements Entreprise')
@Controller('entreprises/abonnements')
export class AbonnementController {
  constructor(private readonly abonnementService: AbonnementService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les abonnements disponibles pour les entreprises' })
  getAll() {
    return this.abonnementService.getAbonnementsDisponibles();
  }

  @Get(':id')
  @ApiOperation({ summary: "Détails d'un abonnement entreprise" })
  @ApiOkResponse({ description: 'Abonnement trouvé' })
  async getOne(@Param('id') id: string) {
    return this.abonnementService.getAbonnementById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un abonnement entreprise (Admin)' })
  create(@Body() createAbonnementDto: CreateAbonnementDto) {
    return this.abonnementService.createAbonnement(createAbonnementDto);
  }
  @Patch(':id/archive')
@ApiOperation({ summary: 'Archiver un abonnement entreprise (Admin)' })
archive(@Param('id') id: string) {
  return this.abonnementService.archiveAbonnement(id);
}
  @Put(':id')
  @ApiOperation({ summary: 'Modifier un abonnement entreprise (Admin)' })
  update(@Param('id') id: string, @Body() updateAbonnementDto: UpdateAbonnementDto) {
    return this.abonnementService.updateAbonnement(id, updateAbonnementDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un abonnement entreprise (Admin)' })
  delete(@Param('id') id: string) {
    return this.abonnementService.deleteAbonnement(id);
  }
}
