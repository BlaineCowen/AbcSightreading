-- A portfolio checkpoint's rubric level (src/lib/portfolio.ts). Nullable, so nothing existing changes.
ALTER TABLE "piece_attempt" ADD COLUMN "rubric" INTEGER;
