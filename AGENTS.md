<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Development State (2026-11-03)

### Current Milestone
- Smart Exercise Substitution System (instant reuse of saved swaps by exercise + objective, "Substituir só hoje" vs "Substituir sempre", biomechanical SmartFit fallback, and Master Coach / Data Analyst integration), full security/timezone/N+1 audit fixes, and multi-sport scheduling.

### Implemented In This Iteration
1. **Smart Exercise Substitution & "Substituir Sempre"**:
   - Created [`lib/ai/exercise-swap.ts`](file:///c:/Users/souza/Personal-Trainer/lib/ai/exercise-swap.ts) and unit test suite [`lib/ai/exercise-swap.test.ts`](file:///c:/Users/souza/Personal-Trainer/lib/ai/exercise-swap.test.ts).
   - Fixed authentication and schema validation in [`app/api/coach/assistant/route.ts`](file:///c:/Users/souza/Personal-Trainer/app/api/coach/assistant/route.ts) and [`lib/ai/contracts.ts`](file:///c:/Users/souza/Personal-Trainer/lib/ai/contracts.ts) (`assistantOutputSchema`), adding `maxDuration = 300`, a resilient model cascade, and a deterministic SmartFit biomechanical fallback catalog (`getBiomechanicalSwapFallback`).
   - **Instant Saved Options Reuse**: When requesting a substitution for an exercise that was already substituted under the same mesocycle objective, saved suggestions from `ExercisePrescription.substitutionHints` / `ExerciseSwapSuggestion` are returned immediately (`fromCache: true`) with previously selected options promoted to the top, plus a button to request fresh AI suggestions on demand.
   - **"Substituir só hoje" vs "Substituir sempre"**: Added `PATCH /api/coach/assistant` and updated [`HypertrophyDailyTracker.tsx`](file:///c:/Users/souza/Personal-Trainer/app/components/HypertrophyDailyTracker.tsx) so the athlete can either swap for today's workout only (`applyScope: 'today'`) or permanently replace the exercise across the active mesocycle (`applyScope: 'always'`), automatically recalculating progressive overload for the replacement exercise.
   - **Main AI Communication (`Data Analyst` & `Master Coach`)**: Integrated `buildExerciseSubstitutionSummary` into [`app/api/coach/analyst/route.ts`](file:///c:/Users/souza/Personal-Trainer/app/api/coach/analyst/route.ts), [`app/api/coach/master/generate/route.ts`](file:///c:/Users/souza/Personal-Trainer/app/api/coach/master/generate/route.ts), [`lib/ai/prompts.ts`](file:///c:/Users/souza/Personal-Trainer/lib/ai/prompts.ts), and [`lib/db/hypertrophyMappers.ts`](file:///c:/Users/souza/Personal-Trainer/lib/db/hypertrophyMappers.ts) so permanent and frequent swaps are respected in future mesocycles.

2. **Full Project Audit Fixes (Security, Timezone `America/Sao_Paulo`, Performance)**:
   - Standardized date helpers (`todayISO`, `shiftISODate`, `mondayOfISODate`, `weekRangeOfISODate`) in [`lib/dates.ts`](file:///c:/Users/souza/Personal-Trainer/lib/dates.ts) and [`lib/dateUtils.ts`](file:///c:/Users/souza/Personal-Trainer/lib/dateUtils.ts) to `America/Sao_Paulo`.
   - Hardened [`lib/auth.ts`](file:///c:/Users/souza/Personal-Trainer/lib/auth.ts) for same-origin UI requests (`sec-fetch-site`, `origin`, `referer` vs `host`/`x-forwarded-host`) and token validation, and added SSRF validation to [`app/api/integrations/metabolic/route.ts`](file:///c:/Users/souza/Personal-Trainer/app/api/integrations/metabolic/route.ts).
   - Eliminated N+1 queries in [`GET /api/workout/today`](file:///c:/Users/souza/Personal-Trainer/app/api/workout/today/route.ts) and [`POST /api/cross-training`](file:///c:/Users/souza/Personal-Trainer/app/api/cross-training/route.ts), and moved metabolic tracker sync to `after()` in [`POST /api/running/execution`](file:///c:/Users/souza/Personal-Trainer/app/api/running/execution/route.ts).

### Verification Notes
- Run typecheck: `npx tsc --noEmit` -> 0 errors.
- Run linter: `npx eslint app/ lib/` -> 0 errors / 0 warnings.
- Unit tests: `npx tsx --test` -> 64/64 tests passing (100% assertions green).
