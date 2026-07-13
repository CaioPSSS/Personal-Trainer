import DashboardClient from './components/DashboardClient';
import { prisma } from '@/lib/prisma';
import { generateInsights } from '@/lib/metabolicAlgo';

// Desativa o cache estático do Next.js para esta rota inteira
export const dynamic = 'force-dynamic';

export default async function Home() {
  const [settings, logs, athleteProfile] = await Promise.all([
    prisma.userSettings.findUnique({ where: { id: 'singleton' } }),
    prisma.dailyLog.findMany({ orderBy: { date: 'desc' }, take: 30 }),
    prisma.athleteProfile.findUnique({ where: { id: 'singleton' } }),
  ]);
  
  const fullLogs = logs.map((log) => {
    return {
      date: log.date,
      weight: log.weight ?? null,
      caloriesConsumed: log.caloriesConsumed ?? null,
      caloriesBurned: log.caloriesBurned ?? null,
      trainingType: log.trainingType ?? 'Descanso',
      sleepHours: log.sleepHours ?? null,
      waterIntake: log.waterIntake ?? null,
      stressLevel: log.stressLevel ?? null,
      mood: log.mood ?? null,
      proteinConsumed: log.proteinConsumed ?? null,
      waistCircumference: log.waistCircumference ?? null,
    };
  });

  const insights = generateInsights(logs, settings ? [settings] : []);

  return (
    <DashboardClient
      initialSettings={settings}
      initialAthleteProfile={athleteProfile}
      initialLogs={fullLogs}
      initialInsights={insights}
    />
  );
}