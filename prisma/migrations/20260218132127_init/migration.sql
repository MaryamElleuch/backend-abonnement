-- CreateTable
CREATE TABLE `Entreprise` (
    `id` VARCHAR(191) NOT NULL,
    `nom` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `statut` ENUM('ACTIVE', 'SUSPENDUE', 'DESACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `logo` VARCHAR(191) NULL,
    `couleurPrincipale` VARCHAR(191) NULL,
    `abonnementId` VARCHAR(191) NULL,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dateModification` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Entreprise_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Utilisateur` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `motDePasseHash` VARCHAR(191) NOT NULL,
    `nomComplet` VARCHAR(191) NULL,
    `role` ENUM('ADMINISTRATEUR', 'PROPRIETAIRE', 'DIRECTEUR', 'COMPTABLE', 'EMPLOYE', 'CLIENT') NOT NULL,
    `statut` ENUM('ACTIF', 'BLOQUE') NOT NULL DEFAULT 'ACTIF',
    `entrepriseId` VARCHAR(191) NULL,
    `abonnementId` VARCHAR(191) NULL,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dateModification` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Utilisateur_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Abonnement` (
    `id` VARCHAR(191) NOT NULL,
    `nom` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `prix` DOUBLE NOT NULL,
    `dureeMois` INTEGER NOT NULL,
    `actif` BOOLEAN NOT NULL DEFAULT true,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dateExpiration` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AchatAbonnement` (
    `id` VARCHAR(191) NOT NULL,
    `entrepriseId` VARCHAR(191) NOT NULL,
    `abonnementId` VARCHAR(191) NOT NULL,
    `montant` DOUBLE NOT NULL,
    `statutPaiement` ENUM('PENDING', 'PAID', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `dateAchat` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Entreprise` ADD CONSTRAINT `Entreprise_abonnementId_fkey` FOREIGN KEY (`abonnementId`) REFERENCES `Abonnement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Utilisateur` ADD CONSTRAINT `Utilisateur_entrepriseId_fkey` FOREIGN KEY (`entrepriseId`) REFERENCES `Entreprise`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Utilisateur` ADD CONSTRAINT `Utilisateur_abonnementId_fkey` FOREIGN KEY (`abonnementId`) REFERENCES `Abonnement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AchatAbonnement` ADD CONSTRAINT `AchatAbonnement_entrepriseId_fkey` FOREIGN KEY (`entrepriseId`) REFERENCES `Utilisateur`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AchatAbonnement` ADD CONSTRAINT `AchatAbonnement_abonnementId_fkey` FOREIGN KEY (`abonnementId`) REFERENCES `Abonnement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
