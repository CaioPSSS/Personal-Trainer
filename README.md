# Personal Trainer Multi-Sport AI

Plataforma full-stack de treinamento híbrido integrando **Hipertrofia & Musculação**, **Corrida & Endurance** e **Cross-Training** com periodização inteligente, sobrecarga progressiva determinística, sincronização com Strava e calendário unificado.

## Arquitetura & Stack

- **Framework:** Next.js `16.2.9` (App Router, Route Group `app/(main)/`) + React `19.2.4` + TypeScript `5` (strict)
- **Estilização:** Tailwind CSS `4`
- **Banco de Dados:** PostgreSQL + Prisma ORM (`5.22.0`) com migrações versionadas em `prisma/migrations/`
- **IA Híbrida & Validação Estruturada:** OpenRouter model cascades + validação de schema JSON com Ajv (`8.20.0`), filtro determinístico de segurança biomecânica e equipamentos (`lib/ai/safety-filter.ts`), isolamento anti-injection (`wrapUntrustedData`) e fallbacks heurísticos/biomecânicos offline
- **Ciência do Esporte:** Calculadora determinística de sobrecarga progressiva e deload (`lib/progression/load-calculator.ts`), volume semanal MEV/MAV/MRV com fração secundária (`0.5x`), VDOT Jack Daniels + zonas Karvonen, Readines Score Diário (0–100) e Radar Multi-Esportes
- **Integrações:** Strava OAuth2 / Webhook / Sync (`activity:read_all`), Feed iCalendar RFC 5545 (`/api/calendar/ics`), e sincronização bidirecional opcional com Rastreador Metabólico (protegida contra SSRF)

## Variáveis de Ambiente

Copie `.env.example` para `.env.local` e configure as variáveis necessárias para seu ambiente:

- **Banco de dados:** `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`
- **Autenticação & Segurança:** `APP_PASSWORD`, `AUTH_SECRET` (ou `SESSION_SECRET`), `INTERNAL_API_SECRET`
- **IA (OpenRouter):** `OPENROUTER_API_KEY` e cascatas opcionais (`MASTER_COACH_CASCADE`, `DATA_ANALYST_CASCADE`, `ASSISTANT_COACH_CASCADE`, `RUNNING_COACH_CASCADE`)
- **Strava & Integrações:** `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_WEBHOOK_VERIFY_TOKEN`, `NEXT_PUBLIC_APP_URL`, `METABOLIC_TRACKER_URL`, `METABOLIC_TRACKER_ALLOWED_HOSTS`, `ECOSYSTEM_SYNC_SECRET`

## Primeiros Passos

```bash
npm install
npx prisma migrate deploy
npm run dev
```

Acesse `http://localhost:3000`.

## Scripts de Qualidade e Testes

```bash
npm run typecheck   # npx tsc --noEmit
npm run lint        # ESLint
npm test            # npx tsx --test
npm run db:migrate  # npx prisma migrate deploy
npm run build       # prisma generate && next build
```

> **Aviso de Responsabilidade:** O sistema oferece suporte organizacional e metodológico para registro e periodização de treinos e não substitui avaliação ou acompanhamento médico, nutricional ou de educação física presencial.
