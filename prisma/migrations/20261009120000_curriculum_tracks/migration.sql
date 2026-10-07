-- AlterTable
ALTER TABLE "user_preference" ADD COLUMN     "curriculumTracks" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "trackOverrides" JSONB;

