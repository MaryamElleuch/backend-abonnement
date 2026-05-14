import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as Mustache from 'mustache';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import puppeteer from 'puppeteer';

@Injectable()
export class ContratService {
  constructor(private prisma: PrismaService) {}

private async renderPdf(contratId: string, templateData: any) {
  const templatePath = path.join(__dirname, 'templates', 'contrat-entreprise.mustache');

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template introuvable : ${templatePath}`);
  }

  const template = fs.readFileSync(templatePath, 'utf8');
  const html = Mustache.render(template, templateData);

  // Debug HTML
  const debugPath = path.join(process.cwd(), `debug-contrat-${contratId}.html`);
  fs.writeFileSync(debugPath, html);
  console.log(`📝 HTML debug sauvegardé : ${debugPath}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { 
      waitUntil: ['domcontentloaded', 'networkidle0'],
      timeout: 30000 
    });

    await page.evaluate(async () => {
      const images = Array.from(document.querySelectorAll('img'));
      await Promise.all(images.map(img => {
        return new Promise<void>(resolve => {
          if (img.complete && img.naturalHeight > 0) return resolve();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          setTimeout(resolve, 3000);
        });
      }));
    });

    await new Promise(r => setTimeout(r, 1000));

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '25px', right: '20px', bottom: '50px', left: '20px' },
    });

    const hashPdf = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    const pdfDir = path.join(process.cwd(), 'storage', 'contrats');
    fs.mkdirSync(pdfDir, { recursive: true });

    const pdfPath = path.join(pdfDir, `${contratId}.pdf`);

    if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
    
    fs.writeFileSync(pdfPath, pdfBuffer);

    console.log(`✅ PDF GÉNÉRÉ AVEC SUCCÈS : ${pdfPath}`);
    console.log(`   Taille : ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

    return { pdfBuffer, hashPdf, pdfPath };

  } catch (error: any) {
    console.error('❌ ERREUR PUPPETEER dans renderPdf :', error.message);
    console.error(error.stack);
    throw new Error(`Échec génération PDF : ${error.message}`);
  } finally {
    await browser.close();
  }
}
private normalizeSignatureImage(signatureImage?: string | null): string | null {
  if (!signatureImage || typeof signatureImage !== 'string') return null;

  let trimmed = signatureImage.trim();

  if (trimmed.startsWith('data:image/')) return trimmed;

  // Si c'est juste du base64 sans préfixe
  if (/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return `data:image/png;base64,${trimmed}`;
  }

  return null;
}

private buildTemplateData(contrat: any, signatureImage?: string | null) {
    const normalized = this.normalizeSignatureImage(signatureImage);

    console.log('🔍 DEBUG SIGNATURE PDF');
    console.log('Signature brute reçue :', signatureImage ? signatureImage.substring(0, 120) + '...' : 'AUCUNE');
    console.log('Après normalize      :', normalized ? normalized.substring(0, 120) + '...' : 'NULL');
    console.log('Longueur finale      :', normalized ? normalized.length : 0);

    return {
      contratId: contrat.id,
      entrepriseNom: contrat.entreprise?.nom ?? 'Non renseigné',
      abonnementNom: contrat.abonnement?.nom ?? 'Non renseigné',
      prixFormate: ((contrat.abonnement?.prix ?? 0)).toFixed(2) + ' EUR',
      dureeMois: String(contrat.abonnement?.dureeMois ?? 0),
      dateDebut: contrat.achat?.dateAchat
        ? new Date(contrat.achat.dateAchat).toLocaleDateString('fr-FR')
        : 'Non définie',
      dateFin: contrat.entreprise?.abonnementExpireLe
        ? new Date(contrat.entreprise.abonnementExpireLe).toLocaleDateString('fr-FR')
        : 'Non définie',
      proprietaireEmail: contrat.entreprise?.utilisateurs?.[0]?.email ?? 'Non renseigné',
      dateGeneration: new Date().toLocaleDateString('fr-FR'),
      
signatureImage: normalized || null,   // ou undefined
    };
  }
  async resetContratForTesting(contratId: string) {
  const contrat = await this.prisma.contratEntreprise.findUnique({
    where: { id: contratId },
    include: { signatures: true }
  });

  if (!contrat) throw new NotFoundException('Contrat non trouvé');

  await this.prisma.$transaction(async (tx) => {
    // Supprimer les signatures
    await tx.signature.deleteMany({ where: { contratId } });

    // Remettre le contrat en DRAFT
    await tx.contratEntreprise.update({
      where: { id: contratId },
      data: {
        statut: 'DRAFT',
        signeLe: null,
        signatureToken: null,
        signatureTokenExpiresAt: null,
        hashPdf: null,        // pour forcer la régénération
      },
    });

    // Optionnel : supprimer l'ancien PDF
    const pdfPath = path.join(process.cwd(), 'storage', 'contrats', `${contratId}.pdf`);
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }
  });

  console.log(`✅ Contrat ${contratId} réinitialisé en DRAFT`);
  return { success: true, message: 'Contrat réinitialisé avec succès. Tu peux refaire la signature.' };
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

    if (!contrat) throw new NotFoundException('Contrat introuvable');
    return contrat;
  }

// async generatePdfDraft(contratIdOrEntrepriseId: string) {
//     let contrat = await this.prisma.contratEntreprise.findUnique({
//       where: { id: contratIdOrEntrepriseId },
//       include: {
//         entreprise: { include: { utilisateurs: { where: { role: 'PROPRIETAIRE' }, take: 1, select: { email: true } } } },
//         abonnement: true,
//         achat: true,
//       },
//     });

//     if (!contrat) {
//       const entreprise = await this.prisma.entreprise.findUnique({
//         where: { id: contratIdOrEntrepriseId },
//         include: {
//           utilisateurs: { where: { role: 'PROPRIETAIRE' }, take: 1, select: { email: true } },
//           abonnement: true,
//         },
//       });

//       if (!entreprise) {
//         throw new NotFoundException(`Aucun contrat ou entreprise trouvé avec l'ID ${contratIdOrEntrepriseId}`);
//       }

//       let abonnementId = entreprise.abonnementId;
//       if (!abonnementId) {
//         const defaultAbonnement = await this.prisma.abonnement.findFirst({ where: { isActive: true } });
//         abonnementId = defaultAbonnement?.id;
//       }

//       // ✅ SOLUTION : Vérifier si l'achat existe déjà (à cause du @unique sur entrepriseId)
//       let achat = await this.prisma.achatAbonnement.findUnique({
//         where: { entrepriseId: entreprise.id },
//       });

//       if (!achat) {
//         achat = await this.prisma.achatAbonnement.create({
//           data: {
//             entrepriseId: entreprise.id,
//             abonnementId: abonnementId!,
//             montant: entreprise.abonnement?.prix ?? 0,
//             statutPaiement: 'PENDING',
//           },
//         });
//       }

//       contrat = await this.prisma.contratEntreprise.create({
//         data: {
//           id: entreprise.id,
//           entreprise: { connect: { id: entreprise.id } },
//           abonnement: abonnementId ? { connect: { id: abonnementId } } : undefined,
//           achat: { connect: { id: achat.id } },   // ← Connect au lieu de create
//           statut: 'DRAFT',
//         },
//         include: {
//           entreprise: { include: { utilisateurs: { where: { role: 'PROPRIETAIRE' }, take: 1, select: { email: true } } } },
//           abonnement: true,
//           achat: true,
//         },
//       });
//     }

// const lastSignature = await this.prisma.signature.findFirst({
//   where: { contratId: contrat.id },
//   orderBy: { createdAt: 'desc' }, // ou signedAt si ce champ existe
// });

// const data = this.buildTemplateData(
//   contrat,
//   lastSignature?.signatureImage ?? null,
// );
//     const { hashPdf } = await this.renderPdf(contrat.id, data);

//     await this.prisma.contratEntreprise.update({
//       where: { id: contrat.id },
//       data: {
//         pdfUrl: `/storage/contrats/${contrat.id}.pdf`,
//         hashPdf,
//         genereLe: new Date(),
//       },
//     });

//     return {
//       contratId: contrat.id,
//       hashPdf,
//       signed: false,
//       created: true,
//     };
//   }
async generatePdfDraft(contratIdOrEntrepriseId: string) {
  let contrat = await this.prisma.contratEntreprise.findUnique({
    where: { id: contratIdOrEntrepriseId },
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
    const entreprise = await this.prisma.entreprise.findUnique({
      where: { id: contratIdOrEntrepriseId },
      include: {
        utilisateurs: {
          where: { role: 'PROPRIETAIRE' },
          take: 1,
          select: { email: true },
        },
        abonnement: true,
      },
    });

    if (!entreprise) {
      throw new NotFoundException(
        `Aucun contrat ou entreprise trouvé avec l'ID ${contratIdOrEntrepriseId}`
      );
    }

    let abonnementId = entreprise.abonnementId;
    if (!abonnementId) {
      const defaultAbonnement = await this.prisma.abonnement.findFirst({
        where: { isActive: true },
      });
      abonnementId = defaultAbonnement?.id;
    }

    let achat = await this.prisma.achatAbonnement.findUnique({
      where: { entrepriseId: entreprise.id },
    });

    if (!achat) {
      achat = await this.prisma.achatAbonnement.create({
        data: {
          entrepriseId: entreprise.id,
          abonnementId: abonnementId!,
          montant: entreprise.abonnement?.prix ?? 0,
          statutPaiement: 'PENDING',
        },
      });
    }

    contrat = await this.prisma.contratEntreprise.create({
      data: {
        id: entreprise.id,
        entreprise: { connect: { id: entreprise.id } },
        abonnement: abonnementId
          ? { connect: { id: abonnementId } }
          : undefined,
        achat: { connect: { id: achat.id } },
        statut: 'DRAFT',
      },
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
  }

  const lastSignature = await this.prisma.signature.findFirst({
    where: { contratId: contrat.id },
    orderBy: { signedAt: 'desc' },
  });

  const data = this.buildTemplateData(
    contrat,
    lastSignature?.signatureImage ?? null
  );

  const { hashPdf } = await this.renderPdf(contrat.id, data);

  await this.prisma.contratEntreprise.update({
    where: { id: contrat.id },
    data: {
      pdfUrl: `/storage/contrats/${contrat.id}.pdf`,
      hashPdf,
      genereLe: new Date(),
    },
  });

  return {
    contratId: contrat.id,
    hashPdf,
    signed: Boolean(lastSignature),
    created: true,
  };
}
// async generatePdfSigned(contratId: string, signatureImage: string | null) {
//   const contrat = await this.loadContratForPdf(contratId);

//   const normalizedSignature = this.normalizeSignatureImage(signatureImage);
  
//   console.log('🚀 GENERATE PDF SIGNED - Signature length:', normalizedSignature?.length || 0);

//   const data = this.buildTemplateData(contrat, normalizedSignature);

//   const { hashPdf, pdfPath } = await this.renderPdf(contratId, data);

//   await this.prisma.contratEntreprise.update({
//     where: { id: contratId },
//     data: {
//       pdfUrl: `/storage/contrats/${contratId}.pdf`,
//       hashPdf,
//       genereLe: new Date(),
//       signeLe: new Date(),
//     },
//   });

//   console.log('✅ PDF signé généré et sauvegardé :', pdfPath);

//   return { contratId, hashPdf, signed: true };
// }
async generatePdfSigned(contratId: string, signatureImage: string | null) {
  const contrat = await this.loadContratForPdf(contratId);
  const normalized = this.normalizeSignatureImage(signatureImage);

  console.log('🚀 GENERATE PDF SIGNED - Signature length:', normalized?.length || 0);

  const data = this.buildTemplateData(contrat, normalized);

  const result = await this.renderPdf(contratId, data);

  await this.prisma.contratEntreprise.update({
    where: { id: contratId },
    data: {
      pdfUrl: `/storage/contrats/${contratId}.pdf`,
      hashPdf: result.hashPdf,
      genereLe: new Date(),
      signeLe: new Date(),
    },
  });

  return { 
    contratId, 
    hashPdf: result.hashPdf,
    signed: true 
  };
}

async getPdfData(contratIdOrEntrepriseId: string): Promise<Buffer | null> {
  console.log(`🔍 getPdfData appelé pour ID: ${contratIdOrEntrepriseId}`);

  let contrat = await this.prisma.contratEntreprise.findUnique({
    where: { id: contratIdOrEntrepriseId },
    select: { id: true, pdfUrl: true, hashPdf: true },
  });

  if (!contrat) {
    contrat = await this.prisma.contratEntreprise.findFirst({
      where: { entrepriseId: contratIdOrEntrepriseId },
      select: { id: true, pdfUrl: true, hashPdf: true },
    });
  }

  if (!contrat) {
    console.log('❌ Contrat non trouvé en base');
    return null;
  }

  const pdfPath = path.join(process.cwd(), 'storage', 'contrats', `${contrat.id}.pdf`);
  console.log(`📁 Chemin PDF attendu : ${pdfPath}`);
  console.log(`📄 Fichier existe ? ${fs.existsSync(pdfPath)}`);

  if (fs.existsSync(pdfPath)) {
    const buffer = fs.readFileSync(pdfPath);
    console.log(`✅ PDF trouvé ! Taille: ${(buffer.length / 1024).toFixed(1)} KB`);
    return buffer;
  }

  console.log('❌ PDF physique non trouvé sur disque');
  return null;
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

    if (contrat.statut === 'SIGNED') {
      throw new BadRequestException('Ce contrat est déjà signé');
    }

    const normalizedSignature = this.normalizeSignatureImage(signatureImage);

    const { hashPdf } = await this.generatePdfSigned(
      contratId,
     normalizedSignature!,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.signature.create({
        data: {
          contratId,
          signerUserId: userId,
          ip: ip ?? undefined,
          userAgent: userAgent ?? undefined,
          signatureHash: hashPdf,
          signatureImage: normalizedSignature,
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
    const normalizedSignature = this.normalizeSignatureImage(signatureImage);

    const { hashPdf } = await this.generatePdfSigned(
      contratId,
      normalizedSignature ?? '',
    );

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
          signatureImage: normalizedSignature,
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

  // async getContratById(contratId: string) {
  //   const contrat = await this.prisma.contratEntreprise.findUnique({
  //     where: { id: contratId },
  //     select: {
  //       id: true,
  //       statut: true,
  //       entrepriseId: true,
  //       achatId: true,
  //       abonnementId: true,
  //       pdfUrl: true,
  //       hashPdf: true,
  //       genereLe: true,
  //       signeLe: true,
  //     },
  //   });

  //   if (!contrat) {
  //     throw new NotFoundException('Contrat introuvable');
  //   }

  //   return contrat;
  // }
  async getContratById(contratId: string, user: any) {
  const contrat = await this.prisma.contratEntreprise.findUnique({
    where: { id: contratId },
  });

  if (!contrat) {
    throw new NotFoundException('Contrat introuvable');
  }

  // ✅ ADMIN → accès total
  if (user.role === 'ADMIN') {
    return contrat;
  }

  // ✅ ENTREPRISE → accès uniquement à SON contrat
  if (user.role === 'PROPRIETAIRE') {
    if (contrat.entrepriseId !== user.entrepriseId) {
      throw new ForbiddenException('Accès interdit à ce contrat');
    }
    return contrat;
  }

  // ❌ autres rôles refusés
  throw new ForbiddenException('Accès non autorisé');
}
  async getSignatureStatus(contratId: string) {
  const contrat = await this.prisma.contratEntreprise.findUnique({
    where: { id: contratId },
    include: {
      signatures: {
        orderBy: { signedAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!contrat) {
    return {
      contratId: contratId,
      statut: 'NOT_FOUND',
      estSigne: false,
      signature: null,
    };
  }

  return {
    contratId: contrat.id,
    statut: contrat.statut,
    estSigne: contrat.statut === 'SIGNED',
    signature: contrat.signatures[0] ? {
      signeLe: contrat.signatures[0].signedAt,
      signatureImage: contrat.signatures[0].signatureImage,
    } : null,
  };
}
}