-- AlterTable
ALTER TABLE `achatabonnement` ADD COLUMN `utilisateurId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `AchatAbonnement` ADD CONSTRAINT `AchatAbonnement_utilisateurId_fkey` FOREIGN KEY (`utilisateurId`) REFERENCES `Utilisateur`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
