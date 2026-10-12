-- CreateTable
CREATE TABLE "live_room" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "page" TEXT NOT NULL DEFAULT 'choral',
    "abc" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "settings" JSONB,
    "play" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_device" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "deviceKey" TEXT NOT NULL,
    "part" TEXT,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_device_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "live_room_code_key" ON "live_room"("code");

-- CreateIndex
CREATE UNIQUE INDEX "live_room_teacherId_key" ON "live_room"("teacherId");

-- CreateIndex
CREATE INDEX "live_device_roomId_seenAt_idx" ON "live_device"("roomId", "seenAt");

-- CreateIndex
CREATE UNIQUE INDEX "live_device_roomId_deviceKey_key" ON "live_device"("roomId", "deviceKey");

-- AddForeignKey
ALTER TABLE "live_room" ADD CONSTRAINT "live_room_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_device" ADD CONSTRAINT "live_device_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "live_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

