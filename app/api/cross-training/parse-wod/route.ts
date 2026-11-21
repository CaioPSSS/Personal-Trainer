import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/auth';
import { generateStructuredOutput } from '@/lib/ai/openrouter';
import {
  ASSISTANT_COACH_DEFAULT_CASCADE,
  resolveModelCascade,
} from '@/lib/ai/models';
import { parseCrossFitWodDeterministic, ParsedWodResult } from '@/lib/analytics/wod-parser';

export const maxDuration = 60;

const wodParseSchema = {
  $id: 'wodParseOutput',
  type: 'object',
  additionalProperties: false,
  required: ['title', 'durationMinutes', 'suggestedRpe', 'muscleGroups', 'metabolicNotes'],
  properties: {
    title: { type: 'string', minLength: 2 },
    durationMinutes: { type: 'integer', minimum: 5, maximum: 180 },
    suggestedRpe: { type: 'number', minimum: 4, maximum: 10 },
    muscleGroups: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'string',
        enum: ['Pernas', 'Costas', 'Peito', 'Ombros', 'Braços', 'Core', 'Full Body'],
      },
    },
    metabolicNotes: { type: 'string', minLength: 5 },
  },
} as const;

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { wodText?: string };
    const wodText = String(body?.wodText ?? '').trim();

    if (!wodText) {
      return NextResponse.json({ error: 'Texto do WOD é obrigatório.' }, { status: 400 });
    }

    const fallbackParsed = parseCrossFitWodDeterministic(wodText);

    // Try fast AI enrichment first if OpenRouter key is configured, otherwise return deterministic result immediately
    if (process.env.OPENROUTER_API_KEY) {
      try {
        const cascade = resolveModelCascade(
          process.env.ASSISTANT_COACH_CASCADE,
          ASSISTANT_COACH_DEFAULT_CASCADE
        );

        const aiResult = await generateStructuredOutput<ParsedWodResult>({
          schemaId: 'wod-parse-1.0',
          schema: wodParseSchema,
          systemPrompt:
            'You are an elite CrossFit & Sports Physiology analyst. Parse the raw CrossFit WOD description and extract its title, total session duration in minutes (including warm-up/skill if standard box class, or WOD time cap), suggested session RPE (4-10), primary taxed muscle groups from the allowed enum (["Pernas", "Costas", "Peito", "Ombros", "Braços", "Core", "Full Body"]), and concise metabolic/biomechanical notes in Brazilian Portuguese (pt-BR) to guide concurrent strength training recovery.',
          userPrompt: `Raw WOD description:\n${wodText}`,
          modelCascade: cascade,
          maxRetries: 1,
          temperature: 0.1,
          reasoningEffort: 'low',
          maxTokens: 4000,
          perModelTimeoutsMs: [20_000, 15_000],
          totalBudgetMs: 40_000,
        });

        return NextResponse.json({
          success: true,
          parsed: aiResult.data,
          source: 'ai',
        });
      } catch {
        // Fallback seamlessly to deterministic parser
      }
    }

    return NextResponse.json({
      success: true,
      parsed: fallbackParsed,
      source: 'deterministic',
    });
  } catch (error) {
    console.error('[POST /api/cross-training/parse-wod] Error:', error);
    return NextResponse.json({ error: 'Falha ao analisar WOD.' }, { status: 500 });
  }
}
