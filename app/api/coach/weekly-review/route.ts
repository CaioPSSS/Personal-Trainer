import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/auth';
import { generateStructuredOutput } from '@/lib/ai/openrouter';
import {
  ASSISTANT_COACH_DEFAULT_CASCADE,
  resolveModelCascade,
} from '@/lib/ai/models';

export const maxDuration = 60;

interface WeeklyAiCommentary {
  headline: string;
  coachAnalysis: string;
  tacticalAdjustment: string;
}

const weeklyReviewSchema = {
  $id: 'weeklyReviewAiOutput',
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'coachAnalysis', 'tacticalAdjustment'],
  properties: {
    headline: { type: 'string', minLength: 5 },
    coachAnalysis: { type: 'string', minLength: 15 },
    tacticalAdjustment: { type: 'string', minLength: 10 },
  },
} as const;

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      weeklyReview?: Record<string, unknown>;
      readiness?: Record<string, unknown>;
    };

    const cascade = resolveModelCascade(
      process.env.ASSISTANT_COACH_CASCADE,
      ASSISTANT_COACH_DEFAULT_CASCADE
    );

    if (process.env.OPENROUTER_API_KEY) {
      try {
        const result = await generateStructuredOutput<WeeklyAiCommentary>({
          schemaId: 'weekly-review-ai-1.0',
          schema: weeklyReviewSchema,
          systemPrompt:
            'You are Master Coach AI conducting the athlete Sunday Weekly Check-in across Hypertrophy, Running, and CrossFit. Write in clear, motivating, clinical Brazilian Portuguese (pt-BR). Analyze adherence, tonnage delta, running km, and sleep/recovery, and provide a concrete tactical adjustment for the upcoming week.',
          userPrompt: `Weekly Review Data JSON:\n${JSON.stringify(body.weeklyReview ?? {})}\n\nCurrent Readiness JSON:\n${JSON.stringify(body.readiness ?? {})}`,
          modelCascade: cascade,
          maxRetries: 1,
          temperature: 0.2,
          reasoningEffort: 'low',
          maxTokens: 4000,
          perModelTimeoutsMs: [25_000, 20_000],
          totalBudgetMs: 50_000,
        });

        return NextResponse.json({
          success: true,
          commentary: result.data,
        });
      } catch {
        // Fallback below
      }
    }

    return NextResponse.json({
      success: true,
      commentary: {
        headline: 'Balanço Multi-Esporte Consolidado',
        coachAnalysis:
          'Sua distribuição semanal entre treinos de força, rodagem aeróbica e sessões metabólicas está registrada. Priorize a consistência nos exercícios compostos principais e proteja o intervalo de recuperação após sessões intensas de membros inferiores.',
        tacticalAdjustment:
          'Para os próximos 7 dias, garanta o cumprimento das séries mínimas (MEV) nos grupamentos prioritários e mantenha pelo menos 7h30 de sono nas noites pós-treino duplo.',
      },
    });
  } catch (error) {
    console.error('[POST /api/coach/weekly-review] Error:', error);
    return NextResponse.json({ error: 'Falha ao gerar revisão semanal.' }, { status: 500 });
  }
}
