-- One row per student, badge and level (a teacher's badge given again is its next level).
CREATE UNIQUE INDEX "badge_studentId_badgeId_level_key" ON "badge"("studentId", "badgeId", "level");
