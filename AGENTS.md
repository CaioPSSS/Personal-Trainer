<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Development State (2026-07-12)

### Current Milestone
- Started implementation of the hypertrophy AI architecture foundations.
- Legacy metabolic flow remains intact and operational.

### Implemented In This Iteration
- Expanded Prisma schema with new hypertrophy entities while preserving legacy models (`UserSettings`, `DailyLog`, `AiReport`).
- Added AI contract layer using strict JSON Schema definitions for:
	- Master Coach mesocycle generation output.
	- Assistant Coach daily output (exercise swap / fatigue alert).
- Added reusable validation and OpenRouter orchestration modules with:
	- Structured schema validation.
	- Auto-retry on invalid JSON/schema mismatch.
	- Optional fallback model.
- Added new API endpoints:
	- `POST /api/coach/master/generate`
	- `POST /api/coach/assistant`
- Added AI run auditing path (`AiRunLog`) and initial persistence flow for generated mesocycles and coach brain entries.
- Added dashboard manual override controls:
	- "Ajustar/Editar Treino"
	- "Forçar Nova Geração"
- Added frontend run-state feedback for coach generation (`idle`, `running`, `validated`, `failed`).
- Refactored coach APIs into a 3-agent structure:
	- `POST /api/coach/analyst` (Data Analyst AI)
	- `POST /api/coach/master/generate` (Master Coach AI with analyst pre-step)
	- `POST /api/coach/assistant` (Assistant Coach AI)
- Implemented end-of-cycle 3-phase pipeline in master generation:
	1. Aggregation (`AthleteProfile` + 56 days of `WorkoutExecution`/`WellnessDaily`).
	2. Data Analyst structured report generation.
	3. Master Coach mesocycle generation using analyst report + prior coach brain + raw context.
- Added dense prompt engineering module in `lib/ai/prompts.ts` with:
	- Progressive overload and fatigue-aware rules.
	- Strict equipment/restriction enforcement.
	- Explicit retrospective behavior instructions.
- Expanded AI contract schemas with:
	- `DataAnalystReport` JSON schema.
	- Master `coachBrain.retrospective` field (critical self-review block).

### Architectural Decisions Confirmed
- Multi-LLM strategy is active by responsibility:
	- Master Coach: `NVIDIA Nemotron 3 Ultra` for block transition generation.
	- Data Analyst: `gpt-oss-120b` for raw-cycle diagnostics.
	- Assistant Coach: `gpt-oss-120b` for day-to-day fast tool-like decisions.
- Contract-first output is mandatory for all model responses.
- Invalid model output must trigger retry with explicit validation feedback before failing.
- AI failures must be logged and should not block normal training logging in future UI integration.
- Keep legacy schema running during phased migration; no big-bang replacement.

### Pending Work
- Create and run Prisma migration/db push for new schema in environment.
- Add explicit `retrying` UI state and detailed retry counters in frontend.
- Add visible manual override UX:
	- "Adjust/Edit Workout"
	- "Force Regeneration"
- Connect daily training execution forms to new workout entities.
- Add mesocycle lifecycle controls (close block, generate next block, roll-over handling).
- Add tests for schema contract validation and endpoint error paths.
- Persist Data Analyst report snapshots in dedicated entity (optional) for longitudinal comparison.
- Add stronger DTO typing to remove remaining `unknown` model casting strategy.

### Next Steps (Execution Order)
1. Apply database changes and verify Prisma Client generation.
2. Add typed DTO mappers for analyst report + master plan -> relational inserts.
3. Build frontend surfacing for analyst insights and retrospective transparency.
4. Wire daily execution + wellness capture to new models.
5. Add integration tests covering retry/fallback, malformed JSON, and 3-agent handoff integrity.

### Verification Notes (This Iteration)
- Lint check passed for newly added TypeScript implementation files (`lib/ai/*` and `app/api/coach/*`).
- Lint check passed for dashboard changes in `app/components/DashboardClient.tsx`.
- Lint check passed after 3-agent pipeline refactor (`master`, `analyst`, `assistant`, contracts, prompts).
- Prisma schema validation is currently blocked locally by missing env var:
	- `POSTGRES_URL_NON_POOLING`
- No rollback performed; implementation remains staged for environment-complete validation.
