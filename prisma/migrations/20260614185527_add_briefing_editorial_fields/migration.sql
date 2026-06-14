-- AlterTable
ALTER TABLE "content_enrichments" ADD COLUMN     "audienceFor" TEXT[],
ADD COLUMN     "audienceIgnore" TEXT[],
ADD COLUMN     "keyInsight" TEXT,
ADD COLUMN     "summary30s" TEXT;
