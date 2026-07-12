import DashboardClient from './components/DashboardClient';
import { prisma } from '@/lib/prisma';
import { generateInsights } from '@/lib/metabolicAlgo';

// Desativa o cache estático do Next.js para esta rota inteira
export const dynamic = 'force-dynamic';

export default async function Home() {
  const [settings, logs] = await Promise.all([
    prisma.userSettings.findUnique({ where: { id: 'singleton' } }),
    prisma.dailyLog.findMany({ orderBy: { date: 'desc' }, take: 30 }),
  ]);
  
  const fullLogs = logs.map((log) => {
    const asAny = log as any;
    return {
      date: asAny.date,
      weight: asAny.weight ?? null,
      caloriesConsumed: asAny.caloriesConsumed ?? null,
      caloriesBurned: asAny.caloriesBurned ?? null,
      trainingType: asAny.trainingType ?? 'Descanso',
      sleepHours: asAny.sleepHours ?? null,
      waterIntake: asAny.waterIntake ?? null,
      stressLevel: asAny.stressLevel ?? null,
      mood: asAny.mood ?? null,
      proteinConsumed: asAny.proteinConsumed ?? null,
      waistCircumference: asAny.waistCircumference ?? null,
    };
  });

  const insights = generateInsights(logs, settings ? [settings] : []);

  return <DashboardClient initialSettings={settings} initialLogs={fullLogs} initialInsights={insights} />;
}