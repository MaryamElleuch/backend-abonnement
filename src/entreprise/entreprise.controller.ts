// import {
//   Controller,
//   Delete,
//   ForbiddenException,
//   Get,
//   Param,
//   Query,
//   Req,
//   UseGuards,
// } from '@nestjs/common';
// import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard';
// import { EntrepriseService } from './entreprise.service';
// import { Body, Patch } from '@nestjs/common';
// import { UpdateEntrepriseDto } from './dto/update-entreprise.dto';
// @ApiTags('Entreprises')
// @Controller('entreprises')
// export class EntrepriseController {
//   constructor(private readonly entrepriseService: EntrepriseService) {}
//   // ====================== ROUTES ADMIN ======================
// @Get('admin/dashboard')
//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('access-token')
//   @ApiOperation({ summary: 'Statistiques du dashboard admin' })
//   getDashboardStats(@Req() req: any) {
//     if (req.user?.role !== 'ADMINISTRATEUR') {
//       throw new ForbiddenException('Accès refusé - Administrateur requis');
//     }
//     return this.entrepriseService.getDashboardStats();
//   }

//   @Get('admin/revenue-stats')
//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('access-token')
//   @ApiOperation({ summary: 'Statistiques de revenus (DAY / MONTH / YEAR)' })
//   getRevenueStats(@Req() req: any, @Query('type') type: string = 'MONTH') {
//     if (req.user?.role !== 'ADMINISTRATEUR') {
//       throw new ForbiddenException('Accès refusé - Administrateur requis');
//     }
//     return this.entrepriseService.getRevenueStats(
//       type as 'DAY' | 'MONTH' | 'YEAR',
//     );
//   }
//   // ====================== ROUTES POUR L'ENTREPRISE (PROPRIÉTAIRE) ======================

//  @Get('me/dashboard')
//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('access-token')
//   @ApiOperation({ summary: 'Dashboard de mon entreprise' })
//   getMyDashboard(@Req() req: any) {
//     return this.entrepriseService.getMyDashboard(req.user);
//   }

// //  @Get('me/stripe-revenue')
// // @UseGuards(JwtAuthGuard)
// // @ApiBearerAuth('access-token')
// // @ApiOperation({ summary: 'Revenus réels Stripe de mon entreprise' })
// // getStripeRevenue(@Req() req: any) {
// //   if (!req.user?.entrepriseId) {
// //     throw new ForbiddenException('Aucune entreprise associée');
// //   }

// //   return this.entrepriseService.getStripeRevenue(req.user.entrepriseId);
// // }
// @Get('me/stripe-revenue')
// @UseGuards(JwtAuthGuard)
// @ApiBearerAuth('access-token')
// @ApiOperation({ summary: 'Revenus réels Stripe de mon entreprise' })
// getStripeRevenue(@Req() req: any) {
//   if (!req.user?.entrepriseId) {
//     throw new ForbiddenException('Aucune entreprise associée');
//   }

//   // ✅ CORRIGÉ
//   return this.entrepriseService.getEntrepriseRevenueFromClientInvoices(
//     req.user.entrepriseId
//   );
// }
// @Get('me/revenue-stats')
// @UseGuards(JwtAuthGuard)
// @ApiBearerAuth('access-token')
// @ApiOperation({ summary: "Statistiques de revenus de mon entreprise" })
// getMyRevenueStats(@Req() req: any, @Query('type') type: string = 'MONTH') {
//   if (!req.user?.entrepriseId) {
//     throw new ForbiddenException('Aucune entreprise associée');
//   }
//   return this.entrepriseService.getMyRevenueStats(
//     req.user.entrepriseId,
//     type as 'MONTH' | 'YEAR'
//   );
// }
//     // ====================== ROUTES Entreprises ======================

//   @Get()
//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('access-token')
//   @ApiOperation({ summary: 'Lister toutes les entreprises (Admin uniquement)' })
//   getEntreprises(@Req() req: any) {
//     return this.entrepriseService.getEntreprisesAvecAbonnement(req.user.role);
//   }

//   // ✅ DOIT être avant :id
//   @Get('entreprises-payees')
//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('access-token')
//   @ApiOperation({ summary: 'Lister seulement les entreprises payées (Admin uniquement)' })
//   getEntreprisesPayees(@Req() req: any) {
//     return this.entrepriseService.getEntreprisesPayees(req.user.role);
//   }

//   // ✅ DOIT être avant :id
//   @Get('entreprises-non-payees')
//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('access-token')
//   @ApiOperation({ summary: 'Lister seulement les entreprises non payées (Admin uniquement)' })
//   getEntreprisesNonPayees(@Req() req: any) {
//     return this.entrepriseService.getEntreprisesNonPayees(req.user.role);
//   }

//   // ✅ mon entreprise - DOIT être avant :id
//   @Get('me')
//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('access-token')
//   @ApiOperation({ summary: "Afficher l'entreprise de l'utilisateur connecté" })
//   getMyEntreprise(@Req() req: any) {
//     const entrepriseId = req.user.entrepriseId;
//     if (!entrepriseId) throw new ForbiddenException('Aucune entreprise associée');
//     return this.entrepriseService.getEntrepriseById(entrepriseId);
//   }

//   // ✅ IMPORTANT: doit être avant ':id'
//   @Get('mon-entreprise/clients')
//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('access-token')
//   @ApiOperation({ summary: "Lister les clients de l'entreprise connectée" })
//   listMyClients(@Req() req: any) {
//     return this.entrepriseService.listClientsOfMyEntreprise(req.user);
//   }
// @Get('slug/:slug/abonnements')
// @ApiOperation({ summary: "Lister les offres publiques d'une entreprise par slug" })
// getOffresPubliques(@Param('slug') slug: string) {
//   return this.entrepriseService.getOffresPubliquesBySlug(slug);
// }
//   // ✅ APRÈS toutes les routes fixes
//   @Get(':id')
//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('access-token')
//   @ApiOperation({ summary: 'Afficher une entreprise par ID (Admin uniquement)' })
//   getOne(@Param('id') id: string, @Req() req: any) {
//     if (req.user.role !== 'ADMINISTRATEUR') {
//       throw new ForbiddenException('Accès refusé');
//     }
//     return this.entrepriseService.getEntrepriseById(id);
//   }

//   @Delete(':id')
//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('access-token')
//   @ApiOperation({ summary: 'Supprimer une entreprise (Admin uniquement)' })
//   delete(@Param('id') id: string, @Req() req: any) {
//     if (req.user.role !== 'ADMINISTRATEUR') {
//       throw new ForbiddenException('Accès refusé');
//     }
//     return this.entrepriseService.deleteEntreprise(id);
//   }
//   @Delete('clients/:clientId')
// @UseGuards(JwtAuthGuard)
// @ApiBearerAuth('access-token')
// @ApiOperation({
//   summary: "Supprimer un client final (Propriétaire ou Directeur uniquement)",
// })
// deleteClient(@Req() req: any, @Param('clientId') clientId: string) {
//   return this.entrepriseService.deleteClientFinal(req.user, clientId);
// }
//  @Get('slug/:slug')
// getBySlug(@Param('slug') slug: string) {
//   return this.entrepriseService.getEntrepriseBySlug(slug);
// }
// @Patch('me')
// @UseGuards(JwtAuthGuard)
// @ApiBearerAuth('access-token')
// @ApiOperation({ summary: "Modifier l'entreprise connectée" })
// updateMyEntreprise(@Req() req: any, @Body() body: UpdateEntrepriseDto) {
//   return this.entrepriseService.updateMyEntreprise(req.user, body);
// }
// @Patch(':id/suspendre')
// @UseGuards(JwtAuthGuard)
// @ApiBearerAuth('access-token')
// @ApiOperation({ summary: "Suspendre une entreprise (Admin)" })
// suspendre(@Param('id') id: string, @Req() req: any) {
//   if (req.user.role !== 'ADMINISTRATEUR') {
//     throw new ForbiddenException('Accès refusé');
//   }

//   return this.entrepriseService.suspendEntreprise(id);
// }
// }
import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  Body,
  Patch,
  UseInterceptors,
  UploadedFile 
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EntrepriseService } from './entreprise.service';
import { UpdateEntrepriseDto } from './dto/update-entreprise.dto';
@ApiTags('Entreprises')
@Controller('entreprises')
export class EntrepriseController {
  constructor(private readonly entrepriseService: EntrepriseService) {}

  @Get('admin/dashboard')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  getDashboardStats(@Req() req: any) {
    if (req.user?.role !== 'ADMINISTRATEUR') {
      throw new ForbiddenException('Accès refusé - Administrateur requis');
    }
    return this.entrepriseService.getDashboardStats();
  }

  @Get('admin/revenue-stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  getRevenueStats(@Req() req: any, @Query('type') type: string = 'MONTH') {
    if (req.user?.role !== 'ADMINISTRATEUR') {
      throw new ForbiddenException('Accès refusé - Administrateur requis');
    }
    return this.entrepriseService.getRevenueStats(
      type as 'DAY' | 'MONTH' | 'YEAR',
    );
  }

  @Get('me/dashboard')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  getMyDashboard(@Req() req: any) {
    return this.entrepriseService.getMyDashboard(req.user);
  }

  @Get('me/stripe-revenue')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  getStripeRevenue(@Req() req: any) {
    if (!req.user?.entrepriseId) {
      throw new ForbiddenException('Aucune entreprise associée');
    }

    return this.entrepriseService.getEntrepriseRevenueFromClientInvoices(
      req.user.entrepriseId,
    );
  }

  @Get('me/revenue-stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  getMyRevenueStats(@Req() req: any, @Query('type') type: string = 'MONTH') {
    if (!req.user?.entrepriseId) {
      throw new ForbiddenException('Aucune entreprise associée');
    }

    return this.entrepriseService.getMyRevenueStats(
      req.user.entrepriseId,
      type as 'MONTH' | 'YEAR',
    );
  }
   @Get('mon-entreprise/clients')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  listMyClients(@Req() req: any) {
    return this.entrepriseService.listClientsOfMyEntreprise(req.user);
  }
@Get(':id/clients')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
getClientsByEntrepriseId(
  @Param('id') id: string,
  @Req() req: any
) {
  return this.entrepriseService.getClientsByEntrepriseId(
    id,
    req.user.role
  );
}

@Get(':id/offres')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
getOffresByEntrepriseId(
  @Param('id') id: string,
  @Req() req: any
) {
  return this.entrepriseService.getOffresByEntrepriseId(
    id,
    req.user.role
  );
}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  getEntreprises(@Req() req: any) {
    return this.entrepriseService.getEntreprisesAvecAbonnement(req.user.role);
  }

  @Get('entreprises-payees')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  getEntreprisesPayees(@Req() req: any) {
    return this.entrepriseService.getEntreprisesPayees(req.user.role);
  }

  @Get('entreprises-non-payees')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  getEntreprisesNonPayees(@Req() req: any) {
    return this.entrepriseService.getEntreprisesNonPayees(req.user.role);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  getMyEntreprise(@Req() req: any) {
    const entrepriseId = req.user.entrepriseId;
    if (!entrepriseId) {
      throw new ForbiddenException('Aucune entreprise associée');
    }

    return this.entrepriseService.getEntrepriseById(entrepriseId);
  }

  // @Patch('me')
  // @UseGuards(JwtAuthGuard)
  // @ApiBearerAuth('access-token')
  // updateMyEntreprise(@Req() req: any, @Body() body: UpdateEntrepriseDto) {
  //   return this.entrepriseService.updateMyEntreprise(req.user, body);
  // }
@Patch('me')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@UseInterceptors(
  FileInterceptor('logo', {
    dest: './uploads/logos',
  }),
)
updateMyEntreprise(
  @Req() req: any,
@UploadedFile() file: any,
  @Body() body: UpdateEntrepriseDto,
) {
  return this.entrepriseService.updateMyEntreprise(req.user, body, file);
}
@Patch('client/me')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
updateMyClient(
  @Req() req: any,
  @Body() body: any,
) {
  return this.entrepriseService.updateMyClient(req.user, body);
}
@Get('client/me')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
getMyClient(@Req() req: any) {
  return this.entrepriseService.getMyClient(req.user);
}
 

  @Delete('clients/:clientId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  deleteClient(@Req() req: any, @Param('clientId') clientId: string) {
    return this.entrepriseService.deleteClientFinal(req.user, clientId);
  }
  @Patch('clients/:clientId/archive')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiOperation({ summary: 'Archiver un client' })
archiveClient(@Req() req: any, @Param('clientId') clientId: string) {
  return this.entrepriseService.archiveClient(req.user, clientId);
}

  @Get('slug/:slug/abonnements')
  getOffresPubliques(@Param('slug') slug: string) {
    return this.entrepriseService.getOffresPubliquesBySlug(slug);
  }

  @Get('slug/:slug')
  getBySlug(@Param('slug') slug: string) {
    return this.entrepriseService.getEntrepriseBySlug(slug);
  }

  @Patch(':id/suspendre')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  suspendre(@Param('id') id: string, @Req() req: any) {
    if (req.user.role !== 'ADMINISTRATEUR') {
      throw new ForbiddenException('Accès refusé');
    }

    return this.entrepriseService.suspendEntreprise(id);
  }
 
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  getOne(@Param('id') id: string, @Req() req: any) {
    if (req.user.role !== 'ADMINISTRATEUR') {
      throw new ForbiddenException('Accès refusé');
    }

    return this.entrepriseService.getEntrepriseById(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  delete(@Param('id') id: string, @Req() req: any) {
    if (req.user.role !== 'ADMINISTRATEUR') {
      throw new ForbiddenException('Accès refusé');
    }

    return this.entrepriseService.deleteEntreprise(id);
  }

}