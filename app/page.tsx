import DashboardClient from './components/DashboardClient';
import { prisma } from '@/lib/prisma';
import { AthleteProfile, MesocyclePlan } from '@prisma/client';

export const dynamic = 'force-dynamic';

type ProfileWithMesocycles = AthleteProfile & {
  mesocycles: MesocyclePlan[];
};

export default async function Home() {
  let athleteProfile: ProfileWithMesocycles | null = null;

  try {
    athleteProfile = await prisma.athleteProfile.findUnique({
      where: { id: 'singleton' },
      include: {
        mesocycles: {
          where: { status: 'active' },
        },
      },
    });
  } catch (error) {
    console.error('Erro de inicialização do banco de dados:', error);
  }

  return <DashboardClient initialAthleteProfile={athleteProfile} />;
}