-- Graded attempts at sight-reading assignments, and grades sent to Google Classroom.
ALTER TABLE "piece_attempt" ADD COLUMN "exercise" TEXT;
ALTER TABLE "assignment" ADD COLUMN "classroomWorkId" TEXT;
ALTER TABLE "assignment" ADD COLUMN "gradesSentAt" TIMESTAMP(3);
