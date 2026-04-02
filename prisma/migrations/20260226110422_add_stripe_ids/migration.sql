/*
  Warnings:

  - A unique constraint covering the columns `[stripeSubscriptionId]` on the table `AchatAbonnement` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripeCustomerId]` on the table `Entreprise` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripeSubscriptionId]` on the table `Entreprise` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripeCustomerId]` on the table `Utilisateur` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `abonnement` ADD COLUMN `stripePriceId` VARCHAR(191) NULL,
    ADD COLUMN `stripeProductId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `achatabonnement` ADD COLUMN `latestInvoiceId` VARCHAR(191) NULL,
    ADD COLUMN `stripeSubscriptionId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `entreprise` ADD COLUMN `stripeCustomerId` VARCHAR(191) NULL,
    ADD COLUMN `stripeSubscriptionId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `utilisateur` ADD COLUMN `stripeCustomerId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `AchatAbonnement_stripeSubscriptionId_key` ON `AchatAbonnement`(`stripeSubscriptionId`);

-- CreateIndex
CREATE UNIQUE INDEX `Entreprise_stripeCustomerId_key` ON `Entreprise`(`stripeCustomerId`);

-- CreateIndex
CREATE UNIQUE INDEX `Entreprise_stripeSubscriptionId_key` ON `Entreprise`(`stripeSubscriptionId`);

-- CreateIndex
CREATE UNIQUE INDEX `Utilisateur_stripeCustomerId_key` ON `Utilisateur`(`stripeCustomerId`);
