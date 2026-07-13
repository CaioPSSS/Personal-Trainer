import DashboardClient from './components/DashboardClient';
import { prisma } from '@/lib/prisma';
import { generateInsights } from '@/lib/metabolicAlgo';
import { DailyLog, AthleteProfile, MesocyclePlan } from '@prisma/client';

// Desativa o cache estático do Next.js para esta rota inteira
export const dynamic = 'force-dynamic';

type ProfileWithMesocycles = AthleteProfile & {
  mesocycles: MesocyclePlan[];
};

export default async function Home() {
  let settings = null;
  let logs: DailyLog[] = [];
  let athleteProfile: ProfileWithMesocycles | null = null;

  try {
    const [fetchedSettings, fetchedLogs, fetchedProfile] = await Promise.all([
      prisma.userSettings.findUnique({ where: { id: 'singleton' } }),
      prisma.dailyLog.findMany({ orderBy: { date: 'desc' }, take: 30 }),
      prisma.athleteProfile.findUnique({
        where: { id: 'singleton' },
        include: {
          mesocycles: {
            where: { status: 'active' },
          },
        },
      }),
    ]);

    settings = fetchedSettings;
    logs = fetchedLogs;
    athleteProfile = fetchedProfile;
  } catch (error) {
    console.error('Erro de inicialização do banco de dados:', error);
  }

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

  let insights: string[] = [];
  try {
    insights = generateInsights(logs, settings ? [settings] : []);
  } catch (error) {
    console.error('Falha ao gerar insights metabólicos:', error);
  }

  return (
    <DashboardClient
      initialSettings={settings}
      initialAthleteProfile={athleteProfile}
      initialLogs={fullLogs}
      initialInsights={insights}
    />
  );
}