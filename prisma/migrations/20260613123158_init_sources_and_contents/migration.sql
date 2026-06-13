-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('RSS', 'GITHUB');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('ARTICLE', 'RELEASE', 'TOOL', 'DISCUSSION', 'REPOSITORY');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('NEW', 'VISIBLE', 'HIDDEN', 'ARCHIVED');

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contents" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "summary" TEXT,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" TEXT,
    "tags" TEXT[],
    "contentType" "ContentType" NOT NULL,
    "rawTitle" TEXT,
    "rawSummary" TEXT,
    "rawData" JSONB,
    "score" INTEGER NOT NULL DEFAULT 0,
    "status" "ContentStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sources_url_key" ON "sources"("url");

-- CreateIndex
CREATE UNIQUE INDEX "contents_url_key" ON "contents"("url");

-- CreateIndex
CREATE INDEX "contents_sourceId_idx" ON "contents"("sourceId");

-- CreateIndex
CREATE INDEX "contents_status_idx" ON "contents"("status");

-- AddForeignKey
ALTER TABLE "contents" ADD CONSTRAINT "contents_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
