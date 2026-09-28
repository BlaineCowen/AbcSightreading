-- CreateTable
CREATE TABLE "quote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeQuoteId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "number" TEXT,
    "school" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "packs" INTEGER NOT NULL DEFAULT 0,
    "taxExempt" BOOLEAN NOT NULL DEFAULT false,
    "amountTotal" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "poNumber" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "stripeSubscriptionId" TEXT,
    "invoiceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quote_stripeQuoteId_key" ON "quote"("stripeQuoteId");

-- CreateIndex
CREATE INDEX "quote_userId_idx" ON "quote"("userId");

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

