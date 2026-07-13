<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Development State (2026-07-13)

### Current Milestone
- Completed active mesocycle dashboard wiring, live Assistant Coach exercise swap integration, and end-of-workout persistence logs.
- Legacy metabolic flow remains functional but consolidated in a secondary details pane.

### Implemented In This Iteration
- Wired `DashboardClient.tsx` to conditionally render the active mesocycle tracker `HypertrophyDailyTracker` and coaching dashboard `CoachInsights` or a prominent plan generation CTA card.
- Replaced the mock click handler in `HypertrophyDailyTracker.tsx` with a live request to `POST /api/coach/assistant` for the `exercise_swap` mode.
- Designed a modal suggestion dialog in `HypertrophyDailyTracker` where users can view 3 alternative exercises recommended by the AI and instantly swap them, maintaining the logging state.
- Implemented `substitutedFrom` tracking to save the original exercise name to the database when logging swapped movements.
- Updated the Assistant Coach's prompt rules in `lib/ai/prompts.ts` to respect strict 1-hour session duration constraints by favoring quick setups and biomechanical equivalents.
- Integrated full-page refreshes on success to synchronize Server-Side Component states.
- Refactored `prisma/schema.prisma` and database types to replace `preferredSplit` with a free-form `athleteContext` text field.
- Refactored `OnboardingForm.tsx` to collect life context and objective details in a `<textarea>` instead of a rigid training split selection dropdown.
- Updated `/api/setup` to parse and upsert `athleteContext` in `AthleteProfile`.
- Updated the Master Coach prompt in `lib/ai/prompts.ts` to analyze `athleteContext` and dynamically determine the split/volume configurations.
- Patched Vercel 401 Unauthorized errors by verifying client-side requests using `NEXT_PUBLIC_INTERNAL_SECRET` header validation in `isAuthorized` and passing it from the dashboard.
- Patched Vercel 500 mount errors by wrapping initial database fetches and calculations in `try/catch` fallback blocks in `app/page.tsx`.
- Fixed all typescript-eslint (`any[]` casts, catch block parameters, unescaped quote symbols, unused imports) compiler and linter issues.

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
- Add mesocycle lifecycle controls (close block manually, deload visual alerts, rollover trigger).
- Add integration tests covering AI response schema contracts, retry orchestration, and endpoints error paths.

### Next Steps (Execution Order)
1. Run Prisma db push (`npx prisma db push`) in the target Vercel database.
2. Build mesocycle block rollover buttons and status flags.
3. Add integration tests.

### Verification Notes (This Iteration)
- Rebuilt Prisma Client types successfully (`npx prisma generate`).
- Run typecheck: `npx tsc --noEmit` completed successfully with zero compiler errors.
- Run linter: `npm run lint` completed successfully with zero warnings/errors.

