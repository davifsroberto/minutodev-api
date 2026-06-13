-- CreateIndex
CREATE INDEX "contents_publishedAt_collectedAt_idx" ON "contents"("publishedAt" DESC, "collectedAt" DESC);
