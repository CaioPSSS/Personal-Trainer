'use client';

import React, { useEffect } from 'react';
import { Trophy, Sparkles, Clock, TrendingUp, TrendingDown, ShieldAlert, X, Flame, CheckCircle2, Dumbbell } from 'lucide-react';

export interface PersonalRecordItem {
  exerciseName: string;
  metric: 'load' | 'volume';
  currentValue: number;
  previousBest: number;
  unit: 'kg' | 'kg-total';
}

export interface RecoveryGuidance {
  hours: number;
  muscleGroups: string[];
  guidanceText: string;
}

export interface PostWorkoutSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  workoutTitle?: string;
  durationMinutes?: number | null;
  sessionRpe?: number | null;
  averageRpe?: number | null;
  totalTonnage?: number;
  totalTonnageKg?: number;
  previousTonnage?: number | null;
  previousTonnageKg?: number | null;
  tonnageDeltaPercent?: number | null;
  validSetsCount?: number;
  completedSetsCount?: number;
  personalRecords?: PersonalRecordItem[];
  recovery?: RecoveryGuidance | null;
  recoveryGuidance?: string | null;
  caloriesBurned?: number | null;
  calorieBreakdown?: {
    mechanicalWorkCalories?: number;
    interSetCalories?: number;
    epocCalories?: number;
    epocFactor?: number;
    perExercise?: Array<{
      exerciseName: string;
      caloriesBurned: number;
    }>;
  } | null;
}

export default function PostWorkoutSummaryModal({
  isOpen,
  onClose,
  workoutTitle = 'Treino do Dia',
  durationMinutes,
  sessionRpe,
  averageRpe,
  totalTonnage,
  totalTonnageKg,
  previousTonnage,
  previousTonnageKg,
  tonnageDeltaPercent,
  validSetsCount,
  completedSetsCount,
  personalRecords = [],
  recovery,
  recoveryGuidance,
  caloriesBurned,
  calorieBreakdown,
}: PostWorkoutSummaryModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Normalize props for resilient consumption
  const effectiveTonnage = totalTonnageKg ?? totalTonnage ?? 0;
  const effectivePrevTonnage = previousTonnageKg ?? previousTonnage ?? null;
  const effectiveSets = validSetsCount ?? completedSetsCount ?? 0;
  const effectiveRpe = averageRpe ?? sessionRpe ?? null;
  const effectiveDuration = durationMinutes ?? 60;
  const effectiveRecoveryText =
    recovery?.guidanceText ||
    recoveryGuidance ||
    'Treino concluído. Janela ideal: 48h de recuperação muscular antes de treinos longos de corrida ou CrossFit intenso.';
  const effectiveRecoveryHours = recovery?.hours || 48;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="summary-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-3xl border border-slate-700/80 bg-slate-950/95 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6 my-8 animate-in fade-in zoom-in-95 duration-200 text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar resumo pós-treino"
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-850 transition cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Celebratory Header */}
        <div className="flex items-start gap-4">
          <div className="p-3.5 bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-slate-950 rounded-2xl shadow-lg shadow-amber-500/20 shrink-0">
            <Trophy className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Debrief Factual Pós-Treino</span>
            </div>
            <h2 id="summary-modal-title" className="text-xl sm:text-2xl font-black text-slate-100">
              {workoutTitle}
            </h2>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1 font-medium">
                <Clock className="h-3.5 w-3.5 text-slate-500" />
                {effectiveDuration} min
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 font-medium">
                <Dumbbell className="h-3.5 w-3.5 text-indigo-400" />
                {effectiveSets} séries registradas
              </span>
            </div>
          </div>
        </div>

        {/* Tonnage & Volume Progression */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Tonelagem Total da Sessão
            </span>
            {tonnageDeltaPercent !== null && tonnageDeltaPercent !== undefined ? (
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  tonnageDeltaPercent > 0
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : tonnageDeltaPercent === 0
                      ? 'bg-slate-800 text-slate-300 border-slate-700'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                }`}
              >
                {tonnageDeltaPercent > 0 ? (
                  <TrendingUp className="h-3.5 w-3.5" />
                ) : tonnageDeltaPercent < 0 ? (
                  <TrendingDown className="h-3.5 w-3.5" />
                ) : null}
                <span>
                  {tonnageDeltaPercent > 0 ? `+${tonnageDeltaPercent}%` : `${tonnageDeltaPercent}%`} vs última sessão
                </span>
              </span>
            ) : (
              <span className="text-[11px] font-medium text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                Primeira sessão deste template
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-black text-slate-100 font-mono tracking-tight">
              {effectiveTonnage.toLocaleString('pt-BR')}
            </span>
            <span className="text-sm font-bold text-slate-400">kg movimentados</span>
          </div>

          {effectivePrevTonnage !== null && effectivePrevTonnage > 0 && (
            <p className="text-xs text-slate-400 font-mono">
              Sessão anterior: {effectivePrevTonnage.toLocaleString('pt-BR')} kg
            </p>
          )}
        </div>

        {/* Estimated Caloric Expenditure */}
        {caloriesBurned != null && caloriesBurned > 0 && (
          <div className="bg-gradient-to-br from-amber-950/40 to-orange-950/20 border border-amber-500/30 rounded-2xl p-4 sm:p-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-amber-400" />
                Gasto Calórico Estimado
              </span>
              <span className="text-[10px] text-amber-300/80 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full font-medium">
                Modelo Fisiológico Lytle & Scott
              </span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-amber-300 font-mono tracking-tight">
                {caloriesBurned}
              </span>
              <span className="text-sm font-bold text-amber-200/80">kcal queimadas</span>
            </div>

            {calorieBreakdown && (
              <div className="pt-2 border-t border-amber-500/20 grid grid-cols-3 gap-2 text-center text-[10px]">
                <div className="bg-slate-900/60 rounded-lg p-1.5 border border-amber-500/10">
                  <span className="text-slate-400 block">Trabalho</span>
                  <strong className="text-amber-200 text-xs">{calorieBreakdown.mechanicalWorkCalories || 0} kcal</strong>
                </div>
                <div className="bg-slate-900/60 rounded-lg p-1.5 border border-amber-500/10">
                  <span className="text-slate-400 block">Inter-séries</span>
                  <strong className="text-amber-200 text-xs">{calorieBreakdown.interSetCalories || 0} kcal</strong>
                </div>
                <div className="bg-slate-900/60 rounded-lg p-1.5 border border-amber-500/10">
                  <span className="text-slate-400 block">EPOC (Afterburn)</span>
                  <strong className="text-amber-200 text-xs">{calorieBreakdown.epocCalories || 0} kcal</strong>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Secondary Metrics Grid: RPE & Sets */}
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3.5 space-y-1">
            <span className="text-[11px] uppercase font-bold text-slate-400 block">RPE Médio</span>
            <span className="text-xl font-black text-indigo-300 font-mono">
              {effectiveRpe !== null && effectiveRpe !== undefined ? Number(effectiveRpe).toFixed(1) : '—'}
            </span>
            <span className="text-[10px] text-slate-500 block">intensidade autorreferida</span>
          </div>
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3.5 space-y-1">
            <span className="text-[11px] uppercase font-bold text-slate-400 block">Séries Válidas</span>
            <span className="text-xl font-black text-emerald-400 font-mono">{effectiveSets}</span>
            <span className="text-[10px] text-slate-500 block">volume computado</span>
          </div>
        </div>

        {/* Personal Records (PRs) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span className="flex items-center gap-1.5 text-amber-300">
              <Flame className="h-4 w-4 text-amber-400" />
              <span>Recordes Pessoais (PRs)</span>
            </span>
            <span>{personalRecords.length} conquistados</span>
          </div>

          {personalRecords.length > 0 ? (
            <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
              {personalRecords.map((pr, idx) => (
                <div
                  key={idx}
                  className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-amber-500/20 text-amber-300 rounded-lg shrink-0">
                      <Trophy className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-100">{pr.exerciseName}</p>
                      <p className="text-[10px] text-amber-300 font-medium">
                        {pr.metric === 'load' ? 'Recorde de Carga' : 'Recorde de Volume'}
                        {pr.previousBest > 0 && ` (anterior: ${pr.previousBest} ${pr.unit})`}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-black font-mono text-amber-300 shrink-0">
                    {pr.currentValue} {pr.unit}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3 text-xs text-slate-400 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-slate-500 shrink-0" />
              <span>Consistência mantida. Nenhuma nova RM nesta sessão — sobrecarga acumulada de forma controlada.</span>
            </div>
          )}
        </div>

        {/* Factual Multi-Sport Recovery Window Guidance */}
        <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-indigo-400" />
              <span>Radar de Recuperação Multi-Esportes</span>
            </span>
            <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/30 px-2 py-0.5 rounded-full">
              {effectiveRecoveryHours}h de janela
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{effectiveRecoveryText}</p>
        </div>

        {/* Close CTA */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-slate-100 font-bold py-3.5 px-6 rounded-2xl transition shadow-lg shadow-indigo-500/20 cursor-pointer text-sm"
          >
            Concluir e Voltar ao Painel
          </button>
        </div>
      </div>
    </div>
  );
}
