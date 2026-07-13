import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Fetch active mesocycle plan and its latest coach brain entry
    const activePlan = await prisma.mesocyclePlan.findFirst({
      where: {
        athleteProfileId: 'singleton',
        status: 'active',
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        coachBrainEntries: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    });

    if (!activePlan) {
      return NextResponse.json({ active: false, message: 'Nenhum mesociclo ativo encontrado.' });
    }

    const latestBrain = activePlan.coachBrainEntries[0] || null;
    let analystReport = null;

    // 2. Fetch the Data Analyst report associated with the master coach generation run
    if (latestBrain?.aiRunLogId) {
      const masterLog = await prisma.aiRunLog.findUnique({
        where: { id: latestBrain.aiRunLogId },
      });

      const requestPayload = masterLog?.requestPayload as Record<string, unknown> | null;
      const analystRunLogId = requestPayload?.analystRunLogId as string | undefined;

      if (analystRunLogId) {
        const analystLog = await prisma.aiRunLog.findUnique({
          where: { id: analystRunLogId },
        });
        analystReport = analystLog?.responsePayload || null;
      }
    }

    const hypothesesObj = latestBrain?.hypotheses as Record<string, unknown> | null;

    return NextResponse.json({
      active: true,
      mesocycle: {
        id: activePlan.id,
        title: activePlan.title,
        objective: activePlan.objective,
        split: activePlan.split,
        durationWeeks: activePlan.durationWeeks,
      },
      coachBrain: latestBrain ? {
        hypotheses: Array.isArray(hypothesesObj?.hypotheses) ? hypothesesObj.hypotheses : [],
        rationale: Array.isArray(hypothesesObj?.rationale) ? hypothesesObj.rationale : [],
        nextCycleWatchouts: Array.isArray(hypothesesObj?.nextCycleWatchouts) ? hypothesesObj.nextCycleWatchouts : [],
        retrospective: latestBrain.retrospective,
      } : null,
      analystReport,
    });
  } catch (error) {
    console.error('Falha ao buscar insights do treinador.', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
