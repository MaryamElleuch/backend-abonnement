/*
  Warnings:

  - A unique constraint covering the columns `[signatureToken]` on the table `ContratEntreprise` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `contratentreprise` ADD COLUMN `signatureToken` VARCHAR(191) NULL,
    ADD COLUMN `signatureTokenExpiresAt` DATETIME(3) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `ContratEntreprise_signatureToken_key` ON `ContratEntreprise`(`signatureToken`);
