-- CreateTable
CREATE TABLE "access_code" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_grant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeId" TEXT,
    "plan" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "percentOff" INTEGER NOT NULL,
    "commissionPercent" INTEGER NOT NULL,
    "stripeCouponId" TEXT NOT NULL,
    "stripePromotionId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_sale" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "stripeCheckoutId" TEXT NOT NULL,
    "amountPaid" INTEGER NOT NULL,
    "commission" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "paidOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_sale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_code_code_key" ON "access_code"("code");

-- CreateIndex
CREATE INDEX "access_grant_userId_idx" ON "access_grant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "access_grant_userId_codeId_key" ON "access_grant"("userId", "codeId");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_code_key" ON "affiliate"("code");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_stripePromotionId_key" ON "affiliate"("stripePromotionId");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_sale_stripeCheckoutId_key" ON "affiliate_sale"("stripeCheckoutId");

-- CreateIndex
CREATE INDEX "affiliate_sale_affiliateId_idx" ON "affiliate_sale"("affiliateId");

-- AddForeignKey
ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "access_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_sale" ADD CONSTRAINT "affiliate_sale_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

