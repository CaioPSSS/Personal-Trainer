<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Development State (2026-07-13)

### Current Milestone
- Completed database integration mapping layer and primary hypertrophy daily logging and coaching transparency interfaces.
- Legacy metabolic flow remains functional but consolidated in a secondary details pane.

### Implemented In This Iteration
- Created strongly-typed database DTO mappers (`lib/db/hypertrophyMappers.ts`) to write active mesocycles, templates, exercises, and coach brain entries in atomic transactions.
- Refactored `POST /api/coach/master/generate` to use `saveMasterPlanToDb` and utilize fully-typed Prisma client queries.
- Added API route `GET /api/coach/insights` to fetch active mesocycle details, coach hypotheses, and the audited Data Analyst cycle report.
- Added API route `GET/POST /api/workout/today` to predict next scheduled template, manage template selection, and submit completed sets (load, reps, RPE, failure flags) and wellness logs.
- Created `CoachInsights.tsx` component exposing the clinical rationale and cycle retrospective from the AI agents.
- Created `HypertrophyDailyTracker.tsx` to handle daily session entry logs and recovery inputs.
- Integrated new components into `DashboardClient.tsx` as primary widgets and moved legacy metabolic components to a collapsible details box.
- Rebuilt local Prisma client types (`npx prisma generate`) to support hypertrophy tables.
- Fixed all typescript-eslint (`as any` casts, catching errors, unused imports, map mutations) compiler and linter issues.

### Architectural Decisions Confirmed
- Multi-LLM strategy is active by responsibility:
	- Master Coach: `NVIDIA Nemotron 3 Ultra` for block transition generation.
	- Data Analyst: `gpt-oss-120b` for raw-cycle diagnostics.
	- Assistant Coach: `gpt-oss-120b` for day-to-day fast tool-like decisions.
- Contract-first output is mandatory for all model responses.
- All transactional mesocycle structures must be stored via relational cascades.
- ESLint checks must pass cleanly prior to any production deploy to prevent build-time lockouts in Vercel.

### Pending Work
- Deploy PostgreSQL database changes in production (Neon/Vercel Storage).
- Connect the "Substituir Exercício" (Swap Exercise) button in `HypertrophyDailyTracker` to the Assistant Coach API route to execute dynamic swaps.
- Add mesocycle lifecycle controls (close block manually, deload visual alerts, rollover trigger).
- Add integration tests covering AI response schema contracts, retry orchestration, and endpoints error paths.

### Next Steps (Execution Order)
1. Run Prisma db push (`npx prisma db push`) in the target Vercel database.
2. Wire the Assistant Coach swap AI logic under `POST /api/coach/assistant` to return recommended substitutes.
3. Build mesocycle block rollover buttons and status flags.
4. Add integration tests.

### Verification Notes (This Iteration)
- Rebuilt Prisma Client types successfully (`npx prisma generate`).
- Run typecheck: `npx tsc --noEmit` completed successfully with zero compiler errors.
- Run linter: `npm run lint` completed successfully with zero warnings/errors.

