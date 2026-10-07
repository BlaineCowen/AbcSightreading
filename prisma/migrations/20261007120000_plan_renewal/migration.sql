-- AlterTable
ALTER TABLE "quote" ADD COLUMN     "renews" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "plan_notice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_notice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_notice_key_key" ON "plan_notice"("key");

-- CreateIndex
CREATE INDEX "plan_notice_userId_idx" ON "plan_notice"("userId");

-- AddForeignKey
ALTER TABLE "plan_notice" ADD CONSTRAINT "plan_notice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

