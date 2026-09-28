-- CreateTable
CREATE TABLE "assignment" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "presetKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "params" JSONB,
    "minutes" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_time" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "assignmentId" TEXT,
    "page" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "exercises" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_time_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_clock" (
    "studentId" TEXT NOT NULL,
    "lastCreditedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_clock_pkey" PRIMARY KEY ("studentId")
);

-- CreateIndex
CREATE INDEX "assignment_classId_idx" ON "assignment"("classId");

-- CreateIndex
CREATE INDEX "practice_time_studentId_day_idx" ON "practice_time"("studentId", "day");

-- CreateIndex
CREATE INDEX "practice_time_assignmentId_idx" ON "practice_time"("assignmentId");

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_time" ADD CONSTRAINT "practice_time_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_time" ADD CONSTRAINT "practice_time_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_clock" ADD CONSTRAINT "practice_clock_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

