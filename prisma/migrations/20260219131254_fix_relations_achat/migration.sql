/*
  Warnings:

  - A unique constraint covering the columns `[stripeSessionId]` on the table `AchatAbonnement` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE `achatabonnement` DROP FOREIGN KEY `AchatAbonnement_entrepriseId_fkey`;

-- DropIndex
DROP INDEX `AchatAbonnement_entrepriseId_fkey` ON `achatabonnement`;

-- AlterTable
ALTER TABLE `achatabonnement` ADD COLUMN `paymentIntentId` VARCHAR(191) NULL,
    ADD COLUMN `stripeSessionId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `AchatAbonnement_stripeSessionId_key` ON `AchatAbonnement`(`stripeSessionId`);

-- AddForeignKey
ALTER TABLE `AchatAbonnement` ADD CONSTRAINT `AchatAbonnement_entrepriseId_fkey` FOREIGN KEY (`entrepriseId`) REFERENCES `Entreprise`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
