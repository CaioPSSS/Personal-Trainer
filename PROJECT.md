# Project: Personal Trainer Multi-Sport Expansion

## Architecture
The platform expands from a hypertrophy-only tracking application into a unified multi-sport training ecosystem encompassing:
1. **Hypertrophy Engine** (preserved 100%): Mesocycles, daily workout tracker, smart exercise swaps, OpenRouter cascade, and SmartFit catalog.
2. **Running Coach AI & Endurance Engine**: Periodized 4-week running plans following Jack Daniels VDOT, Pete Pfitzinger periodization, 80/20 polarized distribution, Karvonen HR zones, 9 canonical session types, and `RunningBrainEntry` temporal memory decay (1.0 -> 0.7 -> 0.4).
3. **Strava Integration**: OAuth2 authentication (`activity:read_all` scope), token refresh lifecycle, webhook push subscriptions for `Run` activities, manual 30-day sync fallback, and split metric ingestion.
4. **Cross-Training Engine**: Rapid logging for CrossFit, swimming, cycling, yoga, martial arts with RPE and muscle group targeting, automatically feeding context to the Master Coach AI without diluting hypertrophy goals.
5. **Unified Multi-Sport Interactive Calendar**: Aggregation layer (`CalendarEvent`), weekly agenda view, monthly dot grid, HTML5 drag-and-drop rescheduling, sport color-coding, and differentiated skip mechanics.
6. **Executive Dashboard & Analytics**: Multi-sport streak counter, weekly volume progress bars, Next workout quick card, Recharts analytics (Pace evolution, weekly volume, strength load progression, adherence), glassmorphism design system (`.glass-card`), and zero-dependency custom toast notifications.
7. **Responsive Multi-Page Structure**: Next.js 16 App Router route group `app/(main)/` with desktop sidebar (>=1024px) and mobile bottom bar (<1024px) featuring brand assets `personal_trainer.svg` and `personal_trainer.png`.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | 8 Multi-Sport Prisma Models | Add `RunningProfile`, `RunningPlan`, `RunningSession`, `RunningExecution`, `RunningBrainEntry`, `CrossTrainingActivity`, `StravaIntegration`, `CalendarEvent` | M1 | Schema Explorer |
| 2 | Existing Models Relation Extensions | Extend `AthleteProfile` with `crossTrainingActivities` and `calendarEvents` | M1 | Schema Explorer |
| 3 | CalendarEvent Backfill Migration | Idempotent script mapping historical `WorkoutExecution` to `CalendarEvent` | M1 | Schema Explorer |
| 4 | Multi-Page App Router Structure | Route group `app/(main)/` with `layout.tsx`, desktop sidebar, and mobile `BottomNav.tsx` | M2 | UI Explorer |
| 5 | Hypertrophy Hub Decoupling | Move `HypertrophyDailyTracker` into `/strength` with zero breaking changes | M2 | UI Explorer |
| 6 | Interactive Weekly Calendar | 7-day agenda view with sport color-coding, status badges, and HTML5 drag-and-drop | M2 | UI Explorer |
| 7 | Interactive Monthly Calendar | 7x5 compact grid with sport dots and quick date navigation | M2 | UI Explorer |
| 8 | Differentiated Skip Mechanics | Strength skip dialog (skip only vs skip + reschedule +1 day) & Running skip | M2 | UI Explorer / Blueprint |
| 9 | Brand Integration & Glassmorphism | Integrate `personal_trainer.svg`/`.png` in layout/favicon; implement `.glass-card` tokens | M2 | UI Explorer / Request |
| 10 | Calendar Events API Routes | Endpoints `/api/calendar` (GET, POST, PATCH) and `/api/calendar/skip` (POST) | M2 | UI Explorer |
| 11 | Deterministic Strength Scheduler | Script-based algorithm mapping mesocycle split days to calendar week balancing recovery | M3 | Request R1 / Blueprint |
| 12 | Cross-Training Modal & API | Modal quick-entry and `/api/cross-training` (GET/POST) auto-generating calendar events | M3 | Blueprint 1.4 / Request R1 |
| 13 | Master Coach Cross-Training Awareness | Ingest 14-day cross-training summary into Master Coach prompt without diluting hypertrophy | M3 | Spec Miner / Blueprint |
| 14 | Hypertrophy Calendar Sync | Sync `POST /api/workout/today` with `CalendarEvent` upsert on workout completion | M3 | Schema Explorer |
| 15 | Running Coach AI Contracts & Schema | `RunningPlanOutput` interface and Ajv validator conforming to 4-week structure | M4 | Spec Miner / Blueprint |
| 16 | Running Coach AI Prompts & Cascade | Prompt engine with VDOT, Pfitzinger, 80/20, Karvonen; OpenRouter cascade | M4 | Spec Miner / Blueprint |
| 17 | Running Plan Generation API & Decay | Endpoint `/api/running/generate` with `RunningBrainEntry` temporal decay (1.0, 0.7, 0.4) | M4 | Spec Miner / Blueprint |
| 18 | Running Onboarding Form & Profile API | Form capturing paces, volume, available days, HR; endpoint `/api/running/profile` | M4 | Spec Miner / Blueprint |
| 19 | Manual Running Execution API | Endpoint `/api/running/execution` for manual workout logging | M4 | Spec Miner / Blueprint |
| 20 | Strava Client Utility | Utility `lib/strava/client.ts` with credentials, token refresh lifecycle, and Strava API calls | M5 | Spec Miner / Request |
| 21 | Strava OAuth2 Auth & Callback | Endpoints `/api/strava/auth` and `/api/strava/callback` with `activity:read_all` scope | M5 | Spec Miner / Request |
| 22 | Strava Webhook Verification & Ingestion | Endpoint `/api/strava/webhook` handling hub challenge and `Run` activity ingestion | M5 | Spec Miner / Request |
| 23 | Strava Manual Sync Endpoint | Fallback endpoint `/api/strava/sync` importing runs from past 30 days | M5 | Spec Miner / Request |
| 24 | Running Hub Page & Workout Cards | Page `/running` with monthly plan, weekly progress, detailed segment cards, Strava status | M5 | UI Explorer / Blueprint |
| 25 | Athlete Settings Page | Page `/settings` with profile details, running preferences, and Strava connect controls | M5 | UI Explorer / Blueprint |
| 26 | Recharts Progression Analytics | Charts for Pace Evolution, Weekly Volume, Strength Load Progression, and Adherence | M6 | UI Explorer / Blueprint |
| 27 | Analytics Aggregation API | Endpoint `/api/analytics` providing structured data for all charts | M6 | Blueprint 3.1 |
| 28 | Custom Toast Notification System | `ToastProvider.tsx` context with zero-lib animated toasts for workout, sync, and plan events | M6 | UI Explorer / Blueprint |
| 29 | Streak Counter & Volume Bar Widgets | `StreakCounter.tsx` and `WeeklyVolumeBar.tsx` on Executive Dashboard | M6 | UI Explorer / Blueprint |
| 30 | Full Build & Acceptance Verification | Clean validation across `prisma validate`, `prisma generate`, `tsc`, `lint`, and `next build` | M7 | Request Acceptance Criteria |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Data Architecture & Schema Expansion | Features 1-3: Prisma schema models, relations, and calendar backfill script | none | PLANNED |
| M2 | App Layout, Navigation & Interactive Calendar | Features 4-10: Route group `app/(main)/`, `BottomNav`, desktop sidebar, `WeeklyCalendar`, `MonthlyCalendar`, `SkipWorkoutDialog`, calendar APIs | M1 | PLANNED |
| M3 | Deterministic Scheduling & Cross-Training | Features 11-14: Strength scheduler, cross-training modal/API, Master Coach prompt update, workout completion sync | M1, M2 | PLANNED |
| M4 | Running Coach AI & Onboarding | Features 15-19: `RunningPlanOutput` schema, Running Coach cascade, decay memory, onboarding form, profile & execution APIs | M1 | PLANNED |
| M5 | Strava OAuth, Webhook & Running Hub | Features 20-25: Strava client, OAuth routes, webhook endpoint, manual sync, `/running` page, `/settings` page | M1, M4 | PLANNED |
| M6 | Visual Polish, Analytics, Streaks & Toasts | Features 26-29: Recharts charts, `/api/analytics`, `ToastProvider`, `StreakCounter`, `WeeklyVolumeBar`, glassmorphism polish | M2, M3, M5 | PLANNED |
| M7 | Final Acceptance & Build Verification | Feature 30: Full automated verification (`prisma validate`, `prisma generate`, `tsc`, `lint`, `build`) and end-to-end check | M1-M6 | PLANNED |

---

## Interface Contracts

### 1. `CalendarEvent` Aggregation Contract
- Model:
  ```prisma
  model CalendarEvent {
    id               String   @id @default(cuid())
    athleteProfileId String
    date             String   // "YYYY-MM-DD"
    eventType        String   // "strength" | "running" | "crossfit" | "swimming" | "rest" | "other"
    referenceId      String?
    referenceModel   String?  // "WorkoutExecution" | "WorkoutDayTemplate" | "RunningSession" | "CrossTrainingActivity"
    title            String
    status           String   @default("planned") // "planned" | "completed" | "skipped"
    colorCode        String?
    sortOrder        Int      @default(0)
    originalDate     String?
    createdAt        DateTime @default(now())
    updatedAt        DateTime @updatedAt
  }
  ```
- API `/api/calendar`:
  - `GET ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`: Returns `CalendarEvent[]`
  - `PATCH`: Body `{ eventId: string, newDate: string }`: Updates `date`, records `originalDate`
- API `/api/calendar/skip`:
  - `POST`: Body `{ eventId: string, strategy: "skip_only" | "skip_and_reschedule" }`

### 2. `RunningPlanOutput` AI Contract (`lib/ai/running-contracts.ts`)
```typescript
export interface RunningPlanOutput {
  plan: {
    title: string;
    month: number;
    year: number;
    objective: string;
    phase: 'base' | 'build' | 'peak' | 'taper' | 'recovery';
    weeklyTargetKm: number;
    sessions: Array<{
      weekNumber: number;
      dayOfWeek: string;
      sessionType: 'easy' | 'tempo' | 'intervals' | 'long_run' | 'fartlek' | 'hill_repeats' | 'progression' | 'race_pace' | 'recovery';
      title: string;
      totalDistanceKm: number;
      totalDurationMin: number;
      targetPaceSec: number | null;
      targetHrZone: string | null;
      segments: Array<{
        type: 'warmup' | 'cooldown' | 'steady' | 'interval' | 'recovery_jog' | 'tempo' | 'race_pace';
        distanceKm?: number;
        distanceM?: number;
        durationMin?: number;
        paceRangeSec?: [number, number];
        reps?: number;
        restSec?: number;
        hrZone?: string;
        notes?: string;
      }>;
      notes: string;
    }>;
  };
  coachBrain: {
    hypotheses: string[];
    rationale: string[];
    monthlyProgression: string;
    riskFactors: string[];
    retrospective: {
      whatWorked: string[];
      whatFailed: string[];
      paceEvolution: string;
      volumeAdherence: number;
      correctionActions: string[];
    };
  };
}
```

### 3. Strava Token & Sync Contracts
- OAuth URL: `https://www.strava.com/oauth/authorize?client_id=282597&response_type=code&redirect_uri=${APP_URL}/api/strava/callback&approval_prompt=auto&scope=read,activity:read_all`
- Webhook GET: query `{ 'hub.mode': 'subscribe', 'hub.verify_token': verifyToken, 'hub.challenge': challenge }` -> responds `{ 'hub.challenge': challenge }`
- Webhook POST: event `{ object_type: 'activity', aspect_type: 'create', object_id: activityId, owner_id: athleteId }` -> responds HTTP 200 within 2s, async processes Run details into `RunningExecution` and `CalendarEvent`.

### 4. Cross-Training Contract (`/api/cross-training`)
- POST body:
  ```typescript
  {
    activityType: 'crossfit' | 'swimming' | 'cycling' | 'yoga' | 'martial_arts' | 'other';
    date: string; // YYYY-MM-DD
    title?: string;
    durationMinutes: number;
    sessionRpe?: number; // 1-10
    muscleGroups?: string[]; // e.g. ["legs", "core"]
    notes?: string;
  }
  ```
- Creates `CrossTrainingActivity` and corresponding `CalendarEvent` (status `completed`).

---

## Code Layout
- `prisma/`:
  - `schema.prisma`: Unified data models
  - `backfill-calendar-events.ts`: Migration script
- `app/`:
  - `(main)/`:
    - `layout.tsx`: Desktop sidebar (>=1024px) + mobile `BottomNav` (<1024px)
    - `page.tsx`: Executive multi-sport dashboard
    - `strength/page.tsx`: Hypertrophy daily tracker and exercise swaps
    - `running/page.tsx`: Running coach dashboard, monthly plan & session cards
    - `settings/page.tsx`: Athlete profile, running profile & Strava integration
  - `components/`:
    - `BottomNav.tsx`, `DesktopSidebar.tsx`
    - `WeeklyCalendar.tsx`, `MonthlyCalendar.tsx`, `SkipWorkoutDialog.tsx`
    - `NextWorkoutCard.tsx`, `WeeklyVolumeBar.tsx`, `StreakCounter.tsx`
    - `CrossTrainingModal.tsx`, `RunningOnboardingForm.tsx`, `ToastProvider.tsx`
    - `charts/`: `PaceEvolutionChart.tsx`, `WeeklyVolumeChart.tsx`, `StrengthProgressChart.tsx`, `AdherenceChart.tsx`
  - `api/`:
    - `calendar/`: `route.ts`, `skip/route.ts`
    - `cross-training/route.ts`
    - `running/`: `profile/route.ts`, `generate/route.ts`, `execution/route.ts`
    - `strava/`: `auth/route.ts`, `callback/route.ts`, `webhook/route.ts`, `sync/route.ts`
    - `analytics/route.ts`
  - `lib/`:
    - `ai/`:
      - `running-contracts.ts`, `running-prompts.ts`
      - `prompts.ts` (extended with cross-training awareness)
    - `scheduling/`:
      - `strength-scheduler.ts`
    - `strava/`:
      - `client.ts`
