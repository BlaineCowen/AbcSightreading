-- AlterTable
ALTER TABLE "live_room" ADD COLUMN     "game" JSONB;

-- CreateTable
CREATE TABLE "live_game_answer" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "round" TEXT NOT NULL,
    "deviceKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "answer" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_game_answer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_game_answer_roomId_round_idx" ON "live_game_answer"("roomId", "round");

-- CreateIndex
CREATE INDEX "live_game_answer_createdAt_idx" ON "live_game_answer"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "live_game_answer_roomId_round_deviceKey_key" ON "live_game_answer"("roomId", "round", "deviceKey");

-- AddForeignKey
ALTER TABLE "live_game_answer" ADD CONSTRAINT "live_game_answer_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "live_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

