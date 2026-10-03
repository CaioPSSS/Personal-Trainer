'use client';

import React from 'react';
import {
  X,
  Footprints,
  Calendar,
  Timer,
  Activity,
  Heart,
  Zap,
  TrendingUp,
  Mountain,
  Flame,
  Award,
  ExternalLink,
} from 'lucide-react';
import {
  evaluateRunningPerformance,
  formatDuration,
  RunningPerformanceEvaluation,
  HrZoneDef,
} from '@/lib/running/performance-evaluator';

export interface RunningDebriefModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: {
    title: string;
    sessionType: string;
    totalDistanceKm?: number | null;
    totalDurationMin?: number | null;
    targetPaceSec?: number | null;
    targetHrZone?: string | null;
    scheduledDate: string;
    notes?: string | null;
  } | null;
  execution: {
    distanceKm: number;
    durationSeconds: number;
    avgPaceSec?: number | null;
    avgHeartRate?: number | null;
    maxHeartRate?: number | null;
    elevationGainM?: number | null;
    cadenceAvg?: number | null;
    temperature?: number | null;
    caloriesBurned?: number | null;
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
    stravaActivityId?: string | null;
    date: string;
  } | null;
  hrZones?: Record<string, HrZoneDef> | null;
}

export default function RunningDebriefModal({
  isOpen,
  onClose,
  session,
  execution,
  hrZones,
}: RunningDebriefModalProps) {
  if (!isOpen || !execution) return null;

  // If no session is linked, create a dummy baseline with actual execution
  const effectiveSession = session || {
    title: execution.notes || 'Corrida Realizada',
    sessionType: 'easy',
    totalDistanceKm: execution.distanceKm,
    totalDurationMin: Math.round(execution.durationSeconds / 60),
    targetPaceSec: execution.avgPaceSec,
    targetHrZone: 'zone2',
    scheduledDate: execution.date,
  };

  const evaluation: RunningPerformanceEvaluation = evaluateRunningPerformance({
    session: effectiveSession,
    execution,
    hrZones,
  });

  const isStrava = execution.source === 'strava';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <div className="glass-card w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl border border-emerald-500/30 bg-slate-900/95 shadow-2xl overflow-hidden animate-scaleUp">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-800 flex items-start justify-between gap-3 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Footprints className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  Debriefing de Corrida
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    evaluation.adherenceGrade === 'elite'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : evaluation.adherenceGrade === 'on_target'
                      ? 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                      : evaluation.adherenceGrade === 'moderate'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  }`}
                >
                  {evaluation.adherenceLabel}
                </span>
                {isStrava && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/30">
                    Strava
                  </span>
                )}
              </div>
              <h2 className="text-lg sm:text-xl font-black text-slate-100 truncate mt-0.5">
                {effectiveSession.title}
              </h2>
              <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>{execution.date}</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Timer className="w-3.5 h-3.5 text-slate-500" />
                  <span>{formatDuration(execution.durationSeconds)}</span>
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-slate-200">
          {/* Top Compliance Radar Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* 1. Distance Metric */}
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5 font-semibold">
                  <Footprints className="w-4 h-4 text-emerald-400" />
                  <span>Distância</span>
                </span>
                <span className="font-mono text-emerald-400 font-bold">
                  {evaluation.distance.percentage ? `${evaluation.distance.percentage}%` : '100%'}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-slate-100">
                  {evaluation.distance.actualKm.toFixed(1)}
                </span>
                <span className="text-xs text-slate-400">
                  / {evaluation.distance.targetKm ? `${evaluation.distance.targetKm.toFixed(1)} km alvo` : 'km'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                {evaluation.distance.statusLabel}
              </div>
            </div>

            {/* 2. Pace Metric */}
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5 font-semibold">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <span>Ritmo Médio</span>
                </span>
                <span className="font-mono text-cyan-300 font-bold">
                  {evaluation.pace.actualFormatted}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-slate-100 font-mono">
                  {evaluation.pace.actualFormatted.replace('/km', '')}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {evaluation.pace.targetSec ? `(alvo: ${evaluation.pace.targetFormatted})` : '/km'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                {evaluation.pace.differenceLabel}
              </div>
            </div>

            {/* 3. Heart Rate Metric */}
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5 font-semibold">
                  <Heart className="w-4 h-4 text-rose-400" />
                  <span>Frequência Cardíaca</span>
                </span>
                <span className="font-mono text-rose-300 font-bold">
                  {evaluation.heartRate.avgBpm ? `${evaluation.heartRate.avgBpm} bpm` : '--'}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-slate-100">
                  {evaluation.heartRate.avgBpm ?? '--'}
                </span>
                <span className="text-xs text-slate-400">
                  {evaluation.heartRate.maxBpm ? `(máx: ${evaluation.heartRate.maxBpm} bpm)` : 'bpm'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {evaluation.heartRate.statusLabel}
              </div>
            </div>
          </div>

          {/* Coach Insight Summary Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/30 via-slate-900 to-slate-900 border border-emerald-500/20 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
              <Award className="w-4 h-4" />
              <span>Avaliação Factual do Running Coach AI</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {evaluation.coachFeedback}
            </p>
          </div>

          {/* Additional Telemetry Details */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/60 space-y-0.5">
              <span className="text-slate-500 text-[10px] uppercase font-semibold flex items-center gap-1">
                <Zap className="w-3 h-3 text-amber-400" />
                Cadência
              </span>
              <div className="font-bold text-slate-200">
                {execution.cadenceAvg ? `${execution.cadenceAvg} spm` : '-- spm'}
              </div>
              <div className="text-[10px] text-slate-500">Passos por minuto</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/60 space-y-0.5">
              <span className="text-slate-500 text-[10px] uppercase font-semibold flex items-center gap-1">
                <Mountain className="w-3 h-3 text-cyan-400" />
                Altimetria
              </span>
              <div className="font-bold text-slate-200">
                {execution.elevationGainM != null ? `+${Math.round(execution.elevationGainM)} m` : '--'}
              </div>
              <div className="text-[10px] text-slate-500">Ganho elevação</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/60 space-y-0.5">
              <span className="text-slate-500 text-[10px] uppercase font-semibold flex items-center gap-1">
                <Flame className="w-3 h-3 text-rose-400" />
                Esforço (RPE)
              </span>
              <div className="font-bold text-slate-200">
                {execution.sessionRpe ? `RPE ${execution.sessionRpe} / 10` : 'RPE 7 / 10'}
              </div>
              <div className="text-[10px] text-slate-500">Borg CR-10</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/60 space-y-0.5">
              <span className="text-slate-500 text-[10px] uppercase font-semibold flex items-center gap-1">
                <Flame className="w-3 h-3 text-amber-400" />
                Gasto Calórico
              </span>
              <div className="font-bold text-amber-300">
                {execution.caloriesBurned ? `${execution.caloriesBurned} kcal` : '--'}
              </div>
              <div className="text-[10px] text-slate-500">{isStrava ? 'Strava/HR' : 'Margaria'}</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/60 space-y-0.5 col-span-2 sm:col-span-1">
              <span className="text-slate-500 text-[10px] uppercase font-semibold flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-indigo-400" />
                Pacing
              </span>
              <div className="font-bold text-slate-200 truncate">
                {evaluation.splits.fastestKm ? `Km ${evaluation.splits.fastestKm.km} mais rápido` : 'Constante'}
              </div>
              <div className="text-[10px] text-slate-500 truncate">
                {evaluation.splits.pacingStrategy.split('(')[0]}
              </div>
            </div>
          </div>

          {/* Kilometer Splits Table / Bars */}
          {evaluation.splits.items.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>Parciais por Quilômetro ({evaluation.splits.items.length} km)</span>
                </span>
                <span className="text-[11px] text-emerald-400 font-medium">
                  {evaluation.splits.pacingStrategy}
                </span>
              </div>

              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {evaluation.splits.items.map((split) => {
                  const isFastest = evaluation.splits.fastestKm?.km === split.km;
                  const isSlowest = evaluation.splits.slowestKm?.km === split.km;

                  return (
                    <div
                      key={split.km}
                      className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition ${
                        isFastest
                          ? 'border-emerald-500/40 bg-emerald-950/20'
                          : 'border-slate-800/80 bg-slate-950/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-8 font-bold text-slate-400 text-[11px]">
                          Km {split.km}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-100 text-sm">
                            {split.paceFormatted}
                          </span>
                          {isFastest && (
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                              Mais Rápido 🔥
                            </span>
                          )}
                          {isSlowest && (
                            <span className="text-[10px] font-medium text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                              Mais Lento
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-[11px]">
                        {split.avgHr && (
                          <span className="flex items-center gap-1 text-rose-300 font-mono">
                            <Heart className="w-3 h-3 text-rose-400" />
                            <span>{split.avgHr} bpm</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* User Notes */}
          {execution.notes && (
            <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 text-xs text-slate-400 space-y-1">
              <span className="font-semibold text-slate-300">Anotações da Atividade:</span>
              <p className="italic">{execution.notes}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between gap-3 bg-slate-950/60">
          <div>
            {isStrava && execution.stravaActivityId && (
              <a
                href={`https://www.strava.com/activities/${execution.stravaActivityId}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 font-bold transition"
              >
                <span>Ver no Strava</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-bold transition shadow-lg shadow-emerald-500/20 cursor-pointer"
          >
            Fechar Estatísticas
          </button>
        </div>
      </div>
    </div>
  );
}
