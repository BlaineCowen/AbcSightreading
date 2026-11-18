-- An ear game's round id on its result, so one round is counted once (game-assignments). Additive.
ALTER TABLE "game_assignment_result" ADD COLUMN "round" TEXT;
CREATE UNIQUE INDEX "game_assignment_result_round_key" ON "game_assignment_result"("round");
