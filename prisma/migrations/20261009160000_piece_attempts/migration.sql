-- CreateTable
CREATE TABLE "piece_attempt" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "partName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "overall" INTEGER,
    "pitch" INTEGER,
    "rhythm" INTEGER,
    "marks" JSONB,
    "recordingPath" TEXT,
    "deleteAfter" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "piece_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "piece_attempt_assignmentId_studentId_idx" ON "piece_attempt"("assignmentId", "studentId");

-- AddForeignKey
ALTER TABLE "piece_attempt" ADD CONSTRAINT "piece_attempt_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_attempt" ADD CONSTRAINT "piece_attempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

