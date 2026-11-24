import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, unauthorizedResponse } from '@/lib/auth';
import { applyWorkoutTemplateSelectionAndRebalance } from '@/lib/scheduling/strength-scheduler';
import { todayISO } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }

  try {
    const body = await req.json();
    const { date, templateId } = body;

    if (!date || !templateId) {
      return NextResponse.json(
        { error: 'Campos date (YYYY-MM-DD) e templateId são obrigatórios.' },
        { status: 400 }
      );
    }

    if (date < todayISO()) {
      return NextResponse.json(
        { error: 'Não é permitido alterar o planejamento de datas passadas. O histórico é imutável.' },
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
        error: 'Falha ao selecionar template e reorganizar calendário.',
      },
      { status: 500 }
    );
  }
}
