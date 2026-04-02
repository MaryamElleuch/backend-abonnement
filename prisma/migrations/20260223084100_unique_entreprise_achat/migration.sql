/*
  Warnings:

  - A unique constraint covering the columns `[entrepriseId]` on the table `AchatAbonnement` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `AchatAbonnement_entrepriseId_key` ON `AchatAbonnement`(`entrepriseId`);
