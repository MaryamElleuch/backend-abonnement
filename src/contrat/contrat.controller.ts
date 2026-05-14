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
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ApiBearerAuth, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

import { ContratService } from './contrat.service';
import { SignContratDto } from './dto/sign-contrat.dto';

@Controller('contrats')
export class ContratController {
  constructor(
    private readonly contratService: ContratService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':id/pdf-link')
  @ApiOperation({ summary: 'Retourne un lien pour ouvrir le PDF dans le navigateur' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { url: { type: 'string' } },
    },
  })
  getPdfLink(@Param('id') id: string) {
    return { url: `http://localhost:3000/contrats/${id}/pdf` };
  }

@Post(':id/generate')
@ApiOperation({ summary: 'Générer le PDF du contrat (accepte ID contrat ou ID entreprise)' })
async generate(@Param('id') id: string) {
  return this.contratService.generatePdfDraft(id);
}
  @Get(':id/pdf')
  @Header('Content-Type', 'application/pdf')
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    const pdfData = await this.contratService.getPdfData(id);

    if (!pdfData) {
      return res.status(404).send('PDF non trouvé');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="contrat-${id}.pdf"`);
    res.setHeader('Content-Length', pdfData.length);

    return res.end(pdfData);
  }

  @Post(':id/sign')
  @ApiOperation({ summary: 'Signer un contrat électroniquement (génère PDF signé + statut SIGNED)' })
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  async sign(@Param('id') contratId: string, @Body() body: SignContratDto, @Req() req: any) {
    const userId = req.user?.sub || req.user?.id;
    if (!userId) {
      throw new BadRequestException('Utilisateur non authentifié');
    }

    if (!body.signature || !body.signature.startsWith('data:image/')) {
      throw new BadRequestException('Signature invalide (data:image/...)');
    }

    const ip =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.ip ||
      req.connection?.remoteAddress ||
      null;

    const userAgent = req.headers['user-agent'] || null;

    return this.contratService.signContrat({
      contratId,
      userId,
      ip,
      userAgent,
      signatureImage: body.signature,
    });
  }

  @Get(':id/sign-link')
  @ApiOperation({ summary: 'Générer un lien public sécurisé de signature' })
  async getSignLink(@Param('id') id: string) {
    return this.contratService.createSignatureLink(id);
  }
  
  @Get(':id/sign-page')
  @Header('Content-Type', 'text/html')
  async getSignPage(@Param('id') id: string, @Query('token') token: string) {
    await this.contratService.validateSignPageAccess(id, token);

    return `
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Signer le contrat</title>
        </head>
        <body>
          <h2>Signature du contrat</h2>
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

              const res = await fetch('/contrats/${id}/public-sign?token=${token}', {
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

              alert('Contrat signé avec succès');
              window.location.href = '/contrats/${id}/pdf';
            }
          </script>
        </body>
      </html>
    `;
  }

  @Post(':id/public-sign')
  @ApiOperation({ summary: 'Signer publiquement un contrat via token' })
  async publicSign(
    @Param('id') contratId: string,
    @Query('token') token: string,
    @Body() body: SignContratDto,
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

    return this.contratService.publicSignContrat({
      contratId,
      token,
      ip,
      userAgent,
      signatureImage: body.signature,
    });
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Vérifier le statut de signature du contrat' })
  async getSignatureStatus(@Param('id') contratId: string) {
    const contrat = await this.prisma.contratEntreprise.findUnique({
      where: { id: contratId },
      include: {
        signatures: {
          orderBy: { signedAt: 'desc' },
          take: 1,
          include: {
            signerUser: {
              select: { id: true, nomComplet: true, email: true, role: true },
            },
          },
        },
        entreprise: {
          select: {
            id: true,
            nom: true,
            statut: true,
            abonnementId: true,
            abonnementExpireLe: true,
          },
        },
        achat: { select: { statutPaiement: true } },
      },
    });

    if (!contrat) {
      throw new NotFoundException('Contrat introuvable');
    }

    const s = contrat.signatures[0];

    return {
      contratId: contrat.id,
      statut: contrat.statut,
      estSigne: contrat.statut === 'SIGNED',
      signature: s
        ? {
            signeLe: s.signedAt,
            signataire: s.signerUser,
            ip: s.ip,
            userAgent: s.userAgent,
            hashDocument: s.signatureHash,
          }
        : null,
      abonnement: {
        estActif: contrat.achat?.statutPaiement === 'PAID' && contrat.statut === 'SIGNED',
        statutPaiement: contrat.achat?.statutPaiement,
        expireLe: contrat.entreprise.abonnementExpireLe,
        entrepriseStatut: contrat.entreprise.statut,
      },
    };
  }
@Get(':id')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('access-token')
@ApiOperation({ summary: 'Afficher un contrat par son id' })
async getContrat(@Param('id') id: string, @Req() req: any) {
  return this.contratService.getContratById(id  , req.user);
}
@Get(':id/reset-test')
async resetTest(@Param('id') id: string) {
  return this.contratService.resetContratForTesting(id);
}

}

