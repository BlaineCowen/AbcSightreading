-- CreateTable
CREATE TABLE "class_piece" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_piece_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "class_piece_classId_pieceId_key" ON "class_piece"("classId", "pieceId");

-- CreateIndex
CREATE INDEX "class_piece_pieceId_idx" ON "class_piece"("pieceId");

-- AddForeignKey
ALTER TABLE "class_piece" ADD CONSTRAINT "class_piece_classId_fkey" FOREIGN KEY ("classId") REFERENCES "class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_piece" ADD CONSTRAINT "class_piece_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "piece"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every piece already assigned goes into its class's library.
INSERT INTO "class_piece" ("id", "classId", "pieceId", "createdAt")
SELECT 'cp_' || md5(a."classId" || p."id"), a."classId", p."id", MIN(a."createdAt")
FROM "assignment" a
JOIN "piece" p ON a."presetKey" = 'piece:' || p."id"
GROUP BY a."classId", p."id"
ON CONFLICT DO NOTHING;
