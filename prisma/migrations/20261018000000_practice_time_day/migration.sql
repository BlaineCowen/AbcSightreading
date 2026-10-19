-- The daily cron deletes practice past keeping by day (deleteOldPractice).
CREATE INDEX "practice_time_day_idx" ON "practice_time"("day");
