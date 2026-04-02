-- AlterTable
ALTER TABLE `utilisateur` ADD COLUMN `abonnementExpireLe` DATETIME(3) NULL,
    ADD COLUMN `emailVerifie` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `tel` VARCHAR(191) NULL,
    ADD COLUMN `telVerifie` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `ContratEntreprise` (
    `id` VARCHAR(191) NOT NULL,
    `statut` ENUM('DRAFT', 'SIGNED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `entrepriseId` VARCHAR(191) NOT NULL,
    `achatId` VARCHAR(191) NOT NULL,
    `abonnementId` VARCHAR(191) NOT NULL,
    `pdfUrl` VARCHAR(191) NULL,
    `pdfData` LONGBLOB NULL,
    `hashPdf` VARCHAR(191) NULL,
    `genereLe` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `signeLe` DATETIME(3) NULL,

    UNIQUE INDEX `ContratEntreprise_entrepriseId_key`(`entrepriseId`),
    UNIQUE INDEX `ContratEntreprise_achatId_key`(`achatId`),
    INDEX `ContratEntreprise_abonnementId_idx`(`abonnementId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Signature` (
    `id` VARCHAR(191) NOT NULL,
    `contratId` VARCHAR(191) NOT NULL,
    `signerUserId` VARCHAR(191) NULL,
    `signedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ip` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `signatureHash` VARCHAR(191) NULL,
    `methode` VARCHAR(191) NULL,

    INDEX `Signature_contratId_idx`(`contratId`),
    INDEX `Signature_signerUserId_idx`(`signerUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AchatAbonnementClient` (
    `id` VARCHAR(191) NOT NULL,
    `entrepriseId` VARCHAR(191) NOT NULL,
    `abonnementId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `montant` DOUBLE NOT NULL,
    `statutPaiement` ENUM('PENDING', 'PAID', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `stripeSessionId` VARCHAR(191) NULL,
    `paymentIntentId` VARCHAR(191) NULL,
    `dateAchat` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AchatAbonnementClient_stripeSessionId_key`(`stripeSessionId`),
    INDEX `AchatAbonnementClient_entrepriseId_idx`(`entrepriseId`),
    INDEX `AchatAbonnementClient_abonnementId_idx`(`abonnementId`),
    INDEX `AchatAbonnementClient_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ContratEntreprise` ADD CONSTRAINT `ContratEntreprise_entrepriseId_fkey` FOREIGN KEY (`entrepriseId`) REFERENCES `Entreprise`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContratEntreprise` ADD CONSTRAINT `ContratEntreprise_achatId_fkey` FOREIGN KEY (`achatId`) REFERENCES `AchatAbonnement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContratEntreprise` ADD CONSTRAINT `ContratEntreprise_abonnementId_fkey` FOREIGN KEY (`abonnementId`) REFERENCES `Abonnement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Signature` ADD CONSTRAINT `Signature_contratId_fkey` FOREIGN KEY (`contratId`) REFERENCES `ContratEntreprise`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Signature` ADD CONSTRAINT `Signature_signerUserId_fkey` FOREIGN KEY (`signerUserId`) REFERENCES `Utilisateur`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AchatAbonnementClient` ADD CONSTRAINT `AchatAbonnementClient_entrepriseId_fkey` FOREIGN KEY (`entrepriseId`) REFERENCES `Entreprise`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AchatAbonnementClient` ADD CONSTRAINT `AchatAbonnementClient_abonnementId_fkey` FOREIGN KEY (`abonnementId`) REFERENCES `Abonnement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AchatAbonnementClient` ADD CONSTRAINT `AchatAbonnementClient_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Utilisateur`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- RedefineIndex
CREATE INDEX `AchatAbonnement_abonnementId_idx` ON `AchatAbonnement`(`abonnementId`);
-- DROP INDEX `AchatAbonnement_abonnementId_fkey` ON `achatabonnement`;

-- RedefineIndex
CREATE INDEX `AchatAbonnement_utilisateurId_idx` ON `AchatAbonnement`(`utilisateurId`);
-- DROP INDEX `AchatAbonnement_utilisateurId_fkey` ON `achatabonnement`;
