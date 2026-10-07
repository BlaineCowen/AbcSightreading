-- CreateTable
CREATE TABLE "free_month_claim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailKey" TEXT NOT NULL,
    "browserKey" TEXT,
    "networkKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "free_month_claim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "free_month_claim_userId_key" ON "free_month_claim"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "free_month_claim_emailKey_key" ON "free_month_claim"("emailKey");

-- CreateIndex
CREATE INDEX "free_month_claim_browserKey_idx" ON "free_month_claim"("browserKey");

-- CreateIndex
CREATE INDEX "free_month_claim_networkKey_createdAt_idx" ON "free_month_claim"("networkKey", "createdAt");

-- AddForeignKey
ALTER TABLE "free_month_claim" ADD CONSTRAINT "free_month_claim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

