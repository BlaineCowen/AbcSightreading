-- CreateTable
CREATE TABLE "class" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_progress" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "presetKey" TEXT NOT NULL,
    "presetId" TEXT,
    "passedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_userId_idx" ON "class"("userId");

-- CreateIndex
CREATE INDEX "class_progress_presetId_idx" ON "class_progress"("presetId");

-- CreateIndex
CREATE UNIQUE INDEX "class_progress_classId_presetKey_key" ON "class_progress"("classId", "presetKey");

-- AddForeignKey
ALTER TABLE "class" ADD CONSTRAINT "class_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_progress" ADD CONSTRAINT "class_progress_classId_fkey" FOREIGN KEY ("classId") REFERENCES "class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_progress" ADD CONSTRAINT "class_progress_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "preset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

