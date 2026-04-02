import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as Mustache from 'mustache';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import puppeteer from 'puppeteer';

@Injectable()
export class ContratService {
  constructor(private prisma: PrismaService) {}
 // transformer les données en pdf  
  private async renderPdf(contratId: string, templateData: any) {
    const templatePath = path.join(__dirname, 'templates', 'contrat-entreprise.mustache');
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template introuvable: ${templatePath}`);
    }

    const template = fs.readFileSync(templatePath, 'utf8');
    const html = Mustache.render(template, templateData);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
      });

      const hashPdf = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

      const pdfDir = path.join(process.cwd(), 'storage', 'contrats');
      fs.mkdirSync(pdfDir, { recursive: true });

      const pdfPath = path.join(pdfDir, `${contratId}.pdf`);
      fs.writeFileSync(pdfPath, pdfBuffer);

      return { pdfBuffer, hashPdf, pdfPath };
    } finally {
      await browser.close();
    }
  }
  //construction les données du contrat   

  private buildTemplateData(contrat: any, signatureImage?: string | null) {
    return {
      contratId: contrat.id,
      entrepriseNom: contrat.entreprise.nom,
      abonnementNom: contrat.abonnement.nom,
      prixFormate: (contrat.abonnement.prix ?? 0).toFixed(2) + ' EUR',
      dureeMois: String(contrat.abonnement.dureeMois ?? 0),
      dateDebut: contrat.achat?.dateAchat
        ? new Date(contrat.achat.dateAchat).toLocaleDateString('fr-FR')
        : 'Non définie',
      dateFin: contrat.entreprise.abonnementExpireLe
        ? new Date(contrat.entreprise.abonnementExpireLe).toLocaleDateString('fr-FR')
        : 'Non définie',
      proprietaireEmail: contrat.entreprise.utilisateurs?.[0]?.email ?? 'Non renseigné',
      dateGeneration: new Date().toLocaleDateString('fr-FR'),
      signatureImage: signatureImage ?? null,
    };
  }

  private async loadContratForPdf(contratId: string) {
    const contrat = await this.prisma.contratEntreprise.findUnique({
      where: { id: contratId },
      include: {
        entreprise: {
          include: {
            utilisateurs: {
              where: { role: 'PROPRIETAIRE' },
              take: 1,
              select: { email: true },
            },
          },
        },
        abonnement: true,
        achat: true,
      },
    });

    if (!contrat) {
      throw new NotFoundException('Contrat introuvable');
    }

    return contrat;
  }
 // generer un pdf de brouillon (sans signature)
  async generatePdfDraft(contratId: string) {
    const contrat = await this.loadContratForPdf(contratId);

    const data = this.buildTemplateData(contrat, null);
    const { hashPdf } = await this.renderPdf(contratId, data);

    await this.prisma.contratEntreprise.update({
      where: { id: contratId },
      data: {
        pdfUrl: `/storage/contrats/${contratId}.pdf`,
        hashPdf,
        genereLe: new Date(),
      } as any,
    });

    return {
      contratId,
      hashPdf,
      signed: false,
    };
  }
 // generer un pdf signé (avec signature)
  async generatePdfSigned(contratId: string, signatureImage: string) {
    const contrat = await this.loadContratForPdf(contratId);

    const data = this.buildTemplateData(contrat, signatureImage);
    const { hashPdf } = await this.renderPdf(contratId, data);

    await this.prisma.contratEntreprise.update({
      where: { id: contratId },
      data: {
        pdfUrl: `/storage/contrats/${contratId}.pdf`,
        hashPdf,
        genereLe: new Date(),
      } as any,
    });

    return {
      contratId,
      hashPdf,
      signed: true,
    };
  }

  async getPdfData(contratId: string): Promise<Buffer | null> {
    const pdfPath = path.join(process.cwd(), 'storage', 'contrats', `${contratId}.pdf`);

    if (fs.existsSync(pdfPath)) {
      return fs.readFileSync(pdfPath);
    }

    const contrat = await this.prisma.contratEntreprise.findUnique({
      where: { id: contratId },
      select: { pdfData: true },
    });

    if (!contrat?.pdfData) {
      return null;
    }

    if (typeof contrat.pdfData === 'string') {
      return Buffer.from(contrat.pdfData, 'base64');
    }

    return Buffer.from(contrat.pdfData as any);
  }

  async signContrat(params: {
    contratId: string;
    userId: string;
    ip: string | null;
    userAgent: string | null;
    signatureImage: string;
  }) {
    const { contratId, userId, ip, userAgent, signatureImage } = params;

    const contrat = await this.prisma.contratEntreprise.findUnique({
      where: { id: contratId },
      include: { achat: true, entreprise: true },
    });

    if (!contrat) {
      throw new NotFoundException('Contrat introuvable');
    }

    const { hashPdf } = await this.generatePdfSigned(contratId, signatureImage);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.signature.create({
        data: {
          contratId,
          signerUserId: userId,
          ip: ip ?? undefined,
          userAgent: userAgent ?? undefined,
          signatureHash: hashPdf,
          signatureImage: signatureImage,

          methode: 'DRAW',
        },
      });

      const updated = await tx.contratEntreprise.update({
        where: { id: contratId },
        data: {
          statut: 'SIGNED',
          signeLe: new Date(),
          hashPdf,
        } as any,
        select: { id: true, statut: true, entrepriseId: true },
      });

      const isPaid = contrat.achat?.statutPaiement === 'PAID';

      await tx.entreprise.update({
        where: { id: contrat.entrepriseId },
        data: {
          statut: isPaid ? 'ACTIVE' : 'SUSPENDUE',
        } as any,
      });

      return { updated, isPaid };
    });

    return {
      success: true,
      contratId,
      statut: result.updated.statut,
      hashDocument: hashPdf,
      abonnementActive: result.isPaid,
      message: result.isPaid
        ? 'Contrat signé et abonnement activé'
        : 'Contrat signé, paiement en attente',
    };
  }

  async createSignatureLink(contratId: string) {
    const contrat = await this.prisma.contratEntreprise.findUnique({
      where: { id: contratId },
      select: { id: true, statut: true },
    });

    if (!contrat) {
      throw new NotFoundException('Contrat introuvable');
    }

    if (contrat.statut === 'SIGNED') {
      throw new BadRequestException('Ce contrat est déjà signé');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

    await this.prisma.contratEntreprise.update({
      where: { id: contratId },
      data: {
        signatureToken: token,
        signatureTokenExpiresAt: expiresAt,
      } as any,
    });

    return {
      contratId,
      token,
      url: `http://localhost:3000/contrats/${contratId}/sign-page?token=${token}`,
      expiresAt,
    };
  }

  async validateSignPageAccess(contratId: string, token: string) {
    await this.validatePublicSignatureAccess(contratId, token);
    return { ok: true };
  }

  private async validatePublicSignatureAccess(contratId: string, token: string) {
    if (!token) {
      throw new BadRequestException('Token de signature manquant');
    }

    const contrat = await this.prisma.contratEntreprise.findUnique({
      where: { id: contratId },
      include: {
        achat: true,
        entreprise: true,
        abonnement: true,
      },
    });

    if (!contrat) {
      throw new NotFoundException('Contrat introuvable');
    }

    if (!contrat.signatureToken || contrat.signatureToken !== token) {
      throw new BadRequestException('Token de signature invalide');
    }

    if (
      contrat.signatureTokenExpiresAt &&
      new Date(contrat.signatureTokenExpiresAt).getTime() < Date.now()
    ) {
      throw new BadRequestException('Le lien de signature a expiré');
    }

    if (contrat.statut === 'SIGNED') {
      throw new BadRequestException('Ce contrat est déjà signé');
    }

    return contrat;
  }

  async publicSignContrat(params: {
    contratId: string;
    token: string;
    ip: string | null;
    userAgent: string | null;
    signatureImage: string;
  }) {
    const { contratId, token, ip, userAgent, signatureImage } = params;

    const contrat = await this.validatePublicSignatureAccess(contratId, token);

    const { hashPdf } = await this.generatePdfSigned(contratId, signatureImage);

    const owner = await this.prisma.utilisateur.findFirst({
      where: {
        entrepriseId: contrat.entrepriseId,
        role: 'PROPRIETAIRE',
      },
      select: { id: true },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.signature.create({
        data: {
          contratId,
          signerUserId: owner?.id ?? null,
          ip: ip ?? undefined,
          userAgent: userAgent ?? undefined,
          signatureHash: hashPdf,
          signatureImage: signatureImage,

          methode: 'DRAW',
        },
      });

      const updated = await tx.contratEntreprise.update({
        where: { id: contratId },
        data: {
          statut: 'SIGNED',
          signeLe: new Date(),
          hashPdf,
          signatureToken: null,
          signatureTokenExpiresAt: null,
        } as any,
        select: { id: true, statut: true, entrepriseId: true },
      });

      const isPaid = contrat.achat?.statutPaiement === 'PAID';

      await tx.entreprise.update({
        where: { id: contrat.entrepriseId },
        data: {
          statut: isPaid ? 'ACTIVE' : 'SUSPENDUE',
        } as any,
      });

      return { updated, isPaid };
    });

    return {
      success: true,
      contratId,
      statut: result.updated.statut,
      hashDocument: hashPdf,
      abonnementActive: result.isPaid,
      message: result.isPaid
        ? 'Contrat signé et abonnement activé'
        : 'Contrat signé, paiement en attente',
    };
  }
  async getContratById(contratId: string) {
  const contrat = await this.prisma.contratEntreprise.findUnique({
    where: { id: contratId },
    select: {
      id: true,
      statut: true,
      entrepriseId: true,
      achatId: true,
      abonnementId: true,
      pdfUrl: true,
      hashPdf: true,
      genereLe: true,
      signeLe: true,
    },
  });

  if (!contrat) {
    throw new NotFoundException('Contrat introuvable');
  }

  return contrat;
}
}