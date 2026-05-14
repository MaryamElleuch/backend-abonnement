// import {
//   BadRequestException,
//   Body,
//   Controller,
//   Get,
//   Header,
//   NotFoundException,
//   Param,
//   Post,
//   Query,
//   Req,
//   Res,
// } from '@nestjs/common';
// import { PrismaService } from '../prisma/prisma.service';
// import type { Response } from 'express';
// import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
// import { ContratClientService } from './contrat-client.service';

// @Controller('contrats-client')
// export class ContratClientController {
//   constructor(private readonly contratClientService: ContratClientService ,     private readonly prisma: PrismaService, // ← AJOUTER CETTE LIGNE
// ) {}

//   @Post('from-achat/:achatClientId')
//   @ApiOperation({ summary: 'Créer un contrat client à partir d’un achat client' })
//   async createFromAchat(@Param('achatClientId') achatClientId: string) {
//     return this.contratClientService.createContratClientFromAchat(achatClientId);
//   }

//   @Post(':id/generate')
//   @ApiOperation({ summary: 'Générer le PDF du contrat client (DRAFT, signature entreprise déjà présente)' })
//   async generate(@Param('id') id: string) {
//     return this.contratClientService.generatePdfDraft(id);
//   }

//   @Get(':id/pdf-link')
//   @ApiOperation({ summary: 'Retourne un lien pour ouvrir le PDF client dans le navigateur' })
//   @ApiOkResponse({
//     schema: {
//       type: 'object',
//       properties: { url: { type: 'string' } },
//     },
//   })
//   getPdfLink(@Param('id') id: string) {
//     return { url: `http://localhost:3000/contrats-client/${id}/pdf` };
//   }

//   @Get(':id/pdf')
//   @Header('Content-Type', 'application/pdf')
//   async downloadPdf(@Param('id') id: string, @Res() res: Response) {
//     const pdfData = await this.contratClientService.getPdfData(id);

//     if (!pdfData) {
//       return res.status(404).send('PDF client non trouvé');
//     }

//     res.setHeader('Content-Type', 'application/pdf');
//     res.setHeader('Content-Disposition', `inline; filename="contrat-client-${id}.pdf"`);
//     res.setHeader('Content-Length', pdfData.length);

//     return res.end(pdfData);
//   }

//   @Get(':id/sign-link')
//   @ApiOperation({ summary: 'Générer un lien public sécurisé de signature du client final' })
//   async getSignLink(@Param('id') id: string) {
//     return this.contratClientService.createSignatureLink(id);
//   }

//   @Get(':id/sign-page')
//   @Header('Content-Type', 'text/html')
//   async getSignPage(@Param('id') id: string, @Query('token') token: string) {
//     await this.contratClientService.validateSignPageAccess(id, token);

//     return `
//       <html>
//         <head>
//           <meta charset="UTF-8" />
//           <title>Signer le contrat client</title>
//         </head>
//         <body>
//           <h2>Signature du client final</h2>
//           <canvas id="signature" width="500" height="220" style="border:1px solid #000"></canvas>
//           <br/><br/>
//           <button onclick="pad.clear()">Effacer</button>
//           <button onclick="sign()">Signer</button>

//           <script src="https://cdn.jsdelivr.net/npm/signature_pad@4.0.0/dist/signature_pad.umd.min.js"></script>
//           <script>
//             const canvas = document.getElementById('signature');
//             const pad = new SignaturePad(canvas);

//             async function sign() {
//               if (pad.isEmpty()) {
//                 alert('Veuillez dessiner une signature');
//                 return;
//               }

//               const signature = pad.toDataURL('image/png');

//               const res = await fetch('/contrats-client/${id}/public-sign?token=${token}', {
//                 method: 'POST',
//                 headers: {
//                   'Content-Type': 'application/json'
//                 },
//                 body: JSON.stringify({ signature })
//               });

//               const data = await res.json();

//               if (!res.ok) {
//                 alert(JSON.stringify(data));
//                 return;
//               }

//               alert('Contrat client signé avec succès');
//               window.location.href = '/contrats-client/${id}/pdf';
//             }
//           </script>
//         </body>
//       </html>
//     `;
//   }

//   @Post(':id/public-sign')
//   @ApiOperation({ summary: 'Signer publiquement un contrat client via token' })
//   async publicSign(
//     @Param('id') contratClientId: string,
//     @Query('token') token: string,
//     @Body() body: { signature: string },
//     @Req() req: any,
//   ) {
//     if (!body.signature || !body.signature.startsWith('data:image/')) {
//       throw new BadRequestException('Signature invalide (data:image/...)');
//     }

//     const ip =
//       req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
//       req.ip ||
//       req.connection?.remoteAddress ||
//       null;

//     const userAgent = req.headers['user-agent'] || null;

//     return this.contratClientService.publicSignContrat({
//       contratClientId,
//       token,
//       ip,
//       userAgent,
//       signatureImage: body.signature,
//     });
//   }
//  @Get('by-client/:clientId')
// async getContratByClient(@Param('clientId') clientId: string) {
//   // Trouver l'achat avec statutPaiement = 'PAID' (ou ce qui correspond dans votre base)
//   const achat = await this.prisma.achatAbonnementClient.findFirst({
//     where: {
//       clientId: clientId,
//       statutPaiement: 'PAID'  // ← Changé de 'statut' à 'statutPaiement'
//     },
//     orderBy: { dateAchat: 'desc' }
//   });
  
//   if (!achat) {
//     throw new NotFoundException('Aucun achat actif pour ce client');
//   }
  
//   // Trouver ou créer le contrat
//   let contrat = await this.prisma.contratClient.findUnique({
//     where: { achatClientId: achat.id },
//     include: {
//       entreprise: true,
//       client: true,
//       achatClient: {
//         include: {
//           abonnement: true,
//           abonnementEntreprise: true,
//         },
//       },
//     },
//   });
  
//   if (!contrat) {
//     contrat = await this.contratClientService.createContratClientFromAchat(achat.id);
//   }
  
//   return contrat;
// }
// }
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Response } from 'express';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { ContratClientService } from './contrat-client.service';

@Controller('contrats-client')
export class ContratClientController {
  constructor(
    private readonly contratClientService: ContratClientService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('from-achat/:achatClientId')
  @ApiOperation({ summary: 'Créer un contrat client à partir d’un achat client' })
  async createFromAchat(@Param('achatClientId') achatClientId: string) {
    return this.contratClientService.createContratClientFromAchat(achatClientId);
  }

  @Post(':id/generate')
  @ApiOperation({ summary: 'Générer le PDF du contrat client' })
  async generate(@Param('id') id: string) {
    console.log(`🟢 Génération PDF pour contrat ${id}`);
    
    // Récupérer le contrat pour connaître son statut
    const contrat = await this.prisma.contratClient.findUnique({
      where: { id },
      select: { statut: true, signatureClientImage: true }
    });
    
    if (!contrat) {
      throw new NotFoundException('Contrat non trouvé');
    }
    
    console.log(`🟢 Statut du contrat: ${contrat.statut}`);
    
    // Générer le PDF selon le statut
    if (contrat.statut === 'SIGNED') {
      console.log(`🟢 Génération PDF signé pour contrat ${id}`);
      return this.contratClientService.generatePdfSigned(id, contrat.signatureClientImage);
    } else {
      console.log(`🟢 Génération PDF draft pour contrat ${id}`);
      return this.contratClientService.generatePdfDraft(id);
    }
  }

  @Get(':id/pdf-link')
  @ApiOperation({ summary: 'Retourne un lien pour ouvrir le PDF client dans le navigateur' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { url: { type: 'string' } },
    },
  })
  getPdfLink(@Param('id') id: string) {
    return { url: `http://localhost:3000/contrats-client/${id}/pdf` };
  }

  @Get(':id/pdf')
  @Header('Content-Type', 'application/pdf')
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    console.log(`🟢 Téléchargement PDF pour contrat ${id}`);
    const pdfData = await this.contratClientService.getPdfData(id);

    if (!pdfData) {
      console.log(`🔴 PDF non trouvé pour contrat ${id}`);
      return res.status(404).send('PDF client non trouvé');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="contrat-client-${id}.pdf"`);
    res.setHeader('Content-Length', pdfData.length);

    return res.end(pdfData);
  }

  @Get(':id/sign-link')
  @ApiOperation({ summary: 'Générer un lien public sécurisé de signature du client final' })
  async getSignLink(@Param('id') id: string) {
    return this.contratClientService.createSignatureLink(id);
  }

  @Get(':id/sign-page')
  @Header('Content-Type', 'text/html')
  async getSignPage(@Param('id') id: string, @Query('token') token: string) {
    await this.contratClientService.validateSignPageAccess(id, token);

    return `
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Signer le contrat client</title>
        </head>
        <body>
          <h2>Signature du client final</h2>
          <canvas id="signature" width="500" height="220" style="border:1px solid #000"></canvas>
          <br/><br/>
          <button onclick="pad.clear()">Effacer</button>
          <button onclick="sign()">Signer</button>

          <script src="https://cdn.jsdelivr.net/npm/signature_pad@4.0.0/dist/signature_pad.umd.min.js"></script>
          <script>
            const canvas = document.getElementById('signature');
            const pad = new SignaturePad(canvas);

            async function sign() {
              if (pad.isEmpty()) {
                alert('Veuillez dessiner une signature');
                return;
              }

              const signature = pad.toDataURL('image/png');

              const res = await fetch('/contrats-client/${id}/public-sign?token=${token}', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ signature })
              });

              const data = await res.json();

              if (!res.ok) {
                alert(JSON.stringify(data));
                return;
              }

              alert('Contrat client signé avec succès');
              window.location.href = '/contrats-client/${id}/pdf';
            }
          </script>
        </body>
      </html>
    `;
  }

  @Post(':id/public-sign')
  @ApiOperation({ summary: 'Signer publiquement un contrat client via token' })
  async publicSign(
    @Param('id') contratClientId: string,
    @Query('token') token: string,
    @Body() body: { signature: string },
    @Req() req: any,
  ) {
    if (!body.signature || !body.signature.startsWith('data:image/')) {
      throw new BadRequestException('Signature invalide (data:image/...)');
    }

    const ip =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.ip ||
      req.connection?.remoteAddress ||
      null;

    const userAgent = req.headers['user-agent'] || null;

    return this.contratClientService.publicSignContrat({
      contratClientId,
      token,
      ip,
      userAgent,
      signatureImage: body.signature,
    });
  }

  @Get('by-client/:clientId')
  async getContratByClient(@Param('clientId') clientId: string) {
    console.log(`🟢 Recherche contrat pour client ${clientId}`);
    
    // Trouver l'achat avec statutPaiement = 'PAID'
    const achat = await this.prisma.achatAbonnementClient.findFirst({
      where: {
        clientId: clientId,
        statutPaiement: 'PAID'
      },
      orderBy: { dateAchat: 'desc' }
    });
    
    if (!achat) {
      console.log(`🔴 Aucun achat PAYÉ trouvé pour client ${clientId}`);
      throw new NotFoundException('Aucun achat actif pour ce client');
    }
    
    console.log(`🟢 Achat trouvé: ${achat.id}`);
    
    // Trouver ou créer le contrat
    let contrat = await this.prisma.contratClient.findUnique({
      where: { achatClientId: achat.id },
      include: {
        entreprise: true,
        client: true,
        achatClient: {
          include: {
            abonnement: true,
            abonnementEntreprise: true,
          },
        },
      },
    });
    
    if (!contrat) {
      console.log(`🟢 Création d'un nouveau contrat pour l'achat ${achat.id}`);
      contrat = await this.contratClientService.createContratClientFromAchat(achat.id);
    }
    
    console.log(`🟢 Contrat trouvé/créé: ${contrat.id}, statut: ${contrat.statut}`);
    return contrat;
  }
}