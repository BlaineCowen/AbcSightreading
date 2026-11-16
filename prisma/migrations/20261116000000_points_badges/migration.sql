-- AlterTable
ALTER TABLE "class" ADD COLUMN     "breakUntil" TEXT,
ADD COLUMN     "leaderboardOn" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "weeklyGoal" INTEGER;

-- CreateTable
CREATE TABLE "point_event" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_stats" (
    "studentId" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "exercises" INTEGER NOT NULL DEFAULT 0,
    "graded" INTEGER NOT NULL DEFAULT 0,
    "tries90" INTEGER NOT NULL DEFAULT 0,
    "tries100" INTEGER NOT NULL DEFAULT 0,
    "onTime" INTEGER NOT NULL DEFAULT 0,
    "gameCorrect" INTEGER NOT NULL DEFAULT 0,
    "weeklyTop3" INTEGER NOT NULL DEFAULT 0,
    "ensembles" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "streakDay" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "steps" JSONB NOT NULL DEFAULT '{}',
    "bests" JSONB NOT NULL DEFAULT '{}',
    "keys" JSONB NOT NULL DEFAULT '[]',
    "flags" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_stats_pkey" PRIMARY KEY ("studentId")
);

-- CreateTable
CREATE TABLE "badge" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "givenById" TEXT,
    "classId" TEXT,
    "title" TEXT,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" TIMESTAMP(3),

    CONSTRAINT "badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_week" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "top" JSONB NOT NULL,
    "total" INTEGER NOT NULL,
    "goal" INTEGER NOT NULL,
    "reached" BOOLEAN NOT NULL,
    "extras" JSONB NOT NULL DEFAULT '{}',
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_week_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "point_event_studentId_day_idx" ON "point_event"("studentId", "day");

-- CreateIndex
CREATE INDEX "point_event_week_studentId_idx" ON "point_event"("week", "studentId");

-- CreateIndex
CREATE INDEX "point_event_day_idx" ON "point_event"("day");

-- CreateIndex
CREATE INDEX "badge_studentId_idx" ON "badge"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "class_week_classId_week_key" ON "class_week"("classId", "week");

-- AddForeignKey
ALTER TABLE "point_event" ADD CONSTRAINT "point_event_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_stats" ADD CONSTRAINT "student_stats_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badge" ADD CONSTRAINT "badge_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


