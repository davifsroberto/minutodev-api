-- CreateEnum
CREATE TYPE "EnrichmentStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "content_enrichments" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'pt-BR',
    "translatedTitle" TEXT,
    "shortSummary" TEXT,
    "whyItMatters" TEXT,
    "keyPoints" TEXT[],
    "briefContent" TEXT,
    "originalUrl" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "status" "EnrichmentStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_enrichments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_enrichments_contentId_language_key" ON "content_enrichments"("contentId", "language");

-- AddForeignKey
ALTER TABLE "content_enrichments" ADD CONSTRAINT "content_enrichments_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
