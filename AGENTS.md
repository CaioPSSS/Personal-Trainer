<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Development State (2026-11-23)

### Current Milestone
- Full Audit Remediation & Domain Fidelity Evolution: PostgreSQL schema enums & versioned migrations, deterministic biomechanical/clinical AI safety filter, hybrid multi-sport coaching context, collision-aware skip/unskip & radar scheduling, editable profile/integrations Settings UI, WCAG dialog accessibility, and genuine unit test coverage.

### Implemented & Hardened Systems
1. **Database Schema & Migrations (`prisma/`)**:
   - Evolved [`prisma/schema.prisma`](file:///c:/Users/souza/Personal-Trainer/prisma/schema.prisma) with typed enums (`PlanStatus`, `ScheduleStatus`, `WorkoutExecutionStatus`, `RunningSource`, `SkipStrategy`), composite primary key `@@id([athleteProfileId, date])` on `WellnessDaily`, optional FKs linking `RunningProfile`/`StravaIntegration`/`ExerciseSwapSuggestion` to `AthleteProfile`, `WorkoutExecution.workoutDayTemplateId`, and `CalendarEvent.skipStrategy`.
   - Added baseline + evolution SQL migrations under [`prisma/migrations/`](file:///c:/Users/souza/Personal-Trainer/prisma/migrations/20261123000000_domain_fidelity_evolution/migration.sql), [`package.json`](file:///c:/Users/souza/Personal-Trainer/package.json) `prisma generate && next build` pipeline scripts, and complete [`.env.example`](file:///c:/Users/souza/Personal-Trainer/.env.example) documentation.

2. **Security, Auth, Timezone & Reliability**:
   - [`lib/auth.ts`](file:///c:/Users/souza/Personal-Trainer/lib/auth.ts): fail-closed token enforcement, timing-safe HMAC signed session & `.ics` calendar feed tokens, strict same-origin (`sec-fetch-site`, `origin`/`referer` vs host) protection against CSRF, zero dependency on `NEXT_PUBLIC_INTERNAL_SECRET` or unverified headers.
   - [`lib/integrations/metabolic-tracker.ts`](file:///c:/Users/souza/Personal-Trainer/lib/integrations/metabolic-tracker.ts) & [`app/api/integrations/metabolic/route.ts`](file:///c:/Users/souza/Personal-Trainer/app/api/integrations/metabolic/route.ts): strict HTTPS/IP SSRF allowlist blocking loopback/private/link-local targets (`redirect: 'error'`).
   - [`lib/dates.ts`](file:///c:/Users/souza/Personal-Trainer/lib/dates.ts) & [`lib/dateUtils.ts`](file:///c:/Users/souza/Personal-Trainer/lib/dateUtils.ts): strict `America/Sao_Paulo` calendar date discipline without UTC drift.
   - [`lib/ai/openrouter.ts`](file:///c:/Users/souza/Personal-Trainer/lib/ai/openrouter.ts) & [`lib/strava/client.ts`](file:///c:/Users/souza/Personal-Trainer/lib/strava/client.ts): `AbortController` request timeouts (`75s` OpenRouter, `15s` Strava), lossless `fixMojibake` (`Ã\u00a0` preservation), and Ajv structured JSON contract validation (`lib/ai/contracts.ts`, `lib/ai/running-contracts.ts`).

3. **AI Safety, Prompt Hygiene & Hybrid Context**:
   - [`lib/ai/safety-filter.ts`](file:///c:/Users/souza/Personal-Trainer/lib/ai/safety-filter.ts): deterministic joint-restriction contraindication checks, equipment filtering, swap filtering, and post-generation plan sanitization (`sanitizePlanPrescriptions`).
   - [`lib/ai/prompts.ts`](file:///c:/Users/souza/Personal-Trainer/lib/ai/prompts.ts) & [`lib/ai/running-prompts.ts`](file:///c:/Users/souza/Personal-Trainer/lib/ai/running-prompts.ts): untrusted data delimiters (`wrapUntrustedData`), dynamic equipment catalog (`buildEquipmentCatalogPrompt`), dynamic session duration volume scaling, removal of SmartFit/lifestyle biases, and [`lib/ai/hybrid-context.ts`](file:///c:/Users/souza/Personal-Trainer/lib/ai/hybrid-context.ts) cross-sport + readiness context + 3-entry `CoachBrainEntry` temporal decay.
   - [`app/api/coach/assistant/route.ts`](file:///c:/Users/souza/Personal-Trainer/app/api/coach/assistant/route.ts): auto-generated `AssistantAlert` readiness monitoring (`GET` / `PATCH resolve_alert`), safety-filtered swap fallbacks, permanent mesocycle swap updates, and explicit `source`/`usedFallback` telemetry flags.

4. **Sports Science, Scheduling, UX & Accessibility**:
   - [`lib/analytics/hypertrophy-analytics.ts`](file:///c:/Users/souza/Personal-Trainer/lib/analytics/hypertrophy-analytics.ts) & [`lib/progression/load-calculator.ts`](file:///c:/Users/souza/Personal-Trainer/lib/progression/load-calculator.ts): fractional secondary muscle sets (`0.5x` -> `effectiveSets`), historical `computeStreakMetrics`, `filterQualifyingPerformanceRuns` for VDOT/Riegel predictions, and multi-set rep drop-off load consolidation guard.
   - [`lib/scheduling/calendar-skip.ts`](file:///c:/Users/souza/Personal-Trainer/lib/scheduling/calendar-skip.ts), [`lib/scheduling/multi-sport-radar.ts`](file:///c:/Users/souza/Personal-Trainer/lib/scheduling/multi-sport-radar.ts), [`lib/scheduling/strength-scheduler.ts`](file:///c:/Users/souza/Personal-Trainer/lib/scheduling/strength-scheduler.ts), [`lib/running/reconcile.ts`](file:///c:/Users/souza/Personal-Trainer/lib/running/reconcile.ts): transactional scheduling, collision-aware skip/unskip restoration, batch Strava reconciliation, live conflict radar (`POST /api/schedule/rebalance`), and enriched `.ics` running segments/HR zones (`app/api/calendar/ics/route.ts`).
   - UI polish across [`SettingsClient.tsx`](file:///c:/Users/souza/Personal-Trainer/app/components/SettingsClient.tsx) (editable profile/equipment/restrictions/metabolic URL), [`HypertrophyDailyTracker.tsx`](file:///c:/Users/souza/Personal-Trainer/app/components/HypertrophyDailyTracker.tsx) (template-matched drafts, readiness banner, extra exercise, editable duration), [`ExecutiveDashboard.tsx`](file:///c:/Users/souza/Personal-Trainer/app/components/ExecutiveDashboard.tsx), [`CoachInsights.tsx`](file:///c:/Users/souza/Personal-Trainer/app/components/CoachInsights.tsx), [`HealthDisclaimer.tsx`](file:///c:/Users/souza/Personal-Trainer/app/components/HealthDisclaimer.tsx), [`app/(main)/running/page.tsx`](file:///c:/Users/souza/Personal-Trainer/app/(main)/running/page.tsx), and modal ARIA/keyboard accessibility.

### Verification Notes
- Schema offline check: `npx prisma validate` & `npx prisma generate` (with localhost placeholder Postgres URLs) -> exit 0.
- Typecheck: `npx tsc --noEmit` -> 0 errors.
- Linter: `npx eslint app/ lib/ proxy.ts next.config.ts` & `npm run lint` -> 0 errors / 0 warnings.
- Unit tests: `npx tsx --test` -> 126/126 tests passing.
