import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId é obrigatório.' }, { status: 400 });
    }

    const session = await prisma.runningSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json({ error: 'Sessão de corrida não encontrada.' }, { status: 404 });
    }

    const updatedSession = await prisma.runningSession.update({
      where: { id: sessionId },
      data: { status: 'skipped' },
    });

    // Also update associated calendar event if exists
    await prisma.calendarEvent.updateMany({
      where: {
        referenceId: sessionId,
        referenceModel: 'RunningSession',
      },
      data: { status: 'skipped' },
    });

    return NextResponse.json({ success: true, session: updatedSession });
  } catch (error) {
    console.error('[Running Session Skip] Erro ao pular sessão:', error);
    return NextResponse.json({ error: 'Falha ao marcar treino como pulado.' }, { status: 500 });
  }
}
