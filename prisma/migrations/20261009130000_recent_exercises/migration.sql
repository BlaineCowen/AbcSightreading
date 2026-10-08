-- CreateTable
CREATE TABLE "recent_exercise" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recent_exercise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recent_exercise_userId_createdAt_idx" ON "recent_exercise"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "recent_exercise" ADD CONSTRAINT "recent_exercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

