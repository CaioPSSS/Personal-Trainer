import { prisma } from '@/lib/prisma';
import ExecutiveDashboard from '@/app/components/ExecutiveDashboard';
import { AthleteProfile, MesocyclePlan } from '@prisma/client';

import { createCalendarFeedToken } from '@/lib/auth';
import { calculateCurrentWeek, formatDateLongPTBR } from '@/lib/dateUtils';

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

  const activeMesocycle = athleteProfile?.mesocycles?.[0] || null;
  const currentWeekNumber = calculateCurrentWeek(
    activeMesocycle?.startDate ?? activeMesocycle?.createdAt,
    activeMesocycle?.durationWeeks || 4
  );
  const currentDateFormatted = formatDateLongPTBR();
  const calendarFeedToken = createCalendarFeedToken();

  return (
    <ExecutiveDashboard
      athleteProfile={athleteProfile}
      initialCurrentWeek={currentWeekNumber}
      currentDateFormatted={currentDateFormatted}
      calendarFeedToken={calendarFeedToken}
    />
  );
}
