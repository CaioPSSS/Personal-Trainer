import { prisma } from '@/lib/prisma';
import SettingsClient from '@/app/components/SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  let athleteProfile = null;
  let runningProfile = null;
  let stravaIntegration = null;

  try {
    athleteProfile = await prisma.athleteProfile.findUnique({
      where: { id: 'singleton' },
    });
    runningProfile = await prisma.runningProfile.findUnique({
      where: { id: 'singleton' },
    });
    stravaIntegration = await prisma.stravaIntegration.findUnique({
      where: { id: 'singleton' },
    });
  } catch (error) {
    console.error('Erro ao buscar dados na página de configurações:', error);
  }

  const stravaConnected = !!stravaIntegration?.accessToken;
  const stravaLastSync = stravaIntegration?.lastSyncAt
    ? stravaIntegration.lastSyncAt.toISOString()
    : null;
  const athleteStravaId = stravaIntegration?.athleteStravaId ?? null;
  const stravaScope = stravaIntegration?.scope ?? null;

  return (
    <SettingsClient
      athleteProfile={athleteProfile}
      runningProfile={runningProfile}
      stravaConnected={stravaConnected}
      stravaLastSync={stravaLastSync}
      athleteStravaId={athleteStravaId}
      stravaScope={stravaScope}
    />
  );
}
