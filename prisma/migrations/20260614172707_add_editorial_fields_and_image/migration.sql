-- AlterTable
ALTER TABLE "content_enrichments" ADD COLUMN     "example" TEXT,
ADD COLUMN     "whenToUse" TEXT;

-- AlterTable
ALTER TABLE "contents" ADD COLUMN     "imageUrl" TEXT;
