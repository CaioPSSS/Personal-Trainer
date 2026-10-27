<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Development State (2026-10-24)

### Current Milestone
- Running plan bi-directional live sync, strict past immutability (`date >= todayISO()`), AI Running Coach adherence & recurring cross-training intelligence, recurring CrossFit pre-scheduling on dashboard, and multi-sport repulsion solver.

### Implemented In This Iteration
1. **Running Page Bi-Directional Synchronization & Auto-Healing**:
   - Implemented real-time auto-reconciliation in [`GET /api/running/profile`](file:///c:/Users/souza/Personal-Trainer/app/api/running/profile/route.ts): planned sessions are compared against their `CalendarEvent` counterpart, automatically updating `RunningSession.scheduledDate` and `dayOfWeek` on load.
   - Added `calendar-refresh` event listener to [`app/(main)/running/page.tsx`](file:///c:/Users/souza/Personal-Trainer/app/(main)/running/page.tsx) so moving or rescheduling any workout on the dashboard calendar immediately refreshes the running page in real time.
   - Added an inline date reschedule button on planned session cards in `/running` with an HTML5 date picker bounded by today (`min={today}`), allowing sessions to be moved seamlessly from either the dashboard or the running page.

2. **Strict Forward-Only Rule & Past Immutability (`date >= todayISO()`)**:
   - Enforced across all scheduling entry points:
     - [`PATCH /api/calendar`](file:///c:/Users/souza/Personal-Trainer/app/api/calendar/route.ts): Rejects moving workouts to past dates with HTTP 400.
     - [`POST /api/calendar`](file:///c:/Users/souza/Personal-Trainer/app/api/calendar/route.ts): Rejects creating planned workouts on past dates.
     - [`rebalanceWeekSchedule`](file:///c:/Users/souza/Personal-Trainer/lib/scheduling/strength-scheduler.ts): Locks past days (`< todayISO()`) as immutable fixed schedule contexts, allocating remaining workouts solely to available days on or after today.
     - [`scheduleMesocycleWorkouts`](file:///c:/Users/souza/Personal-Trainer/lib/scheduling/strength-scheduler.ts): Skips creating planned strength events on past dates.
     - [`POST /api/running/generate`](file:///c:/Users/souza/Personal-Trainer/app/api/running/generate/route.ts): Never deletes past sessions or completed runs (`< todayISO()`), and never creates planned running sessions on past dates.

3. **Recurring CrossFit / Cross-Training Pre-Scheduling & Individual Reschedule Overrides**:
   - Added `recurringCrossTraining Json?` column to [`AthleteProfile`](file:///c:/Users/souza/Personal-Trainer/prisma/schema.prisma).
   - Created [`lib/scheduling/cross-training-scheduler.ts`](file:///c:/Users/souza/Personal-Trainer/lib/scheduling/cross-training-scheduler.ts) (`syncPlannedCrossTraining`): projects recurring workouts (e.g. CrossFit every Monday & Wednesday, 60 min) forward for upcoming weeks strictly starting from today (`>= todayISO()`). Automatically prunes outdated planned future occurrences when rules change.
   - **Individual Reschedule Overrides**: When moving a single occurrence of a recurring workout (e.g. from Monday to Thursday), `originalDate` preserves the origin. `syncPlannedCrossTraining` (`shouldPruneRecurringEvent`) never deletes the moved workout, and `buildOccupiedScheduleSlots` marks the original day as satisfied so it never resurrects on the original day.
   - Also synchronizes [`CrossTrainingActivity.date`](file:///c:/Users/souza/Personal-Trainer/app/api/calendar/route.ts) on PATCH and automatically triggers [`rebalanceWeekSchedule`](file:///c:/Users/souza/Personal-Trainer/lib/scheduling/strength-scheduler.ts) to repel leg workouts away from the new CrossFit date.
   - Created [`/api/cross-training/recurring`](file:///c:/Users/souza/Personal-Trainer/app/api/cross-training/recurring/route.ts) endpoint (GET/POST) and integrated into [`GET /api/calendar`](file:///c:/Users/souza/Personal-Trainer/app/api/calendar/route.ts).
   - Built [`RecurringCrossTrainingModal`](file:///c:/Users/souza/Personal-Trainer/app/components/RecurringCrossTrainingModal.tsx) and added a "CrossFit Recorrente" action button in [`WeeklyCalendar`](file:///c:/Users/souza/Personal-Trainer/app/components/WeeklyCalendar.tsx).
   - Integrated with multi-sport strength solver: planned CrossFit events in the calendar automatically repel Leg Days (+9500 penalty on same day, +4500 on day after).

4. **AI Running Coach Plan Adherence & Cross-Training Context Enrichment**:
   - Updated [`buildRunningCoachPrompts`](file:///c:/Users/souza/Personal-Trainer/lib/ai/running-prompts.ts) and [`app/api/running/generate/route.ts`](file:///c:/Users/souza/Personal-Trainer/app/api/running/generate/route.ts):
     - Calculates active mesocycle adherence summary (`totalPlannedSessions`, `completedCount`, `skippedCount`, `adherencePercentage`, `totalPlannedKm` vs `totalExecutedKm`, and skipped session notes).
     - Feeds the AI with fixed recurring cross-training commitments, instructing the coach never to schedule high-intensity quality sessions (Intervals, Tempo, Hill Repeats) on CrossFit days or immediately following lower-body WODs.

### Verification Notes
- Run typecheck: `npx tsc --noEmit` -> 0 errors.
- Run linter: `npx eslint app/ lib/` -> 0 errors / 0 warnings.
- Unit tests: `npx tsx --test` -> 58/58 tests passing (100% assertions green).
- Production build: `npx next build` -> 0 errors, all 29 routes compiled successfully.


