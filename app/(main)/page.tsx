import { prisma } from '@/lib/prisma';
import ExecutiveDashboard from '@/app/components/ExecutiveDashboard';
import { AthleteProfile, MesocyclePlan } from '@prisma/client';

export const dynamic = 'force-dynamic';

type ProfileWithMesocycles = AthleteProfile & {
  mesocycles: MesocyclePlan[];
};

export default async function HomePage() {
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
    console.error('Erro ao buscar perfil do atleta na página principal:', error);
  }

  return <ExecutiveDashboard athleteProfile={athleteProfile} />;
}
