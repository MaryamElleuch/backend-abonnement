-- DropForeignKey
ALTER TABLE `achatabonnementclient` DROP FOREIGN KEY `AchatAbonnementClient_abonnementId_fkey`;

-- AlterTable
ALTER TABLE `achatabonnementclient` ADD COLUMN `abonnementEntrepriseId` VARCHAR(191) NULL,
    MODIFY `abonnementId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `AbonnementEntreprise` (
    `id` VARCHAR(191) NOT NULL,
    `nom` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `prix` DOUBLE NOT NULL,
    `dureeMois` INTEGER NOT NULL,
    `actif` BOOLEAN NOT NULL DEFAULT true,
    `entrepriseId` VARCHAR(191) NOT NULL,
    `stripeProductId` VARCHAR(191) NULL,
    `stripePriceId` VARCHAR(191) NULL,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dateModification` DATETIME(3) NOT NULL,

    INDEX `AbonnementEntreprise_entrepriseId_idx`(`entrepriseId`),
    INDEX `AbonnementEntreprise_actif_idx`(`actif`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `AchatAbonnementClient_abonnementEntrepriseId_idx` ON `AchatAbonnementClient`(`abonnementEntrepriseId`);

-- AddForeignKey
ALTER TABLE `AchatAbonnementClient` ADD CONSTRAINT `AchatAbonnementClient_abonnementId_fkey` FOREIGN KEY (`abonnementId`) REFERENCES `Abonnement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AchatAbonnementClient` ADD CONSTRAINT `AchatAbonnementClient_abonnementEntrepriseId_fkey` FOREIGN KEY (`abonnementEntrepriseId`) REFERENCES `AbonnementEntreprise`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AbonnementEntreprise` ADD CONSTRAINT `AbonnementEntreprise_entrepriseId_fkey` FOREIGN KEY (`entrepriseId`) REFERENCES `Entreprise`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
