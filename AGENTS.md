<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Development State (2026-09-27)

### Current Milestone
- Completed full multi-sport expansion (hypertrophy preservation + running coach AI + Strava integration + cross-training + unified interactive calendar + analytics & visual polish + smart multi-sport scheduler).

### Implemented In This Iteration
- Strava / Running Plan Linking & Reconciliation:
  - Created `/api/running/session/link` endpoint supporting candidate retrieval, manual/Strava execution linking, unlinking, and calendar event deduplication.
  - Built `LinkRunningSessionModal.tsx` modal for linking any executed run to planned mesocycle sessions.
  - Added interactive `🔗 Link` buttons to completed and planned running cards in `WeeklyCalendar.tsx`.
  - Added `🔗 Vincular` buttons to session cards and unlinked activities alert banner in `/running`.
  - Enhanced Strava auto-match in `lib/strava/client.ts` with +/- 1 day tolerance and duplicate event cleanup.
- Strength Hub (`/strength`) Dynamic Alignment & AI Split Rebalancing:
  - Updated `/api/workout/today` to prioritize workouts scheduled in `CalendarEvent` for the requested date, immediately presenting the day's scheduled workout.
  - Implemented `applyWorkoutTemplateSelectionAndRebalance` in `lib/scheduling/strength-scheduler.ts` to fix the selected workout to the date and deterministically rebalance the remaining days of the week following the AI split order while avoiding collisions with running long runs and CrossFit.
  - Created `POST /api/workout/select-template` endpoint.
  - Updated `HypertrophyDailyTracker.tsx` so changing templates instantly updates the calendar and reorganizes the week.

- Running Performance Debrief & Planned Target Conformity Evaluation:
  - Created `lib/running/performance-evaluator.ts` comparing planned session targets (distance, target pace, Karvonen heart rate zones) against execution telemetry (distance, duration, average pace, HR, cadence, kilometer splits, elevation, RPE).
  - Implemented Adherence Score (0-100) and factual Coach Feedback generation.
  - Built `RunningDebriefModal.tsx` displaying comparative targets, delta indicators, cadence economy, kilometer splits (identifying fastest/slowest splits and negative/positive pacing), and AI coach debriefing.
  - Added mini-telemetry summary chip and `"📊 Ver Estatísticas"` button to completed cards in `/running`.
  - Added `"📊 Stats"` button to completed running cards in `WeeklyCalendar.tsx`.
  - Enriched `/api/running/profile`, `/api/running/generate`, and `/api/running/session/link` to include executions and HR zones.

- Multi-Sport Caloric Expenditure Engine & Metabolic Balancing:
  - Implemented 3-layer hybrid scientific energy model for strength training in `lib/calories/strength-calories.ts` (Mechanical work + Movement multiplier + Allometric scaling $(W/75)^{0.75}$ + Inter-set recovery + EPOC).
  - Implemented Margaria constant + ACSM elevation formula in `lib/calories/running-calories.ts` with Strava native telemetry prioritization.
  - Implemented MET + RPE modifier + EPOC model for cross-training in `lib/calories/crosstraining-calories.ts`.
  - Added dynamic weight resolution hierarchy in `lib/calories/athlete-weight.ts` (`WellnessDaily` on workout date -> recent `WellnessDaily` -> `AthleteProfile` baseline -> 75kg default).
  - Integrated caloric persistence in `WorkoutExecution`, `RunningExecution`, `CrossTrainingActivity`, and `CalendarEvent`.
  - Expanded `AthleteProfile` schema with anthropometric and metabolic fields (`bodyWeightKg`, `heightCm`, `birthDate`, `biologicalSex`, `bodyFatPercent`).
  - Added Anthropometrics & Basal Metabolic Rate (Mifflin-St Jeor) settings in `SettingsClient.tsx` and onboarding inputs in `OnboardingForm.tsx`.
  - Added caloric display in `WeeklyCalendar.tsx` (event flames & weekly summary aggregate), `PostWorkoutSummaryModal.tsx` (mechanical, recovery, EPOC breakdown), and `RunningDebriefModal.tsx`.
  - Embedded energy expenditure awareness into `DataAnalystAI` (framework item 6) and `MasterCoachAI` (directive 8) in `lib/ai/prompts.ts`.

### Architectural Decisions Confirmed
- Multi-sport unified aggregation layer: `CalendarEvent` acts as polymorphic coordinator across strength, running, and cross-training.
- Calorie computation is deterministic, evidence-based, and decoupled from AI generation to ensure instant, reproducible calculations.
- Master Coach & Running Coach use separate OpenRouter cascades:
  - Master Coach & Running Coach: `deepseek/deepseek-v4-pro` -> `qwen/qwen3.7-plus` -> `deepseek/deepseek-v4-flash-0731`.
- SSR client guard pattern: Reusable `useIsClient` hook using `useSyncExternalStore` avoids cascading re-renders and strictly complies with Next.js / React 19 ESLint rules.
- Contract-first output is mandatory for all model responses (Ajv validated).
- ESLint checks must pass cleanly prior to any production deploy.

### Pending Work
- Set production Strava environment variables in Vercel (`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_WEBHOOK_VERIFY_TOKEN`, `NEXT_PUBLIC_APP_URL`).
- Run `npx prisma db push` on production deployment to migrate anthropometric and caloric columns.
- Optional: Run `npx tsx scripts/backfill-calories.ts` with production database connection to retroactively estimate historical workouts.

### Verification Notes (This Iteration)
- Run typecheck: `npx tsc --noEmit` -> 0 errors.
- Run linter: `npm run lint` -> 0 errors / 0 warnings.
- Unit tests: `npx tsx --test` -> 46/46 tests passing (100% assertions green).
- Production build: `npx next build` -> 0 errors, all 27 routes compiled.


