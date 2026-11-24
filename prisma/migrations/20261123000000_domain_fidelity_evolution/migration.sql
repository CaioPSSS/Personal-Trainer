-- Domain Fidelity Evolution Migration (Non-destructive / Lossless)
-- Evolves string status/source columns to Postgres enums, upgrades WellnessDaily to composite PK,
-- links RunningProfile/StravaIntegration/ExerciseSwapSuggestion to AthleteProfile,
-- links WorkoutExecution to WorkoutDayTemplate, and extracts SkipStrategy on CalendarEvent.

-- 1. Create Enums
CREATE TYPE "PlanStatus" AS ENUM ('draft', 'active', 'completed', 'archived');
CREATE TYPE "ScheduleStatus" AS ENUM ('planned', 'completed', 'skipped');
CREATE TYPE "WorkoutExecutionStatus" AS ENUM ('completed', 'in_progress', 'skipped');
CREATE TYPE "RunningSource" AS ENUM ('manual', 'strava');
CREATE TYPE "SkipStrategy" AS ENUM ('skip_only', 'skip_and_reschedule');

-- 2. Safely normalize & convert string columns to enums
ALTER TABLE "MesocyclePlan" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "MesocyclePlan"
  ALTER COLUMN "status" TYPE "PlanStatus"
  USING (
    CASE
      WHEN "status" IN ('draft', 'active', 'completed', 'archived') THEN "status"::"PlanStatus"
      ELSE 'draft'::"PlanStatus"
    END
  );
ALTER TABLE "MesocyclePlan" ALTER COLUMN "status" SET DEFAULT 'draft';

ALTER TABLE "WorkoutExecution" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "WorkoutExecution"
  ALTER COLUMN "status" TYPE "WorkoutExecutionStatus"
  USING (
    CASE
      WHEN "status" IN ('completed', 'in_progress', 'skipped') THEN "status"::"WorkoutExecutionStatus"
      ELSE 'completed'::"WorkoutExecutionStatus"
    END
  );
ALTER TABLE "WorkoutExecution" ALTER COLUMN "status" SET DEFAULT 'completed';

ALTER TABLE "RunningPlan" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "RunningPlan"
  ALTER COLUMN "status" TYPE "PlanStatus"
  USING (
    CASE
      WHEN "status" IN ('draft', 'active', 'completed', 'archived') THEN "status"::"PlanStatus"
      ELSE 'active'::"PlanStatus"
    END
  );
ALTER TABLE "RunningPlan" ALTER COLUMN "status" SET DEFAULT 'active';

ALTER TABLE "RunningSession" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "RunningSession"
  ALTER COLUMN "status" TYPE "ScheduleStatus"
  USING (
    CASE
      WHEN "status" IN ('planned', 'completed', 'skipped') THEN "status"::"ScheduleStatus"
      ELSE 'planned'::"ScheduleStatus"
    END
  );
ALTER TABLE "RunningSession" ALTER COLUMN "status" SET DEFAULT 'planned';

ALTER TABLE "RunningExecution" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "RunningExecution"
  ALTER COLUMN "source" TYPE "RunningSource"
  USING (
    CASE
      WHEN "source" IN ('manual', 'strava') THEN "source"::"RunningSource"
      ELSE 'manual'::"RunningSource"
    END
  );
ALTER TABLE "RunningExecution" ALTER COLUMN "source" SET DEFAULT 'manual';

ALTER TABLE "CrossTrainingActivity" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "CrossTrainingActivity"
  ALTER COLUMN "status" TYPE "ScheduleStatus"
  USING (
    CASE
      WHEN "status" IN ('planned', 'completed', 'skipped') THEN "status"::"ScheduleStatus"
      ELSE 'completed'::"ScheduleStatus"
    END
  );
ALTER TABLE "CrossTrainingActivity" ALTER COLUMN "status" SET DEFAULT 'completed';

ALTER TABLE "CalendarEvent" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "CalendarEvent"
  ALTER COLUMN "status" TYPE "ScheduleStatus"
  USING (
    CASE
      WHEN "status" IN ('planned', 'completed', 'skipped') THEN "status"::"ScheduleStatus"
      ELSE 'planned'::"ScheduleStatus"
    END
  );
ALTER TABLE "CalendarEvent" ALTER COLUMN "status" SET DEFAULT 'planned';

-- 3. Upgrade WellnessDaily primary key to (athleteProfileId, date)
ALTER TABLE "WellnessDaily" DROP CONSTRAINT "WellnessDaily_pkey";
ALTER TABLE "WellnessDaily" ADD CONSTRAINT "WellnessDaily_pkey" PRIMARY KEY ("athleteProfileId", "date");

-- 4. Add WorkoutExecution -> WorkoutDayTemplate relation
ALTER TABLE "WorkoutExecution" ADD COLUMN "workoutDayTemplateId" TEXT;
CREATE INDEX "WorkoutExecution_workoutDayTemplateId_idx" ON "WorkoutExecution"("workoutDayTemplateId");
ALTER TABLE "WorkoutExecution"
  ADD CONSTRAINT "WorkoutExecution_workoutDayTemplateId_fkey"
  FOREIGN KEY ("workoutDayTemplateId") REFERENCES "WorkoutDayTemplate"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Enrich ExerciseSwapSuggestion & backfill AthleteProfile singleton if present
ALTER TABLE "ExerciseSwapSuggestion"
  ADD COLUMN "athleteProfileId" TEXT,
  ADD COLUMN "objective" TEXT,
  ADD COLUMN "isPermanent" BOOLEAN NOT NULL DEFAULT false;

UPDATE "ExerciseSwapSuggestion"
SET "athleteProfileId" = 'singleton'
WHERE "athleteProfileId" IS NULL
  AND EXISTS (SELECT 1 FROM "AthleteProfile" WHERE "id" = 'singleton');

CREATE INDEX "ExerciseSwapSuggestion_athleteProfileId_objective_createdAt_idx"
  ON "ExerciseSwapSuggestion"("athleteProfileId", "objective", "createdAt" DESC);

ALTER TABLE "ExerciseSwapSuggestion"
  ADD CONSTRAINT "ExerciseSwapSuggestion_athleteProfileId_fkey"
  FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Link RunningProfile & StravaIntegration to AthleteProfile
ALTER TABLE "RunningProfile" ADD COLUMN "athleteProfileId" TEXT;
UPDATE "RunningProfile"
SET "athleteProfileId" = 'singleton'
WHERE "athleteProfileId" IS NULL
  AND "id" = 'singleton'
  AND EXISTS (SELECT 1 FROM "AthleteProfile" WHERE "id" = 'singleton');

CREATE UNIQUE INDEX "RunningProfile_athleteProfileId_key" ON "RunningProfile"("athleteProfileId");
ALTER TABLE "RunningProfile"
  ADD CONSTRAINT "RunningProfile_athleteProfileId_fkey"
  FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StravaIntegration" ADD COLUMN "athleteProfileId" TEXT;
UPDATE "StravaIntegration"
SET "athleteProfileId" = 'singleton'
WHERE "athleteProfileId" IS NULL
  AND "id" = 'singleton'
  AND EXISTS (SELECT 1 FROM "AthleteProfile" WHERE "id" = 'singleton');

CREATE UNIQUE INDEX "StravaIntegration_athleteProfileId_key" ON "StravaIntegration"("athleteProfileId");
ALTER TABLE "StravaIntegration"
  ADD CONSTRAINT "StravaIntegration_athleteProfileId_fkey"
  FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. Extract CalendarEvent.skipStrategy from legacy originalDate sentinels
ALTER TABLE "CalendarEvent" ADD COLUMN "skipStrategy" "SkipStrategy";

UPDATE "CalendarEvent"
SET
  "skipStrategy" = 'skip_and_reschedule'::"SkipStrategy",
  "originalDate" = NULLIF(split_part("originalDate", '::', 2), '')
WHERE "originalDate" = 'skip_and_reschedule' OR "originalDate" LIKE 'skip_and_reschedule::%';

UPDATE "CalendarEvent"
SET
  "skipStrategy" = 'skip_only'::"SkipStrategy",
  "originalDate" = NULLIF(split_part("originalDate", '::', 2), '')
WHERE "originalDate" = 'skip_only' OR "originalDate" LIKE 'skip_only::%';
