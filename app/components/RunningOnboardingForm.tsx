'use client';

import React, { useState } from 'react';
import {
  Footprints,
  Sparkles,
  Heart,
  Timer,
  Calendar,
  MapPin,
  AlertTriangle,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import { useToast } from '@/app/components/ToastProvider';

interface RunningOnboardingFormProps {
  onPlanGenerated?: (planId: string) => void;
  initialProfile?: {
    primaryObjective?: string | null;
    currentPace5kSec?: number | null;
    currentPace10kSec?: number | null;
    weeklyVolumeKm?: number | null;
    availableDays?: string[] | null;
    weeklyRunsTarget?: number | null;
    maxHeartRate?: number | null;
    restingHeartRate?: number | null;
    primaryTerrain?: string | null;
    injuryHistory?: unknown | null;
  } | null;
}

const OBJECTIVE_OPTIONS = [
  { value: 'improve_5k_pace', label: '⚡ Melhorar Pace nos 5K (Velocidade & VDOT)' },
  { value: 'complete_10k', label: '🎯 Completar Primeiros 10K (Volume Gradual)' },
  { value: 'improve_10k_pace', label: '🔥 Quebrar Recorde Pessoal nos 10K' },
  { value: 'half_marathon_prep', label: '🏅 Preparação para Meia Maratona (21K)' },
  { value: 'aerobic_base_health', label: '🫀 Construção de Base Aeróbica & Longevidade' },
];

const TERRAIN_OPTIONS = [
  { value: 'road_flat', label: 'Asfalto / Rua Plana' },
  { value: 'treadmill', label: 'Esteira Ergométrica' },
  { value: 'mixed', label: 'Misto (Asfalto + Esteira)' },
  { value: 'trail', label: 'Trilha / Terreno Irregular' },
];

const WEEKDAYS = [
  { id: 'monday', label: 'Seg' },
  { id: 'tuesday', label: 'Ter' },
  { id: 'wednesday', label: 'Qua' },
  { id: 'thursday', label: 'Qui' },
  { id: 'friday', label: 'Sex' },
  { id: 'saturday', label: 'Sáb' },
  { id: 'sunday', label: 'Dom' },
];

const RUNNING_TARGET_OPTIONS = [2, 3, 4, 5];

function secondsToMmSs(seconds?: number | null): string {
  if (!seconds || isNaN(seconds)) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function RunningOnboardingForm({
  onPlanGenerated,
  initialProfile,
}: RunningOnboardingFormProps) {
  const { success, error: toastError, info } = useToast();

  const [primaryObjective, setPrimaryObjective] = useState(
    initialProfile?.primaryObjective ?? 'improve_5k_pace'
  );
  const [pace5k, setPace5k] = useState(
    initialProfile?.currentPace5kSec ? secondsToMmSs(initialProfile.currentPace5kSec) : '5:30'
  );
  const [pace10k, setPace10k] = useState(
    initialProfile?.currentPace10kSec ? secondsToMmSs(initialProfile.currentPace10kSec) : ''
  );
  const [weeklyVolumeKm, setWeeklyVolumeKm] = useState(
    initialProfile?.weeklyVolumeKm ? String(initialProfile.weeklyVolumeKm) : '20'
  );
  const [availableDays, setAvailableDays] = useState<string[]>(
    Array.isArray(initialProfile?.availableDays) && initialProfile.availableDays.length > 0
      ? initialProfile.availableDays
      : ['tuesday', 'thursday', 'saturday']
  );
  const [weeklyRunsTarget, setWeeklyRunsTarget] = useState<number>(
    initialProfile?.weeklyRunsTarget ?? 3
  );
  const [maxHeartRate, setMaxHeartRate] = useState(
    initialProfile?.maxHeartRate ? String(initialProfile.maxHeartRate) : '185'
  );
  const [restingHeartRate, setRestingHeartRate] = useState(
    initialProfile?.restingHeartRate ? String(initialProfile.restingHeartRate) : '55'
  );
  const [primaryTerrain, setPrimaryTerrain] = useState(
    initialProfile?.primaryTerrain ?? 'road_flat'
  );
  const [injuryHistory, setInjuryHistory] = useState(
    typeof initialProfile?.injuryHistory === 'string'
      ? initialProfile.injuryHistory
      : ''
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string | null>(null);

  const toggleDay = (dayId: string) => {
    if (availableDays.includes(dayId)) {
      if (availableDays.length <= 1) {
        toastError('Selecione pelo menos 1 dia disponível na semana.');
        return;
      }
      setAvailableDays(availableDays.filter((d) => d !== dayId));
    } else {
      setAvailableDays([...availableDays, dayId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!pace5k || !pace5k.trim()) {
      toastError('O ritmo de 5K é obrigatório para calibração do VDOT (ex: 5:30).');
      return;
    }

    if (availableDays.length === 0) {
      toastError('Selecione ao menos 1 dia da semana para correr.');
      return;
    }

    setIsSubmitting(true);
    setLoadingStep('Salvando perfil e calculando zonas Karvonen...');

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (process.env.NEXT_PUBLIC_INTERNAL_SECRET) {
        headers['x-internal-token'] = process.env.NEXT_PUBLIC_INTERNAL_SECRET;
      }

      // Step 1: Save Running Profile
      const profileRes = await fetch('/api/running/profile', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          primaryObjective,
          currentPace5kSec: pace5k,
          currentPace10kSec: pace10k || null,
          weeklyVolumeKm: weeklyVolumeKm ? Number(weeklyVolumeKm) : null,
          availableDays,
          weeklyRunsTarget: Number(weeklyRunsTarget),
          maxHeartRate: maxHeartRate ? Number(maxHeartRate) : null,
          restingHeartRate: restingHeartRate ? Number(restingHeartRate) : null,
          primaryTerrain,
          injuryHistory: injuryHistory.trim() ? injuryHistory.trim() : null,
        }),
      });

      if (!profileRes.ok) {
        const errorData = await profileRes.json().catch(() => ({}));
        throw new Error(errorData.error ?? 'Falha ao salvar perfil de corrida.');
      }

      setLoadingStep('Running Coach AI gerando periodização 80/20 (Pete Pfitzinger & VDOT)...');
      info('Perfil salvo! A IA está estruturando seu mesociclo de 4 semanas...', 'Coach Iniciado');

      // Step 2: Trigger AI Plan Generation
      const genRes = await fetch('/api/running/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });

      if (!genRes.ok) {
        const errorData = await genRes.json().catch(() => ({}));
        throw new Error(errorData.error ?? 'Falha na geração do plano pela IA.');
      }

      const genData = await genRes.json();
      success(
        `Plano de 4 semanas gerado com sucesso via ${genData.modelUsed || 'AI Coach'} (${genData.sessionsCount} sessões programadas)!`,
        'Periodização Concluída'
      );

      if (onPlanGenerated) {
        onPlanGenerated(genData.planId);
      } else {
        window.location.reload();
      }
    } catch (err) {
      console.error('[Running Onboarding] Erro:', err);
      toastError(err instanceof Error ? err.message : 'Erro ao processar onboarding de corrida.');
    } finally {
      setIsSubmitting(false);
      setLoadingStep(null);
    }
  };

  return (
    <div className="glass-card p-6 sm:p-8 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-2 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
          <Footprints className="w-4 h-4" />
          <span>Configuração do Treinador de Corrida</span>
        </div>
        <h2 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-300">
          Onboarding & Calibração Fisiológica
        </h2>
        <p className="text-xs sm:text-sm text-slate-400">
          Defina suas metas e parâmetros cardíacos para que o Running Coach AI prescreva suas
          zonas de ritmo Jack Daniels VDOT e monte seu mesociclo periodizado de 4 semanas.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Objetivo Principal */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-emerald-400" />
            Objetivo Principal do Ciclo
          </label>
          <select
            value={primaryObjective}
            onChange={(e) => setPrimaryObjective(e.target.value)}
            disabled={isSubmitting}
            className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition"
          >
            {OBJECTIVE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Paces & Volume */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Timer className="w-4 h-4 text-emerald-400" />
              Ritmo Atual 5K (mm:ss/km) *
            </label>
            <input
              type="text"
              required
              placeholder="ex: 5:30"
              value={pace5k}
              onChange={(e) => setPace5k(e.target.value)}
              disabled={isSubmitting}
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono transition"
            />
            <span className="text-[10px] text-slate-400">Base para calcular VDOT e zonas E, T, I</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Timer className="w-4 h-4 text-teal-400" />
              Ritmo Atual 10K (opcional)
            </label>
            <input
              type="text"
              placeholder="ex: 5:45"
              value={pace10k}
              onChange={(e) => setPace10k(e.target.value)}
              disabled={isSubmitting}
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono transition"
            />
            <span className="text-[10px] text-slate-400">Afina o ritmo de limiar de lactato</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-cyan-400" />
              Volume Semanal Atual (km)
            </label>
            <input
              type="number"
              min="0"
              max="200"
              step="1"
              placeholder="ex: 20"
              value={weeklyVolumeKm}
              onChange={(e) => setWeeklyVolumeKm(e.target.value)}
              disabled={isSubmitting}
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono transition"
            />
            <span className="text-[10px] text-slate-400">Regra de progressão &le; 10%/semana</span>
          </div>
        </div>

        {/* Frequência Cardíaca (Karvonen) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Heart className="w-4 h-4 text-rose-400" />
              FC Máxima (bpm)
            </label>
            <input
              type="number"
              min="120"
              max="230"
              placeholder="ex: 185"
              value={maxHeartRate}
              onChange={(e) => setMaxHeartRate(e.target.value)}
              disabled={isSubmitting}
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono transition"
            />
            <span className="text-[10px] text-slate-400">Frequência cardíaca no esforço máximo</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Heart className="w-4 h-4 text-pink-400" />
              FC Repouso (bpm)
            </label>
            <input
              type="number"
              min="35"
              max="110"
              placeholder="ex: 55"
              value={restingHeartRate}
              onChange={(e) => setRestingHeartRate(e.target.value)}
              disabled={isSubmitting}
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono transition"
            />
            <span className="text-[10px] text-slate-400">Medida ao acordar em repouso absoluto</span>
          </div>
        </div>

        {/* Dias Disponíveis & Meta Semanal */}
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-emerald-400" />
                Dias da Semana Disponíveis para Correr *
              </label>
              <span className="text-emerald-400 font-mono text-[11px]">
                {availableDays.length} {availableDays.length === 1 ? 'dia selecionado' : 'dias selecionados'}
              </span>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {WEEKDAYS.map((day) => {
                const isSelected = availableDays.includes(day.id);
                return (
                  <button
                    key={day.id}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => toggleDay(day.id)}
                    className={`py-2 text-xs font-semibold rounded-xl border transition cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-sm shadow-emerald-950'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
            <span className="text-[10px] text-slate-400">
              A IA distribuirá rodagens leves e treinos-chave respeitando intervalos de recuperação.
            </span>
          </div>

          {/* Meta Semanal de Treinos de Corrida */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Footprints className="w-4 h-4 text-emerald-400" />
                Meta de Corridas por Semana *
              </label>
              <span className="text-emerald-400 font-mono text-[11px]">
                {weeklyRunsTarget} sessões / semana
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {RUNNING_TARGET_OPTIONS.map((count) => {
                const isCurrent = weeklyRunsTarget === count;
                return (
                  <button
                    key={count}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setWeeklyRunsTarget(count)}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition flex items-center justify-center gap-2 cursor-pointer ${
                      isCurrent
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 border-emerald-400 text-white shadow-md shadow-emerald-600/20'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <Footprints className="w-3.5 h-3.5" />
                    <span>{count} Corridas</span>
                  </button>
                );
              })}
            </div>

            {weeklyRunsTarget > availableDays.length && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs animate-fadeIn">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>
                  Meta de {weeklyRunsTarget} corridas excede os {availableDays.length} dias selecionados. A IA limitará o plano aos dias disponíveis.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Terreno e Histórico de Lesões */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-teal-400" />
              Terreno Principal
            </label>
            <select
              value={primaryTerrain}
              onChange={(e) => setPrimaryTerrain(e.target.value)}
              disabled={isSubmitting}
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition"
            >
              {TERRAIN_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Histórico de Lesões ou Desconfortos
            </label>
            <textarea
              rows={2}
              placeholder="ex: Canelite leve em 2024, desconforto no joelho direito em longões..."
              value={injuryHistory}
              onChange={(e) => setInjuryHistory(e.target.value)}
              disabled={isSubmitting}
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition resize-none"
            />
          </div>
        </div>

        {/* Loading Progress State */}
        {isSubmitting && (
          <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/30 text-emerald-300 text-xs space-y-2 animate-pulse">
            <div className="flex items-center gap-2 font-bold">
              <Sparkles className="w-4 h-4 animate-spin text-emerald-400" />
              <span>{loadingStep || 'Processando com Running Coach AI...'}</span>
            </div>
            <p className="text-[11px] text-emerald-400/80">
              Avaliando fadiga muscular concorrente, aplicando modelo de decaimento temporal e
              estruturando 4 semanas em modelo polarizado 80/20.
            </p>
          </div>
        )}

        {/* Submit Button */}
        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:via-teal-400 hover:to-cyan-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition disabled:opacity-50 cursor-pointer w-full sm:w-auto"
          >
            {isSubmitting ? (
              <>
                <Sparkles className="w-4 h-4 animate-spin" />
                <span>Construindo Periodização...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Salvar Perfil & Gerar Plano com IA</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
