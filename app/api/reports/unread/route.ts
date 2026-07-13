import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const report = await prisma.aiReport.findFirst({
      where: { isRead: false },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ report });
  } catch (error) {
    console.error('Falha ao buscar relatório não lido.', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
