<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Development State (2026-09-27)

### Current Milestone
- Completed full multi-sport expansion (hypertrophy preservation + running coach AI + Strava integration + cross-training + unified interactive calendar + analytics & visual polish + smart multi-sport scheduler).

### Implemented In This Iteration
- Expanded `AthleteProfile` with `availableDays` (custom list of available weekdays) and `weeklyWorkoutsTarget` (configurable target workouts per week).
- Built deterministic, cost-function-based multi-sport scheduler in `lib/scheduling/strength-scheduler.ts` avoiding LLM hallucinations and executing in <3ms:
  - Dynamically distributes $K$ workouts across $|A|$ available days.
  - Automatically isolates Lower Body / Leg days from Running Long Runs (preventing pre-fatigue and post-run eccentric damage) and Intervals/Tiros.
  - Reactive CrossFit rescheduling: immediately upon logging CrossFit or high-fatigue cross-training, remaining strength workouts dynamically re-align.
- Built `/api/schedule/rebalance` endpoint for on-demand week optimization.
- Added interactive controls in `SettingsClient.tsx` (toggleable week day pills, target selector 2-6 workouts, instant rebalancing button).
- Added `⚡ Rebalancear` button to `WeeklyCalendar.tsx` header toolbar with toast notifications.
- Added cross-week drag-and-drop navigation with hover-paging and drop zones for Sunday/Monday.

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
- Rebuilt Prisma Client types: `npx prisma generate` -> 0 errors.
- Run typecheck: `npx tsc --noEmit` -> 0 errors.
- Run linter: `npm run lint` -> 0 errors / 0 warnings.
- Unit tests: `npx tsx --test` -> 21/21 tests passing (including 10 deterministic multi-sport scheduler tests).
- Production build: `npx next build` -> 0 errors, all 24 routes compiled.
