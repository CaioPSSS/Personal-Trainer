'use client';

import React, { useState, useEffect } from 'react';
import {
  Brain,
  Sparkles,
  Zap,
  Target,
  FlaskConical,
  Calendar,
  Layers,
  ShieldCheck,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';

export interface MesocycleData {
  id: string;
  title: string;
  objective: string;
  split: string;
  durationWeeks: number;
  currentWeek?: number;
  isDeload?: boolean;
}

export interface CoachBrainData {
  hypotheses: string[];
  rationale: string[];
  nextCycleWatchouts?: string[];
}

export interface UpcomingRun {
  date: string;
  sessionType?: string;
  title: string;
}

export interface StrengthCoachHubProps {
  mesocycle?: MesocycleData | null;
  coachBrain?: CoachBrainData | null;
  upcomingRuns?: UpcomingRun[];
  onOpenStructure?: () => void;
  onPlanNextBlock?: () => void;
  onForceRegenerate?: () => void;
}

export default function StrengthCoachHub({
  mesocycle: initialMesocycle,
  coachBrain: initialCoachBrain,
  upcomingRuns: initialUpcomingRuns,
  onOpenStructure,
  onPlanNextBlock,
  onForceRegenerate,
}: StrengthCoachHubProps) {
  const [fetchedMesocycle, setFetchedMesocycle] = useState<MesocycleData | null>(null);
  const [fetchedCoachBrain, setFetchedCoachBrain] = useState<CoachBrainData | null>(null);
  const [fetchedRuns, setFetchedRuns] = useState<UpcomingRun[]>([]);
  const [loading, setLoading] = useState(!initialMesocycle);

  const mesocycle = initialMesocycle || fetchedMesocycle;
  const coachBrain = initialCoachBrain || fetchedCoachBrain;
  const upcomingRuns = initialUpcomingRuns && initialUpcomingRuns.length > 0 ? initialUpcomingRuns : fetchedRuns;

  const hasMesocycle = Boolean(initialMesocycle);
  const hasBrain = Boolean(initialCoachBrain);
  const hasRuns = (initialUpcomingRuns?.length ?? 0) > 0;

  // If props were not fully provided, fetch insights and calendar events
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        if (!hasMesocycle || !hasBrain) {
          const res = await fetch('/api/coach/insights');
          if (res.ok) {
            const data = await res.json();
            if (isMounted && data.active && data.mesocycle) {
              setFetchedMesocycle({
                id: data.mesocycle.id,
                title: data.mesocycle.title,
                objective: data.mesocycle.objective,
                split: data.mesocycle.split,
                durationWeeks: data.mesocycle.durationWeeks,
                currentWeek: 1,
                isDeload: false,
              });
              if (data.coachBrain) {
                setFetchedCoachBrain(data.coachBrain);
              }
            }
          }

          // Fetch current week number from today's workout
          const todayRes = await fetch('/api/workout/today');
          if (todayRes.ok) {
            const todayData = await todayRes.json();
            if (isMounted && todayData.active) {
              setFetchedMesocycle((prev) =>
                prev
                  ? {
                      ...prev,
                      currentWeek: todayData.currentWeekNumber || 1,
                      isDeload: todayData.isDeload || false,
                    }
                  : null
              );
            }
          }
        }

        // Fetch upcoming running events for radar
        if (!hasRuns) {
          const todayStr = new Date().toISOString().split('T')[0];
          const calRes = await fetch(`/api/calendar?startDate=${todayStr}`);
          if (calRes.ok) {
            const calData = await calRes.json();
            if (isMounted && Array.isArray(calData.events)) {
              interface CalEventJson {
                date: string;
                eventType: string;
                title: string;
              }
              const runs = calData.events
                .filter((ev: CalEventJson) => ev.eventType === 'running')
                .slice(0, 3)
                .map((ev: CalEventJson) => ({
                  date: ev.date,
                  sessionType: 'running',
                  title: ev.title,
                }));
              setFetchedRuns(runs);
            }
          }
        }
      } catch (err) {
        console.error('[StrengthCoachHub] Erro ao carregar dados do Master Coach:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [hasMesocycle, hasBrain, hasRuns]);

  if (loading) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 space-y-4 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 bg-slate-800 rounded-2xl" />
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-slate-800 rounded w-1/3" />
            <div className="h-6 bg-slate-800 rounded w-1/2" />
          </div>
        </div>
        <div className="h-24 bg-slate-800/50 rounded-2xl" />
      </div>
    );
  }

  if (!mesocycle) {
    return null;
  }

  const currentWeek = mesocycle.currentWeek || 1;
  const totalWeeks = mesocycle.durationWeeks || 4;
  const progressPercent = Math.min(100, Math.round((currentWeek / totalWeeks) * 100));

  // Determine synergy radar alert text
  const highImpactRun = upcomingRuns.find((r) => {
    const t = r.title.toLowerCase();
    return (
      t.includes('long') ||
      t.includes('longão') ||
      t.includes('tiro') ||
      t.includes('interval') ||
      t.includes('tempo')
    );
  });

  const synergyRadarText = highImpactRun
    ? `Próxima sessão chave de corrida detectada (${highImpactRun.title} em ${highImpactRun.date}). Seu treino de pernas está isolado para preservar 48h de regeneração neuromuscular sem interferência excêntrica.`
    : 'Sinergia multi-esportes ativa: volume de inferiores calibrado para permitir corrida contínua sem colapso de recuperação sistêmica.';

  const handleScrollToTemplates = () => {
    if (onOpenStructure) {
      onOpenStructure();
      return;
    }
    const target = document.getElementById('workout-select') || document.querySelector('form');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleNextBlock = () => {
    if (onPlanNextBlock) {
      onPlanNextBlock();
    } else if (onForceRegenerate) {
      onForceRegenerate();
    }
  };

  const hypothesesList = coachBrain?.hypotheses && coachBrain.hypotheses.length > 0
    ? coachBrain.hypotheses
    : [
        'Progressão dupla focada em faixas de 8-12 repetições em movimentos compostos.',
        'Isolamento excêntrico de membros inferiores preservado para suporte aos treinos de endurance.',
      ];

  const rationaleList = coachBrain?.rationale && coachBrain.rationale.length > 0
    ? coachBrain.rationale
    : [
        'Seleção de exercícios orientada por alto SFR (Stimulus-to-Fatigue Ratio) com menor estresse axial.',
        'Janela de descanso e RIR moderado (1 a 3) para máxima hipertrofia com segurança articular.',
      ];

  return (
    <div className="relative overflow-hidden rounded-3xl border border-indigo-500/25 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/40 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6">
      {/* Decorative Background Glows */}
      <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

      {/* 1. Master Coach Visual Identity Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-3.5">
          <div className="relative">
            <div className="p-3 bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 text-white rounded-2xl shadow-lg shadow-indigo-500/25 shrink-0">
              <Brain className="h-7 w-7" />
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-slate-950" />
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                Master Coach AI
              </span>
              <span className="text-slate-600">•</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                <Sparkles className="h-3 w-3" />
                Periodização Ativa
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-100 mt-0.5">
              Arquiteto do Mesociclo
            </h2>
            <p className="text-xs text-slate-400">
              Preservação de massa magra, biomecânica SFR e sincronização concorrente.
            </p>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={handleScrollToTemplates}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-semibold transition cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Ver Estrutura</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleNextBlock}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-purple-500/30 bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 text-xs font-semibold transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-purple-400" />
            <span>Planejar Próximo Bloco</span>
          </button>
        </div>
      </div>

      {/* 2. Active Mesocycle Status & Week Progress Bar */}
      <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
              Divisão: {mesocycle.split}
            </span>
            <h3 className="text-base sm:text-lg font-bold text-slate-100 mt-0.5">
              {mesocycle.title}
            </h3>
            <p className="text-xs text-indigo-300/90 mt-0.5">
              Objetivo: {mesocycle.objective}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {mesocycle.isDeload ? (
              <span className="text-xs font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-3 py-1 rounded-xl">
                ⚠️ Semana de Deload
              </span>
            ) : (
              <span className="text-xs font-mono font-bold text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 px-3 py-1 rounded-xl">
                Semana {currentWeek} de {totalWeeks}
              </span>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] font-medium text-slate-400 font-mono">
            <span>Início do Bloco</span>
            <span>{progressPercent}% concluído</span>
            <span>Finalização</span>
          </div>
          <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full transition-all duration-500 shadow-sm shadow-indigo-500/50"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* 3. Coach Brain Insights: Hypotheses & Rationale */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Hypotheses */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-300">
            <Target className="h-4 w-4 text-indigo-400" />
            <span>Hipóteses Ativas de Adaptação</span>
          </div>
          <ul className="space-y-2 text-xs text-slate-300">
            {hypothesesList.map((h, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-indigo-400 font-bold mt-0.5">•</span>
                <span className="leading-relaxed">{h}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Scientific Rationale */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-300">
            <FlaskConical className="h-4 w-4 text-purple-400" />
            <span>Racional Científico do Treinador</span>
          </div>
          <ul className="space-y-2 text-xs text-slate-300">
            {rationaleList.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-purple-400 font-bold mt-0.5">•</span>
                <span className="leading-relaxed">{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 4. Multi-Sport Synergy Radar */}
      <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950/30 via-slate-900/70 to-indigo-950/30 p-4.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-cyan-500/10 text-cyan-300 rounded-xl border border-cyan-500/20 shrink-0 mt-0.5">
            <Zap className="h-4 w-4" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-bold text-cyan-300 uppercase tracking-wider text-[11px]">
                Radar Multi-Esportes & Concorrência
              </span>
              <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
            </div>
            <p className="text-slate-300 leading-relaxed">{synergyRadarText}</p>
          </div>
        </div>

        {upcomingRuns.length > 0 && (
          <div className="shrink-0 flex items-center gap-1.5 text-[11px] font-mono text-cyan-300/80 bg-slate-950/60 px-3 py-1.5 rounded-xl border border-cyan-500/20">
            <Calendar className="h-3 w-3 text-cyan-400" />
            <span>{upcomingRuns.length} corrida(s) prevista(s)</span>
          </div>
        )}
      </div>
    </div>
  );
}
