-- AlterTable
ALTER TABLE "user" ADD COLUMN     "accountType" TEXT NOT NULL DEFAULT 'standard',
ADD COLUMN     "username" TEXT;

-- AlterTable
ALTER TABLE "class" ADD COLUMN     "joinCode" TEXT;

-- CreateTable
CREATE TABLE "enrollment" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "managed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enrollment_studentId_idx" ON "enrollment"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_classId_studentId_key" ON "enrollment"("classId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "class_joinCode_key" ON "class"("joinCode");

-- AddForeignKey
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

