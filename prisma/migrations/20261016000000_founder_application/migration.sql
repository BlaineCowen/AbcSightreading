
-- CreateTable
CREATE TABLE "founder_application" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "proofUrl" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "founder_application_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "founder_application_userId_key" ON "founder_application"("userId");

-- CreateIndex
CREATE INDEX "founder_application_status_createdAt_idx" ON "founder_application"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "founder_application" ADD CONSTRAINT "founder_application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

