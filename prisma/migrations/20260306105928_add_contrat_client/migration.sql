-- CreateTable
CREATE TABLE `ContratClient` (
    `id` VARCHAR(191) NOT NULL,
    `statut` ENUM('DRAFT', 'SIGNED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `achatClientId` VARCHAR(191) NOT NULL,
    `entrepriseId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `pdfUrl` VARCHAR(191) NULL,
    `pdfData` LONGBLOB NULL,
    `hashPdf` VARCHAR(191) NULL,
    `signatureEntrepriseImage` VARCHAR(191) NULL,
    `signatureClientImage` VARCHAR(191) NULL,
    `signatureToken` VARCHAR(191) NULL,
    `signatureTokenExpiresAt` DATETIME(3) NULL,
    `genereLe` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `signeLe` DATETIME(3) NULL,

    UNIQUE INDEX `ContratClient_achatClientId_key`(`achatClientId`),
    UNIQUE INDEX `ContratClient_signatureToken_key`(`signatureToken`),
    INDEX `ContratClient_entrepriseId_idx`(`entrepriseId`),
    INDEX `ContratClient_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ContratClient` ADD CONSTRAINT `ContratClient_achatClientId_fkey` FOREIGN KEY (`achatClientId`) REFERENCES `AchatAbonnementClient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContratClient` ADD CONSTRAINT `ContratClient_entrepriseId_fkey` FOREIGN KEY (`entrepriseId`) REFERENCES `Entreprise`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContratClient` ADD CONSTRAINT `ContratClient_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Utilisateur`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
