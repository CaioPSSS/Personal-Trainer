/**
 * Pure evaluation engine for running performance compliance against planned session targets.
 * Calculates distance, pace, heart rate zone, and pacing consistency metrics.
 */

export interface RunningSessionEvaluationInput {
  title: string;
  sessionType: string;
  totalDistanceKm?: number | null;
  totalDurationMin?: number | null;
  targetPaceSec?: number | null;
  targetHrZone?: string | null;
  scheduledDate: string;
}

export interface RunningExecutionEvaluationInput {
  distanceKm: number;
  durationSeconds: number;
  avgPaceSec?: number | null;
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
  elevationGainM?: number | null;
  cadenceAvg?: number | null;
  temperature?: number | null;
  splits?: Array<{
    km: number;
    paceSec?: number;
    distanceM?: number;
    movingTimeSec?: number;
    avgHr?: number | null;
  }> | null;
  sessionRpe?: number | null;
  notes?: string | null;
  source?: string;
  date: string;
}

export interface HrZoneDef {
  min: number;
  max: number;
  label: string;
}

export interface RunningPerformanceEvaluation {
  distance: {
    targetKm: number | null;
    actualKm: number;
    deltaKm: number | null;
    percentage: number | null;
    status: 'optimal' | 'over_distance' | 'under_distance' | 'no_target';
    statusLabel: string;
  };
  pace: {
    targetSec: number | null;
    actualSec: number;
    deltaSec: number | null;
    targetFormatted: string;
    actualFormatted: string;
    differenceLabel: string;
    status: 'optimal' | 'faster_than_planned' | 'slower_than_planned' | 'free_pace';
    statusLabel: string;
  };
  heartRate: {
    avgBpm: number | null;
    maxBpm: number | null;
    targetZone: string | null;
    targetZoneRange: HrZoneDef | null;
    status: 'in_zone' | 'above_zone' | 'below_zone' | 'no_data';
    statusLabel: string;
  };
  cadence: {
    avgSpm: number | null;
    status: 'optimal' | 'moderate' | 'low' | 'no_data';
    statusLabel: string;
  };
  splits: {
    items: Array<{
      km: number;
      paceSec: number;
      paceFormatted: string;
      avgHr: number | null;
    }>;
    fastestKm: { km: number; paceFormatted: string } | null;
    slowestKm: { km: number; paceFormatted: string } | null;
    pacingStrategy: string;
  };
  adherenceScore: number; // 0 to 100
  adherenceGrade: 'elite' | 'on_target' | 'moderate' | 'off_target';
  adherenceLabel: string;
  coachFeedback: string;
}

export function formatPace(sec?: number | null): string {
  if (!sec || isNaN(sec) || sec <= 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}/km`;
}

export function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (min >= 60) {
    const hours = Math.floor(min / 60);
    const remMin = min % 60;
    return `${hours}h ${remMin}m`;
  }
  return `${min}m ${sec}s`;
}

export function evaluateRunningPerformance(params: {
  session: RunningSessionEvaluationInput;
  execution: RunningExecutionEvaluationInput;
  hrZones?: Record<string, HrZoneDef> | null;
}): RunningPerformanceEvaluation {
  const { session, execution, hrZones } = params;

  // 1. Distance Evaluation
  const actualKm = Number(execution.distanceKm.toFixed(2));
  const targetKm = session.totalDistanceKm ? Number(session.totalDistanceKm.toFixed(2)) : null;

  let deltaKm: number | null = null;
  let distPercentage: number | null = null;
  let distStatus: RunningPerformanceEvaluation['distance']['status'] = 'no_target';
  let distStatusLabel = 'Sem meta de distância';

  if (targetKm && targetKm > 0) {
    deltaKm = Number((actualKm - targetKm).toFixed(2));
    distPercentage = Math.round((actualKm / targetKm) * 100);

    if (distPercentage >= 90 && distPercentage <= 115) {
      distStatus = 'optimal';
      distStatusLabel = `🎯 Na meta de volume (${distPercentage}%)`;
    } else if (distPercentage > 115) {
      distStatus = 'over_distance';
      distStatusLabel = `⚠️ Acima do planejado (+${deltaKm} km / ${distPercentage}%)`;
    } else {
      distStatus = 'under_distance';
      distStatusLabel = `📉 Abaixo do planejado (${deltaKm} km / ${distPercentage}%)`;
    }
  }

  // 2. Pace Evaluation
  const actualSec = execution.avgPaceSec && execution.avgPaceSec > 0
    ? execution.avgPaceSec
    : Math.round(execution.durationSeconds / Math.max(actualKm, 0.1));

  const targetSec = session.targetPaceSec && session.targetPaceSec > 0 ? session.targetPaceSec : null;

  let deltaSec: number | null = null;
  let diffLabel = '--';
  let paceStatus: RunningPerformanceEvaluation['pace']['status'] = 'free_pace';
  let paceStatusLabel = 'Ritmo por percepção de esforço (RPE)';

  if (targetSec) {
    deltaSec = actualSec - targetSec; // Negative means faster than target
    const diffAbs = Math.abs(deltaSec);

    if (deltaSec < 0) {
      diffLabel = `${diffAbs}s/km mais rápido que a meta`;
    } else if (deltaSec > 0) {
      diffLabel = `${diffAbs}s/km mais lento que a meta`;
    } else {
      diffLabel = 'Exatamente no ritmo alvo';
    }

    const isEasyType = ['easy', 'recovery', 'long_run'].includes(session.sessionType.toLowerCase());

    if (diffAbs <= 15) {
      paceStatus = 'optimal';
      paceStatusLabel = `🎯 Controle de ritmo exemplar (±${diffAbs}s/km)`;
    } else if (deltaSec < -15) {
      paceStatus = 'faster_than_planned';
      paceStatusLabel = isEasyType
        ? `⚡ Mais rápido que a zona aeróbica (${diffLabel})`
        : `🔥 Ritmo forte (${diffLabel})`;
    } else {
      paceStatus = 'slower_than_planned';
      paceStatusLabel = `🐢 Ritmo mais conservador (${diffLabel})`;
    }
  }

  // 3. Heart Rate & Zone Evaluation
  const avgHr = execution.avgHeartRate ?? null;
  const maxHr = execution.maxHeartRate ?? null;
  const targetZoneKey = session.targetHrZone ? session.targetHrZone.toLowerCase().replace(/[\s_-]/g, '') : null;

  let targetZoneRange: HrZoneDef | null = null;
  if (hrZones && targetZoneKey) {
    targetZoneRange = hrZones[targetZoneKey] || null;
    if (!targetZoneRange) {
      // Try fuzzy matching (e.g. 'zone2' vs 'zona2')
      const normalizedKey = targetZoneKey.replace('zona', 'zone');
      targetZoneRange = hrZones[normalizedKey] || null;
    }
  }

  let hrStatus: RunningPerformanceEvaluation['heartRate']['status'] = 'no_data';
  let hrStatusLabel = 'Sem dados cardíacos registrados';

  if (avgHr) {
    if (targetZoneRange) {
      if (avgHr >= targetZoneRange.min && avgHr <= targetZoneRange.max) {
        hrStatus = 'in_zone';
        hrStatusLabel = `💚 FC perfeita na ${targetZoneRange.label} (${avgHr} bpm)`;
      } else if (avgHr > targetZoneRange.max) {
        hrStatus = 'above_zone';
        hrStatusLabel = `🔥 FC média acima da zona prevista (${avgHr} bpm > ${targetZoneRange.max} bpm)`;
      } else {
        hrStatus = 'below_zone';
        hrStatusLabel = `❄️ FC média abaixo da zona (${avgHr} bpm < ${targetZoneRange.min} bpm)`;
      }
    } else {
      hrStatus = 'in_zone';
      hrStatusLabel = `FC Média: ${avgHr} bpm (Máx: ${maxHr ?? '--'} bpm)`;
    }
  }

  // 4. Cadence Evaluation
  const avgSpm = execution.cadenceAvg ?? null;
  let cadenceStatus: RunningPerformanceEvaluation['cadence']['status'] = 'no_data';
  let cadenceStatusLabel = 'Sem sensor de cadência';

  if (avgSpm) {
    if (avgSpm >= 165 && avgSpm <= 185) {
      cadenceStatus = 'optimal';
      cadenceStatusLabel = `⚡ Cadência ideal de corrida (${avgSpm} spm) — excelente economia articular`;
    } else if (avgSpm >= 155 && avgSpm < 165) {
      cadenceStatus = 'moderate';
      cadenceStatusLabel = `Cadência moderada (${avgSpm} spm)`;
    } else if (avgSpm < 155) {
      cadenceStatus = 'low';
      cadenceStatusLabel = `Cadência baixa (${avgSpm} spm) — passadas longas, aumente o giro para poupar joelhos`;
    } else {
      cadenceStatus = 'optimal';
      cadenceStatusLabel = `Cadência alta (${avgSpm} spm)`;
    }
  }

  // 5. Splits Analysis
  const splitItems: RunningPerformanceEvaluation['splits']['items'] = [];
  if (Array.isArray(execution.splits) && execution.splits.length > 0) {
    for (const s of execution.splits) {
      const pace = s.paceSec || (s.distanceM && s.movingTimeSec ? Math.round(s.movingTimeSec / (s.distanceM / 1000)) : 0);
      splitItems.push({
        km: s.km,
        paceSec: pace,
        paceFormatted: formatPace(pace),
        avgHr: s.avgHr ?? null,
      });
    }
  }

  let fastestKm: RunningPerformanceEvaluation['splits']['fastestKm'] = null;
  let slowestKm: RunningPerformanceEvaluation['splits']['slowestKm'] = null;
  let pacingStrategy = 'Ritmo uniforme';

  if (splitItems.length > 1) {
    const validSplits = splitItems.filter((s) => s.paceSec > 120 && s.paceSec < 900);
    if (validSplits.length > 0) {
      const fastest = [...validSplits].sort((a, b) => a.paceSec - b.paceSec)[0];
      const slowest = [...validSplits].sort((a, b) => b.paceSec - a.paceSec)[0];

      fastestKm = { km: fastest.km, paceFormatted: fastest.paceFormatted };
      slowestKm = { km: slowest.km, paceFormatted: slowest.paceFormatted };

      const firstHalf = validSplits.slice(0, Math.floor(validSplits.length / 2));
      const secondHalf = validSplits.slice(Math.floor(validSplits.length / 2));

      const avgFirst = firstHalf.reduce((acc, s) => acc + s.paceSec, 0) / Math.max(firstHalf.length, 1);
      const avgSecond = secondHalf.reduce((acc, s) => acc + s.paceSec, 0) / Math.max(secondHalf.length, 1);

      if (avgSecond < avgFirst - 5) {
        pacingStrategy = 'Split Negativo (aceleração progressiva na segunda metade 🚀)';
      } else if (avgSecond > avgFirst + 10) {
        pacingStrategy = 'Split Positivo (início mais rápido, desaceleração gradual)';
      } else {
        pacingStrategy = 'Even Split (ritmo constante e homogêneo 🎯)';
      }
    }
  }

  // 6. Overall Adherence Score Calculation (0 to 100)
  let score = 100;

  // Distance penalty
  if (distPercentage) {
    if (distPercentage < 80) score -= (80 - distPercentage) * 1.5;
    else if (distPercentage > 125) score -= Math.min(20, (distPercentage - 125) * 0.8);
  }

  // Pace penalty
  if (targetSec && deltaSec !== null) {
    const absDiff = Math.abs(deltaSec);
    if (absDiff > 15) {
      score -= Math.min(25, (absDiff - 15) * 0.7);
    }
  }

  // Heart rate penalty
  if (hrStatus === 'above_zone') {
    score -= 15;
  }

  score = Math.max(40, Math.min(100, Math.round(score)));

  let adherenceGrade: RunningPerformanceEvaluation['adherenceGrade'] = 'on_target';
  let adherenceLabel = '🎯 Dentro da Meta';

  if (score >= 92) {
    adherenceGrade = 'elite';
    adherenceLabel = '🌟 Execução de Elite (+92% de precisão)';
  } else if (score >= 80) {
    adherenceGrade = 'on_target';
    adherenceLabel = '🎯 Dentro da Meta Programada';
  } else if (score >= 65) {
    adherenceGrade = 'moderate';
    adherenceLabel = '⚡ Variação Moderada do Alvo';
  } else {
    adherenceGrade = 'off_target';
    adherenceLabel = '⚠️ Fora dos Parâmetros Alvo';
  }

  // 7. Scientific Coach Feedback Synthesis
  const feedbackParts: string[] = [];

  if (distPercentage) {
    feedbackParts.push(
      `Volume executado: ${actualKm} km (${distPercentage}% da meta de ${targetKm} km).`
    );
  } else {
    feedbackParts.push(`Volume executado: ${actualKm} km.`);
  }

  if (targetSec && deltaSec !== null) {
    if (paceStatus === 'optimal') {
      feedbackParts.push(
        `O ritmo médio de ${formatPace(actualSec)} cumpriu com precisão o planejado (${formatPace(targetSec)}).`
      );
    } else if (deltaSec < 0) {
      feedbackParts.push(
        `Você correu mais rápido (${formatPace(actualSec)}) que o alvo (${formatPace(targetSec)}). Em treinos de rodagem, lembre-se de poupar glicogênio.`
      );
    } else {
      feedbackParts.push(
        `O ritmo médio de ${formatPace(actualSec)} foi ligeiramente conservador em relação à meta de ${formatPace(targetSec)}.`
      );
    }
  }

  if (hrStatus === 'in_zone') {
    feedbackParts.push('Frequência cardíaca perfeitamente enquadrada na zona metabólica prescrita.');
  } else if (hrStatus === 'above_zone') {
    feedbackParts.push('Atenção à FC elevada: intensidade passou para limiar anaeróbico.');
  }

  const coachFeedback = feedbackParts.join(' ');

  return {
    distance: {
      targetKm,
      actualKm,
      deltaKm,
      percentage: distPercentage,
      status: distStatus,
      statusLabel: distStatusLabel,
    },
    pace: {
      targetSec,
      actualSec,
      deltaSec,
      targetFormatted: formatPace(targetSec),
      actualFormatted: formatPace(actualSec),
      differenceLabel: diffLabel,
      status: paceStatus,
      statusLabel: paceStatusLabel,
    },
    heartRate: {
      avgBpm: avgHr,
      maxBpm: maxHr,
      targetZone: session.targetHrZone ?? null,
      targetZoneRange,
      status: hrStatus,
      statusLabel: hrStatusLabel,
    },
    cadence: {
      avgSpm,
      status: cadenceStatus,
      statusLabel: cadenceStatusLabel,
    },
    splits: {
      items: splitItems,
      fastestKm,
      slowestKm,
      pacingStrategy,
    },
    adherenceScore: score,
    adherenceGrade,
    adherenceLabel,
    coachFeedback,
  };
}
