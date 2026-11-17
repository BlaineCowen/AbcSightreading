-- Ear-training games earn points for a class's students only when the teacher turns it on (ear-games.ts).
ALTER TABLE "class" ADD COLUMN "gamePoints" BOOLEAN NOT NULL DEFAULT false;
