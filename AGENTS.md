<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Development State (2026-08-24)

### Current Milestone
- Re-evaluated and upgraded AI model cascatas with top-tier OpenRouter models (< $0.50-$1.00 / M tokens).
- Integrated SmartFit equipment catalog, Stimulus-to-Fatigue Ratio (SFR) principles, Stretch-Mediated Hypertrophy directives, conditional density techniques, and strict 60-minute duration constraints across all AI prompts.

### Implemented In This Iteration
- Configured multi-model cascata architecture in `/api/coach/master/generate`, `/api/coach/analyst`, and `/api/coach/assistant`:
  - **Master Coach Cascade**: `deepseek/deepseek-v4-pro` (Primary, 1.6T MoE, $0.526/M in) -> `qwen/qwen3.7-plus` ($0.32/M in) -> `minimax/minimax-m3` -> `deepseek/deepseek-v4-flash-0731`.
  - **Data Analyst Cascade**: `deepseek/deepseek-v4-flash-0731` (Primary, 1.31M context, $0.04/M in) -> `deepseek/deepseek-v4-flash` -> `minimax/minimax-m3`.
  - **Assistant Coach Cascade**: `deepseek/deepseek-v4-flash-0731` (Primary, < 1.2s latency) -> `openai/gpt-5.6-luna` ($0.20/M in) -> `qwen/qwen3.7-plus`.
- Embedded official SmartFit Equipment Catalog into prompt contexts for all 3 agents (Leg Press 45/180/Linear, Hack Squat, Cadeira/Mesa/Flexora em Pé, Extensora, Pulley, Remadas articuladas/baixa, Smith, Crossover, Halteres monobloco, etc.).
- Refactored `lib/ai/prompts.ts` to implement evidence-based sport science:
  - High SFR exercise selection prioritizing stability and axial spinal fatigue management for busy/stressed routines.
  - Contextual stretch-mediated hypertrophy emphasis where biomechanically superior.
  - Strict 60-minute session duration (4-6 exercises, 12-18 hard sets max).
  - Commercial gym crowding awareness (conditional APS/Myo-reps only when genuinely superior in context; avoiding monopolizing 2 distant machines).
  - Systematic weekly RIR/RPE progression (Week 1: RIR 3 -> Week 2: RIR 2 -> Week 3: RIR 1-2 -> Week 4: RIR 0-1 / RPE 10 -> Week 5: Deload).
  - Explicit joint health / motor pain compliance (respecting explicit user pain points without arbitrary bans).

### Architectural Decisions Confirmed
- Multi-LLM strategy is active by responsibility:
	- Master Coach: `deepseek/deepseek-v4-pro` (Fallback: `qwen/qwen3.7-plus`).
	- Data Analyst: `deepseek/deepseek-v4-flash-0731` (Fallback: `minimax/minimax-m3`).
	- Assistant Coach: `deepseek/deepseek-v4-flash-0731` (Fallback: `openai/gpt-5.6-luna`).
- Contract-first output is mandatory for all model responses.
- All transactional mesocycle structures must be stored via relational cascades.
- ESLint checks must pass cleanly prior to any production deploy to prevent build-time lockouts in Vercel.

### Pending Work
- Deploy PostgreSQL database changes in production (Neon/Vercel Storage).
- Add mesocycle lifecycle controls (close block manually, deload visual alerts, rollover trigger).
- Add integration tests covering AI response schema contracts, retry orchestration, and endpoints error paths.

### Verification Notes (This Iteration)
- Rebuilt Prisma Client types successfully (`npx prisma generate`).
- Run typecheck: `npx tsc --noEmit` completed successfully with zero compiler errors.
- Run linter: `npm run lint` completed successfully with zero warnings/errors.

