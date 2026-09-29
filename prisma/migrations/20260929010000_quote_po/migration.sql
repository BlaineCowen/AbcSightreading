-- AlterTable
ALTER TABLE "quote" ADD COLUMN     "invoiceDueAt" TIMESTAMP(3),
ADD COLUMN     "invoiceId" TEXT,
ADD COLUMN     "lapsedAt" TIMESTAMP(3),
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'educator',
ADD COLUMN     "remindedAt" TIMESTAMP(3),
ADD COLUMN     "sendTo" TEXT NOT NULL DEFAULT '';

