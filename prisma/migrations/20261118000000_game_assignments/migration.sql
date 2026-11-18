-- Games given to a class with their setup fixed (src/lib/game-assignments.ts), and the rounds played on them.
-- Additive only: two new tables. (prisma migrate diff also proposed dropping "school_consent"; that is never done.)

-- CreateTable
CREATE TABLE "game_assignment" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "setup" JSONB NOT NULL,
    "goal" JSONB NOT NULL,
    "dueAt" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_assignment_result" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_assignment_result_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_assignment_classId_idx" ON "game_assignment"("classId");

-- CreateIndex
CREATE INDEX "game_assignment_result_assignmentId_studentId_idx" ON "game_assignment_result"("assignmentId", "studentId");

-- CreateIndex
CREATE INDEX "game_assignment_result_studentId_idx" ON "game_assignment_result"("studentId");

-- AddForeignKey
ALTER TABLE "game_assignment" ADD CONSTRAINT "game_assignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_assignment_result" ADD CONSTRAINT "game_assignment_result_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "game_assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_assignment_result" ADD CONSTRAINT "game_assignment_result_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
