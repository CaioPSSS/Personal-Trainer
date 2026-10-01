import { NextRequest, NextResponse } from 'next/server';
import { applyWorkoutTemplateSelectionAndRebalance } from '@/lib/scheduling/strength-scheduler';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { date, templateId } = body;

    if (!date || !templateId) {
      return NextResponse.json(
        { error: 'Campos date (YYYY-MM-DD) e templateId são obrigatórios.' },
        { status: 400 }
      );
    }

    const result = await applyWorkoutTemplateSelectionAndRebalance({
      athleteProfileId: 'singleton',
      date,
      templateId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[SelectTemplate API] Erro ao selecionar template e rebalancear:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Falha ao selecionar template e reorganizar calendário.',
      },
      { status: 500 }
    );
  }
}
