export interface RacePredictionItem {
  distanceLabel: '5K' | '10K' | '21.1K (Meia Maratona)';
  distanceKm: number;
  predictedTimeSec: number;
  formattedTime: string;
  predictedPaceSec: number;
  formattedPace: string;
}

export interface VdotDataPoint {
  date: string;
  vdot: number;
  pace5kSec: number;
  pace10kSec: number;
  formatted5k: string;
  formatted10k: string;
}

export function formatDurationClock(totalSeconds: number): string {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds <= 0) return '--:--';
  const sec = Math.round(totalSeconds);
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const remSec = sec % 60;

  if (hours > 0) {
    return `${hours}h${String(minutes).padStart(2, '0')}m${String(remSec).padStart(2, '0')}s`;
  }
  return `${minutes}:${String(remSec).padStart(2, '0')}`;
}

export function formatPacePerKm(secPerKm?: number | null): string {
  if (!secPerKm || isNaN(secPerKm) || secPerKm <= 0) return '--:--';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

/**
 * Estimates Jack Daniels VDOT from a running execution.
 * Accounts for sub-maximal effort when avgHeartRate and maxHeartRate are available,
 * so Zone 2 easy runs reflect true aerobic VDOT capacity rather than race-only effort.
 */
export function estimateVdotFromExecution(params: {
  distanceKm: number;
  durationSeconds: number;
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
  restingHeartRate?: number | null;
}): number | null {
  const { distanceKm, durationSeconds, avgHeartRate, maxHeartRate, restingHeartRate } = params;
  if (!distanceKm || distanceKm < 1 || !durationSeconds || durationSeconds <= 0) return null;

  const durationMinutes = durationSeconds / 60;
  const velocityMetersPerMin = (distanceKm * 1000) / durationMinutes;

  // Oxygen cost VO2 (ml/kg/min) via Daniels & Gilbert equation
  const vo2AtPace =
    -4.6 +
    0.182258 * velocityMetersPerMin +
    0.000104 * velocityMetersPerMin * velocityMetersPerMin;

  if (vo2AtPace <= 10) return null;

  // Fraction of VO2max sustained
  let fractionVo2Max: number;

  if (avgHeartRate && maxHeartRate && maxHeartRate > 120 && avgHeartRate > 90) {
    const restHr = restingHeartRate && restingHeartRate > 35 ? restingHeartRate : 60;
    const hrrFraction = Math.min(
      1.0,
      Math.max(0.55, (avgHeartRate - restHr) / Math.max(40, maxHeartRate - restHr))
    );
    // In endurance physiology, %HRR closely tracks %VO2max
    fractionVo2Max = hrrFraction;
  } else {
    // Daniels time-based drop-off curve for maximal/near-maximal efforts
    fractionVo2Max =
      0.8 +
      0.1894393 * Math.exp(-0.012778 * durationMinutes) +
      0.2989558 * Math.exp(-0.1932605 * durationMinutes);
  }

  const estimatedVdot = vo2AtPace / Math.max(0.55, fractionVo2Max);
  return Math.round(Math.min(85, Math.max(22, estimatedVdot)) * 10) / 10;
}

export function estimateVdotFrom5kPaceSec(pace5kSec: number): number {
  const durationMinutes = (pace5kSec * 5) / 60;
  return (
    estimateVdotFromExecution({
      distanceKm: 5,
      durationSeconds: durationMinutes * 60,
    }) ?? 40
  );
}

export function predictRaceTimesFrom5kPace(pace5kSec: number): RacePredictionItem[] {
  if (!pace5kSec || pace5kSec <= 0) return [];

  const time5kSec = Math.round(pace5kSec * 5);
  // Peter Riegel endurance scaling: T2 = T1 * (D2 / D1)^1.06
  const time10kSec = Math.round(time5kSec * Math.pow(10 / 5, 1.06));
  const timeHalfSec = Math.round(time5kSec * Math.pow(21.0975 / 5, 1.06));

  const pace10kSec = Math.round(time10kSec / 10);
  const paceHalfSec = Math.round(timeHalfSec / 21.0975);

  return [
    {
      distanceLabel: '5K',
      distanceKm: 5,
      predictedTimeSec: time5kSec,
      formattedTime: formatDurationClock(time5kSec),
      predictedPaceSec: Math.round(pace5kSec),
      formattedPace: formatPacePerKm(pace5kSec),
    },
    {
      distanceLabel: '10K',
      distanceKm: 10,
      predictedTimeSec: time10kSec,
      formattedTime: formatDurationClock(time10kSec),
      predictedPaceSec: pace10kSec,
      formattedPace: formatPacePerKm(pace10kSec),
    },
    {
      distanceLabel: '21.1K (Meia Maratona)',
      distanceKm: 21.1,
      predictedTimeSec: timeHalfSec,
      formattedTime: formatDurationClock(timeHalfSec),
      predictedPaceSec: paceHalfSec,
      formattedPace: formatPacePerKm(paceHalfSec),
    },
  ];
}
