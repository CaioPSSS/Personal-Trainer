import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const aiPrisma = prisma as typeof prisma & { aiReport: any };

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    await aiPrisma.aiReport.update({
      where: { id },
      data: { isRead: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Falha ao marcar relatório como lido.', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
