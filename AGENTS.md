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

### Architectural Decisions Confirmed
- Multi-sport unified aggregation layer: `CalendarEvent` acts as polymorphic coordinator across strength, running, and cross-training.
- Master Coach & Running Coach use separate OpenRouter cascades:
  - Master Coach & Running Coach: `deepseek/deepseek-v4-pro` -> `qwen/qwen3.7-plus` -> `deepseek/deepseek-v4-flash-0731`.
- SSR client guard pattern: Reusable `useIsClient` hook using `useSyncExternalStore` avoids cascading re-renders and strictly complies with Next.js / React 19 ESLint rules.
- Contract-first output is mandatory for all model responses (Ajv validated).
- ESLint checks must pass cleanly prior to any production deploy.

### Pending Work
- Set production Strava environment variables in Vercel (`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_WEBHOOK_VERIFY_TOKEN`, `NEXT_PUBLIC_APP_URL`).
- Verify production database migration via `prisma db push` on first Vercel deployment.

### Verification Notes (This Iteration)
- Run typecheck: `npx tsc --noEmit` -> 0 errors.
- Run linter: `npm run lint` -> 0 errors / 0 warnings.
- Unit tests: `npx tsx --test` -> 41/41 tests passing (100% assertions green).
- Production build: `npx next build` -> 0 errors, all 27 routes compiled.


