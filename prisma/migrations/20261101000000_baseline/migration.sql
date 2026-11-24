-- CreateTable
CREATE TABLE "AthleteProfile" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "displayName" TEXT,
    "trainingAgeYears" DOUBLE PRECISION,
    "sessionDurationMin" INTEGER NOT NULL DEFAULT 60,
    "athleteContext" TEXT,
    "availableEquipment" JSONB,
    "movementRestrictions" JSONB,
    "availableDays" JSONB,
    "weeklyWorkoutsTarget" INTEGER,
    "bodyWeightKg" DOUBLE PRECISION,
    "heightCm" INTEGER,
    "birthDate" TEXT,
    "biologicalSex" TEXT,
    "bodyFatPercent" DOUBLE PRECISION,
    "metabolicTrackerUrl" TEXT,
    "recurringCrossTraining" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AthleteProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MesocyclePlan" (
    "id" TEXT NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "split" TEXT NOT NULL,
    "durationWeeks" INTEGER NOT NULL,
    "targetSessionMinutes" INTEGER NOT NULL DEFAULT 60,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "startDate" TEXT,
    "endDate" TEXT,
    "volumeLandmarks" JSONB,
    "progressionRules" JSONB,
    "rawPlan" JSONB,
    "createdByAiRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MesocyclePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MesocycleWeek" (
    "id" TEXT NOT NULL,
    "mesocyclePlanId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "targetVolume" JSONB,
    "intensityRules" JSONB,
    "isDeload" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MesocycleWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutDayTemplate" (
    "id" TEXT NOT NULL,
    "mesocyclePlanId" TEXT NOT NULL,
    "dayOrder" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "focusMuscles" JSONB,
    "estimatedDurationMin" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutDayTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExercisePrescription" (
    "id" TEXT NOT NULL,
    "workoutDayTemplateId" TEXT NOT NULL,
    "exerciseKey" TEXT NOT NULL,
    "exerciseName" TEXT NOT NULL,
    "movementPattern" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "targetSets" INTEGER NOT NULL,
    "targetRepMin" INTEGER NOT NULL,
    "targetRepMax" INTEGER NOT NULL,
    "targetRpeMin" DOUBLE PRECISION,
    "targetRpeMax" DOUBLE PRECISION,
    "restSeconds" INTEGER,
    "advancedTechnique" TEXT,
    "substitutionHints" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExercisePrescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutExecution" (
    "id" TEXT NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    "mesocyclePlanId" TEXT,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "sessionRpe" DOUBLE PRECISION,
    "durationMinutes" INTEGER,
    "caloriesBurned" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseExecution" (
    "id" TEXT NOT NULL,
    "workoutExecutionId" TEXT NOT NULL,
    "exercisePrescriptionId" TEXT,
    "exerciseName" TEXT NOT NULL,
    "movementPattern" TEXT,
    "substitutedFrom" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetExecution" (
    "id" TEXT NOT NULL,
    "exerciseExecutionId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "loadKg" DOUBLE PRECISION,
    "reps" INTEGER NOT NULL,
    "rpe" DOUBLE PRECISION,
    "isFailure" BOOLEAN NOT NULL DEFAULT false,
    "restSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SetExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellnessDaily" (
    "date" TEXT NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    "sleepHours" DOUBLE PRECISION,
    "fatigueLevel" INTEGER,
    "mood" TEXT,
    "sorenessLevel" INTEGER,
    "energyLevel" INTEGER,
    "stressLevel" INTEGER,
    "bodyWeightKg" DOUBLE PRECISION,
    "caloriesConsumed" INTEGER,
    "proteinConsumed" INTEGER,
    "calorieTarget" INTEGER,
    "dietGoal" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WellnessDaily_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "AssistantAlert" (
    "id" TEXT NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseSwapSuggestion" (
    "id" TEXT NOT NULL,
    "workoutExecutionId" TEXT,
    "exerciseExecutionId" TEXT,
    "requestedExercise" TEXT NOT NULL,
    "requestedPattern" TEXT,
    "suggestions" JSONB NOT NULL,
    "selectedIndex" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseSwapSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRunLog" (
    "id" TEXT NOT NULL,
    "runType" TEXT NOT NULL,
    "mode" TEXT,
    "status" TEXT NOT NULL,
    "primaryModel" TEXT NOT NULL,
    "fallbackModel" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "latencyMs" INTEGER,
    "validationErrors" JSONB,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachBrainEntry" (
    "id" TEXT NOT NULL,
    "mesocyclePlanId" TEXT NOT NULL,
    "aiRunLogId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "hypotheses" JSONB NOT NULL,
    "retrospective" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachBrainEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunningProfile" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "currentPace5kSec" INTEGER,
    "currentPace10kSec" INTEGER,
    "currentPaceHalfSec" INTEGER,
    "weeklyVolumeKm" DOUBLE PRECISION,
    "maxHeartRate" INTEGER,
    "restingHeartRate" INTEGER,
    "primaryObjective" TEXT,
    "targetPaceSec" INTEGER,
    "targetDistanceKm" DOUBLE PRECISION,
    "availableDays" JSONB,
    "weeklyRunsTarget" INTEGER,
    "injuryHistory" JSONB,
    "primaryTerrain" TEXT,
    "hrZones" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunningProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunningPlan" (
    "id" TEXT NOT NULL,
    "runningProfileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "objective" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "weeklyTargetKm" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'active',
    "rawPlan" JSONB,
    "createdByAiRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunningPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunningSession" (
    "id" TEXT NOT NULL,
    "runningPlanId" TEXT NOT NULL,
    "scheduledDate" TEXT NOT NULL,
    "dayOfWeek" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "sessionType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "totalDistanceKm" DOUBLE PRECISION,
    "totalDurationMin" INTEGER,
    "targetPaceSec" INTEGER,
    "targetHrZone" TEXT,
    "segments" JSONB,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunningSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunningExecution" (
    "id" TEXT NOT NULL,
    "runningProfileId" TEXT NOT NULL,
    "runningSessionId" TEXT,
    "date" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "stravaActivityId" TEXT,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "avgPaceSec" INTEGER,
    "avgHeartRate" INTEGER,
    "maxHeartRate" INTEGER,
    "elevationGainM" DOUBLE PRECISION,
    "cadenceAvg" INTEGER,
    "temperature" DOUBLE PRECISION,
    "splits" JSONB,
    "sessionRpe" DOUBLE PRECISION,
    "caloriesBurned" INTEGER,
    "caloriesSource" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunningExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunningBrainEntry" (
    "id" TEXT NOT NULL,
    "runningProfileId" TEXT NOT NULL,
    "aiRunLogId" TEXT,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "hypotheses" JSONB NOT NULL,
    "retrospective" JSONB,
    "decayWeight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunningBrainEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrossTrainingActivity" (
    "id" TEXT NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "title" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "sessionRpe" DOUBLE PRECISION,
    "muscleGroups" JSONB,
    "caloriesBurned" INTEGER,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrossTrainingActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StravaIntegration" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" INTEGER NOT NULL,
    "athleteStravaId" INTEGER NOT NULL,
    "scope" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StravaIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "referenceId" TEXT,
    "referenceModel" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "colorCode" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "caloriesBurned" INTEGER,
    "originalDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MesocyclePlan_athleteProfileId_createdAt_idx" ON "MesocyclePlan"("athleteProfileId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MesocyclePlan_status_idx" ON "MesocyclePlan"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MesocycleWeek_mesocyclePlanId_weekNumber_key" ON "MesocycleWeek"("mesocyclePlanId", "weekNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutDayTemplate_mesocyclePlanId_dayOrder_key" ON "WorkoutDayTemplate"("mesocyclePlanId", "dayOrder");

-- CreateIndex
CREATE INDEX "ExercisePrescription_exerciseKey_idx" ON "ExercisePrescription"("exerciseKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExercisePrescription_workoutDayTemplateId_sortOrder_key" ON "ExercisePrescription"("workoutDayTemplateId", "sortOrder");

-- CreateIndex
CREATE INDEX "WorkoutExecution_athleteProfileId_date_idx" ON "WorkoutExecution"("athleteProfileId", "date" DESC);

-- CreateIndex
CREATE INDEX "WorkoutExecution_mesocyclePlanId_date_idx" ON "WorkoutExecution"("mesocyclePlanId", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseExecution_workoutExecutionId_sortOrder_key" ON "ExerciseExecution"("workoutExecutionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SetExecution_exerciseExecutionId_setNumber_key" ON "SetExecution"("exerciseExecutionId", "setNumber");

-- CreateIndex
CREATE INDEX "WellnessDaily_athleteProfileId_date_idx" ON "WellnessDaily"("athleteProfileId", "date" DESC);

-- CreateIndex
CREATE INDEX "AssistantAlert_athleteProfileId_date_idx" ON "AssistantAlert"("athleteProfileId", "date" DESC);

-- CreateIndex
CREATE INDEX "AssistantAlert_isResolved_createdAt_idx" ON "AssistantAlert"("isResolved", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ExerciseSwapSuggestion_createdAt_idx" ON "ExerciseSwapSuggestion"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "AiRunLog_runType_createdAt_idx" ON "AiRunLog"("runType", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AiRunLog_status_createdAt_idx" ON "AiRunLog"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CoachBrainEntry_mesocyclePlanId_createdAt_idx" ON "CoachBrainEntry"("mesocyclePlanId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "RunningPlan_status_idx" ON "RunningPlan"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RunningPlan_runningProfileId_month_year_key" ON "RunningPlan"("runningProfileId", "month", "year");

-- CreateIndex
CREATE INDEX "RunningSession_runningPlanId_scheduledDate_idx" ON "RunningSession"("runningPlanId", "scheduledDate");

-- CreateIndex
CREATE INDEX "RunningSession_status_idx" ON "RunningSession"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RunningExecution_stravaActivityId_key" ON "RunningExecution"("stravaActivityId");

-- CreateIndex
CREATE INDEX "RunningExecution_runningProfileId_date_idx" ON "RunningExecution"("runningProfileId", "date" DESC);

-- CreateIndex
CREATE INDEX "RunningExecution_source_idx" ON "RunningExecution"("source");

-- CreateIndex
CREATE INDEX "RunningBrainEntry_runningProfileId_createdAt_idx" ON "RunningBrainEntry"("runningProfileId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "RunningBrainEntry_runningProfileId_month_year_key" ON "RunningBrainEntry"("runningProfileId", "month", "year");

-- CreateIndex
CREATE INDEX "CrossTrainingActivity_athleteProfileId_date_idx" ON "CrossTrainingActivity"("athleteProfileId", "date" DESC);

-- CreateIndex
CREATE INDEX "CrossTrainingActivity_activityType_idx" ON "CrossTrainingActivity"("activityType");

-- CreateIndex
CREATE UNIQUE INDEX "StravaIntegration_athleteStravaId_key" ON "StravaIntegration"("athleteStravaId");

-- CreateIndex
CREATE INDEX "CalendarEvent_athleteProfileId_date_idx" ON "CalendarEvent"("athleteProfileId", "date");

-- CreateIndex
CREATE INDEX "CalendarEvent_eventType_date_idx" ON "CalendarEvent"("eventType", "date");

-- CreateIndex
CREATE INDEX "CalendarEvent_referenceId_idx" ON "CalendarEvent"("referenceId");

-- AddForeignKey
ALTER TABLE "MesocyclePlan" ADD CONSTRAINT "MesocyclePlan_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesocycleWeek" ADD CONSTRAINT "MesocycleWeek_mesocyclePlanId_fkey" FOREIGN KEY ("mesocyclePlanId") REFERENCES "MesocyclePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutDayTemplate" ADD CONSTRAINT "WorkoutDayTemplate_mesocyclePlanId_fkey" FOREIGN KEY ("mesocyclePlanId") REFERENCES "MesocyclePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExercisePrescription" ADD CONSTRAINT "ExercisePrescription_workoutDayTemplateId_fkey" FOREIGN KEY ("workoutDayTemplateId") REFERENCES "WorkoutDayTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutExecution" ADD CONSTRAINT "WorkoutExecution_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutExecution" ADD CONSTRAINT "WorkoutExecution_mesocyclePlanId_fkey" FOREIGN KEY ("mesocyclePlanId") REFERENCES "MesocyclePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseExecution" ADD CONSTRAINT "ExerciseExecution_workoutExecutionId_fkey" FOREIGN KEY ("workoutExecutionId") REFERENCES "WorkoutExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseExecution" ADD CONSTRAINT "ExerciseExecution_exercisePrescriptionId_fkey" FOREIGN KEY ("exercisePrescriptionId") REFERENCES "ExercisePrescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetExecution" ADD CONSTRAINT "SetExecution_exerciseExecutionId_fkey" FOREIGN KEY ("exerciseExecutionId") REFERENCES "ExerciseExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessDaily" ADD CONSTRAINT "WellnessDaily_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantAlert" ADD CONSTRAINT "AssistantAlert_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseSwapSuggestion" ADD CONSTRAINT "ExerciseSwapSuggestion_workoutExecutionId_fkey" FOREIGN KEY ("workoutExecutionId") REFERENCES "WorkoutExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseSwapSuggestion" ADD CONSTRAINT "ExerciseSwapSuggestion_exerciseExecutionId_fkey" FOREIGN KEY ("exerciseExecutionId") REFERENCES "ExerciseExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachBrainEntry" ADD CONSTRAINT "CoachBrainEntry_mesocyclePlanId_fkey" FOREIGN KEY ("mesocyclePlanId") REFERENCES "MesocyclePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunningPlan" ADD CONSTRAINT "RunningPlan_runningProfileId_fkey" FOREIGN KEY ("runningProfileId") REFERENCES "RunningProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunningSession" ADD CONSTRAINT "RunningSession_runningPlanId_fkey" FOREIGN KEY ("runningPlanId") REFERENCES "RunningPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunningExecution" ADD CONSTRAINT "RunningExecution_runningProfileId_fkey" FOREIGN KEY ("runningProfileId") REFERENCES "RunningProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunningExecution" ADD CONSTRAINT "RunningExecution_runningSessionId_fkey" FOREIGN KEY ("runningSessionId") REFERENCES "RunningSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunningBrainEntry" ADD CONSTRAINT "RunningBrainEntry_runningProfileId_fkey" FOREIGN KEY ("runningProfileId") REFERENCES "RunningProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossTrainingActivity" ADD CONSTRAINT "CrossTrainingActivity_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

