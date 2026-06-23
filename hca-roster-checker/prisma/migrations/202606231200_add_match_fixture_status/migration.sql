CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'READY_TO_IMPORT', 'IMPORTED', 'NEEDS_REVIEW');

ALTER TABLE "Match"
ADD COLUMN "axisTeamId" TEXT,
ADD COLUMN "alliesTeamId" TEXT,
ADD COLUMN "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED';

UPDATE "Match"
SET
  "axisTeamId" = "teamAId",
  "alliesTeamId" = "teamBId",
  "status" = CASE
    WHEN EXISTS (
      SELECT 1
      FROM "MatchPlayer"
      WHERE "MatchPlayer"."matchId" = "Match"."id"
    ) THEN 'IMPORTED'::"MatchStatus"
    WHEN "gameUrl" IS NOT NULL AND "gameUrl" <> '' THEN 'READY_TO_IMPORT'::"MatchStatus"
    ELSE 'SCHEDULED'::"MatchStatus"
  END;

CREATE INDEX "Match_status_idx" ON "Match"("status");
