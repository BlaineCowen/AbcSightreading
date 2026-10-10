-- A class's roster can come from Google Classroom (src/lib/server/classroom.ts).
ALTER TABLE "class" ADD COLUMN "rosterSource" TEXT;
ALTER TABLE "class" ADD COLUMN "rosterSyncedAt" TIMESTAMP(3);
