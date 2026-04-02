-- CreateIndex
CREATE INDEX `StripeEvent_type_idx` ON `StripeEvent`(`type`);

-- CreateIndex
CREATE INDEX `StripeEvent_createdAt_idx` ON `StripeEvent`(`createdAt`);
