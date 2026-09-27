import { NextRequest, NextResponse } from 'next/server';
import { rebalanceWeekSchedule } from '@/lib/scheduling/strength-scheduler';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    let anchorDate: string | undefined;
    try {
      const body = await req.json();
      anchorDate = body?.anchorDate;
    } catch {
      // Body may be empty, defaults to current date
    }

    const result = await rebalanceWeekSchedule('singleton', anchorDate);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API Rebalance] Erro ao rebalancear calendário:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Falha ao rebalancear semana.',
      },
      { status: 500 }
    );
  }
}
