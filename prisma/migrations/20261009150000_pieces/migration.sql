-- CreateTable
CREATE TABLE "piece" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "composer" TEXT NOT NULL DEFAULT '',
    "sourceName" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "scorePath" TEXT NOT NULL,
    "parts" JSONB NOT NULL,
    "bars" INTEGER NOT NULL,
    "warnings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "piece_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "piece_userId_idx" ON "piece"("userId");

-- AddForeignKey
ALTER TABLE "piece" ADD CONSTRAINT "piece_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

