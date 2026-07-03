-- CreateTable
CREATE TABLE "user_content_history" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "firstOpenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOpenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "openCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_content_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_content_history_userId_lastOpenedAt_idx" ON "user_content_history"("userId", "lastOpenedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "user_content_history_userId_contentId_key" ON "user_content_history"("userId", "contentId");

-- AddForeignKey
ALTER TABLE "user_content_history" ADD CONSTRAINT "user_content_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_content_history" ADD CONSTRAINT "user_content_history_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
