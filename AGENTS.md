<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Development State (2026-09-27)

### Current Milestone
- Completed full multi-sport expansion (hypertrophy preservation + running coach AI + Strava integration + cross-training + unified interactive calendar + analytics & visual polish).

### Implemented In This Iteration
- Expanded Prisma Schema with 8 models: `RunningProfile`, `RunningPlan`, `RunningSession`, `RunningExecution`, `RunningBrainEntry`, `CrossTrainingActivity`, `StravaIntegration`, `CalendarEvent`.
- Implemented deterministic weekly strength scheduler (`lib/scheduling/strength-scheduler.ts`) balancing split days and recovery.
- Built unified interactive calendar with weekly agenda view (HTML5 drag-and-drop, sport color-coding, volume summaries) and monthly dot grid view.
- Added differentiated skip mechanics: strength ("pular apenas" vs "pular e reagendar +1 dia") and running (mark skipped + AI signal).
- Added cross-training logging (CrossFit, swimming, cycling, yoga, martial arts) with RPE, muscle groups, and auto-CalendarEvent creation, feeding 14-day context to Master Coach.
- Implemented Running Coach AI with Jack Daniels VDOT, Pete Pfitzinger 4-phase periodization, 80/20 polarized distribution, Karvonen HR zones, 9 session types, and `RunningBrainEntry` temporal memory decay (1.0 -> 0.7 -> 0.4).
- Built Strava OAuth2 integration (`/api/strava/auth`, `/api/strava/callback`), token auto-refresh lifecycle, real-time webhook (`/api/strava/webhook`), and manual 30-day sync (`/api/strava/sync`).
- Built dedicated `/running` page with 4-week plan, expandable granular session segments, manual run modal, and Strava sync controls.
- Built progression analytics with Recharts (`PaceEvolutionChart`, `WeeklyVolumeChart`, `StrengthProgressChart` scoped strictly to current+previous mesocycles, `AdherenceChart`), animated `StreakCounter`, `WeeklyVolumeBar`, `NextWorkoutCard`, and custom `ToastProvider`.
- Integrated official brand icons (`personal_trainer.svg` and `personal_trainer.png`) in layout, sidebar, and favicon.

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
- Unit tests: `npx tsx --test` -> 15/15 tests passing.
- Production build: `npx next build` -> 0 errors, all 23 routes compiled.

