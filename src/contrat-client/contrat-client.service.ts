import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as Mustache from 'mustache';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import puppeteer from 'puppeteer';

@Injectable()
export class ContratClientService {
  constructor(private prisma: PrismaService) {}

  private normalizeSignatureImage(value?: string | null): string | null {
    if (!value) return null;

    const trimmed = value.trim();

    if (!trimmed) return null;

    // Déjà une data URL correcte
    if (trimmed.startsWith('data:image/')) {
      return trimmed;
    }

    // Sinon on suppose base64 brut
    return `data:image/png;base64,${trimmed}`;
  }

  private async renderPdf(contratId: string, templateData: any) {
    const templatePath = path.join(__dirname, 'templates', 'contrat-client.mustache');

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

      const pdfDir = path.join(process.cwd(), 'storage', 'contrats-clients');
      fs.mkdirSync(pdfDir, { recursive: true });

      const pdfPath = path.join(pdfDir, `${contratId}.pdf`);
      fs.writeFileSync(pdfPath, pdfBuffer);

      return { pdfBuffer, hashPdf, pdfPath };
    } finally {
      await browser.close();
    }
  }

  private async loadContratClientForPdf(contratClientId: string) {
    const contrat = await this.prisma.contratClient.findUnique({
      where: { id: contratClientId },
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
      throw new NotFoundException('Contrat client introuvable');
    }

    return contrat;
  }

  private buildTemplateData(contrat: any, signatureClientImage?: string | null) {
    const offreNom =
      contrat.achatClient?.abonnementEntreprise?.nom ||
      contrat.achatClient?.abonnement?.nom ||
      'Offre';

    const offrePrix =
      contrat.achatClient?.abonnementEntreprise?.prix ||
      contrat.achatClient?.abonnement?.prix ||
      contrat.achatClient?.montant ||
      0;

    const offreDuree =
      contrat.achatClient?.abonnementEntreprise?.dureeMois ||
      contrat.achatClient?.abonnement?.dureeMois ||
      0;

    const signatureEntrepriseImage = this.normalizeSignatureImage(
      contrat.signatureEntrepriseImage ?? null,
    );

    const finalSignatureClientImage = this.normalizeSignatureImage(
      signatureClientImage ?? contrat.signatureClientImage ?? null,
    );

    return {
      contratId: contrat.id,
      entrepriseNom: contrat.entreprise?.nom ?? 'Non définie',
      clientNom: contrat.client?.nomComplet ?? 'Client final',
      clientEmail: contrat.client?.email ?? 'Non renseigné',
      abonnementNom: offreNom,
      prixFormate: Number(offrePrix).toFixed(2) + ' EUR',
      dureeMois: String(offreDuree),
      dateAchat: contrat.achatClient?.dateAchat
        ? new Date(contrat.achatClient.dateAchat).toLocaleDateString('fr-FR')
        : 'Non définie',
      dateGeneration: new Date().toLocaleDateString('fr-FR'),
      signatureEntrepriseImage,
      signatureClientImage: finalSignatureClientImage,
    };
  }

  async createContratClientFromAchat(achatClientId: string) {
    const achat = await this.prisma.achatAbonnementClient.findUnique({
      where: { id: achatClientId },
      include: {
        entreprise: true,
        client: true,
      },
    });

    if (!achat) {
      throw new NotFoundException('Achat client introuvable');
    }

    const existing = await this.prisma.contratClient.findUnique({
      where: { achatClientId },
    });

    if (existing) {
      return existing;
    }

    // CAS 1 : une entreprise possède un seul contrat principal
    const contratEntreprise = await this.prisma.contratEntreprise.findUnique({
      where: { entrepriseId: achat.entrepriseId },
      include: {
        signatures: {
          orderBy: { signedAt: 'desc' },
          take: 1,
        },
      },
    });

    const signatureEntrepriseImage = this.normalizeSignatureImage(
      contratEntreprise?.signatures?.[0]?.signatureImage ?? null,
    );

    const contrat = await this.prisma.contratClient.create({
      data: {
        achatClientId: achat.id,
        entrepriseId: achat.entrepriseId,
        clientId: achat.clientId,
        statut: 'DRAFT',
        signatureEntrepriseImage,
      } as any,
    });

    return contrat;
  }

  async generatePdfDraft(contratClientId: string) {
    const contrat = await this.loadContratClientForPdf(contratClientId);

    const data = this.buildTemplateData(contrat, null);
    const { hashPdf } = await this.renderPdf(contratClientId, data);

    await this.prisma.contratClient.update({
      where: { id: contratClientId },
      data: {
        pdfUrl: `/storage/contrats-clients/${contratClientId}.pdf`,
        hashPdf,
        genereLe: new Date(),
      } as any,
    });

    return {
      contratClientId,
      hashPdf,
      signed: false,
    };
  }

  async generatePdfSigned(contratClientId: string, signatureClientImage: string) {
    const contrat = await this.loadContratClientForPdf(contratClientId);

    const normalizedClientSignature = this.normalizeSignatureImage(signatureClientImage);
    const data = this.buildTemplateData(contrat, normalizedClientSignature);

    const { hashPdf } = await this.renderPdf(contratClientId, data);

    await this.prisma.contratClient.update({
      where: { id: contratClientId },
      data: {
        pdfUrl: `/storage/contrats-clients/${contratClientId}.pdf`,
        hashPdf,
        genereLe: new Date(),
        signatureClientImage: normalizedClientSignature,
      } as any,
    });

    return {
      contratClientId,
      hashPdf,
      signed: true,
    };
  }

  async getPdfData(contratClientId: string): Promise<Buffer | null> {
    const pdfPath = path.join(
      process.cwd(),
      'storage',
      'contrats-clients',
      `${contratClientId}.pdf`,
    );

    if (fs.existsSync(pdfPath)) {
      return fs.readFileSync(pdfPath);
    }

    const contrat = await this.prisma.contratClient.findUnique({
      where: { id: contratClientId },
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

  async createSignatureLink(contratClientId: string) {
    const contrat = await this.prisma.contratClient.findUnique({
      where: { id: contratClientId },
      select: { id: true, statut: true },
    });

    if (!contrat) {
      throw new NotFoundException('Contrat client introuvable');
    }

    if (contrat.statut === 'SIGNED') {
      throw new BadRequestException('Ce contrat client est déjà signé');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

    await this.prisma.contratClient.update({
      where: { id: contratClientId },
      data: {
        signatureToken: token,
        signatureTokenExpiresAt: expiresAt,
      } as any,
    });

    return {
      contratClientId,
      token,
      url: `http://localhost:3000/contrats-client/${contratClientId}/sign-page?token=${token}`,
      expiresAt,
    };
  }

  async validateSignPageAccess(contratClientId: string, token: string) {
    await this.validatePublicSignatureAccess(contratClientId, token);
    return { ok: true };
  }

  private async validatePublicSignatureAccess(contratClientId: string, token: string) {
    if (!token) {
      throw new BadRequestException('Token de signature manquant');
    }

    const contrat = await this.prisma.contratClient.findUnique({
      where: { id: contratClientId },
      include: {
        achatClient: true,
        entreprise: true,
        client: true,
      },
    });

    if (!contrat) {
      throw new NotFoundException('Contrat client introuvable');
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
      throw new BadRequestException('Ce contrat client est déjà signé');
    }

    return contrat;
  }

  async publicSignContrat(params: {
    contratClientId: string;
    token: string;
    ip: string | null;
    userAgent: string | null;
    signatureImage: string;
  }) {
    const { contratClientId, token, signatureImage } = params;

    await this.validatePublicSignatureAccess(contratClientId, token);

    const normalizedClientSignature = this.normalizeSignatureImage(signatureImage);
    const { hashPdf } = await this.generatePdfSigned(
      contratClientId,
      normalizedClientSignature ?? signatureImage,
    );

    const updated = await this.prisma.contratClient.update({
      where: { id: contratClientId },
      data: {
        statut: 'SIGNED',
        signeLe: new Date(),
        hashPdf,
        signatureClientImage: normalizedClientSignature,
        signatureToken: null,
        signatureTokenExpiresAt: null,
      } as any,
    });

    return {
      success: true,
      contratClientId,
      statut: updated.statut,
      hashDocument: hashPdf,
      message: 'Contrat client signé avec succès',
    };
  }
}