'use client';

import { FormEvent, useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Dumbbell, Sparkles, Sliders, Trophy, Flame, Layers, TrendingUp, BarChart3 } from 'lucide-react';
import OnboardingForm, { AthleteProfileFormState } from './OnboardingForm';
import CoachInsights from './CoachInsights';
import StrengthCoachHub from './StrengthCoachHub';
import HypertrophyDailyTracker from './HypertrophyDailyTracker';
import ExerciseHistoryModal from './ExerciseHistoryModal';
import CycleRenewalPrompt from './CycleRenewalPrompt';
import { ErrorBoundary } from './ErrorBoundary';
import StrengthProgressChart from './charts/StrengthProgressChart';
import { AthleteProfile as PrismaAthleteProfile, MesocyclePlan } from '@prisma/client';
import type {
  MuscleGroupVolumeItem,
  PersonalRecordItem,
  MesocycleComparisonResult,
} from '@/lib/analytics/hypertrophy-analytics';

type AthleteProfile = PrismaAthleteProfile & {
  mesocycles?: MesocyclePlan[];
};

interface StrengthHubClientProps {
  initialAthleteProfile: AthleteProfile | null;
}

export default function StrengthHubClient({ initialAthleteProfile }: StrengthHubClientProps) {
  const router = useRouter();
  const [overrideProfile, setOverrideProfile] = useState<AthleteProfile | null>(null);
  const athleteProfile =
    initialAthleteProfile && (initialAthleteProfile.mesocycles?.length ?? 0) > 0
      ? initialAthleteProfile
      : (overrideProfile ?? initialAthleteProfile);
  const hasActiveMesocycle = (athleteProfile?.mesocycles?.length ?? 0) > 0;
  const activeMesocycle = athleteProfile?.mesocycles?.[0] || null;

  const coachHubMesocycle = useMemo(() => {
    if (!activeMesocycle) return undefined;
    return {
      id: activeMesocycle.id,
      title: activeMesocycle.title,
      objective: activeMesocycle.objective,
      split: activeMesocycle.split,
      durationWeeks: activeMesocycle.durationWeeks,
    };
  }, [activeMesocycle]);

  const [setupForm, setSetupForm] = useState<AthleteProfileFormState>({
    displayName: initialAthleteProfile?.displayName || '',
    trainingAgeYears: initialAthleteProfile?.trainingAgeYears?.toString() || '',
    sessionDurationMin: initialAthleteProfile?.sessionDurationMin?.toString() || '60',
    athleteContext: (initialAthleteProfile?.athleteContext as string) || '',
    availableEquipment: Array.isArray(initialAthleteProfile?.availableEquipment)
      ? (initialAthleteProfile.availableEquipment as string[])
      : ['barbell', 'dumbbells', 'cables'],
    movementRestrictions: (initialAthleteProfile?.movementRestrictions as string) || '',
    bodyWeightKg: initialAthleteProfile?.bodyWeightKg ? String(initialAthleteProfile.bodyWeightKg) : '',
    heightCm: initialAthleteProfile?.heightCm ? String(initialAthleteProfile.heightCm) : '',
  });

  const [clientMessage, setClientMessage] = useState({ type: '', text: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [coachRunState, setCoachRunState] = useState<'idle' | 'running' | 'validated' | 'failed'>('idle');
  const [coachRunMessage, setCoachRunMessage] = useState('');
  const [cooldownTimeLeft, setCooldownTimeLeft] = useState(0);
  const [analyticsRefreshKey, setAnalyticsRefreshKey] = useState(0);
  const [selectedHistoryExercise, setSelectedHistoryExercise] = useState<string | null>(null);
  const [strengthAnalytics, setStrengthAnalytics] = useState<{
    muscleVolume?: MuscleGroupVolumeItem[];
    personalRecords?: PersonalRecordItem[];
    mesocycleComparison?: MesocycleComparisonResult | null;
  } | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/analytics')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && json) {
          setStrengthAnalytics({
            muscleVolume: json.muscleVolume,
            personalRecords: json.personalRecords,
            mesocycleComparison: json.mesocycleComparison,
          });
        }
      })
      .catch((err) => console.error('[StrengthHubClient] Analytics error:', err));
    return () => {
      active = false;
    };
  }, [analyticsRefreshKey, coachRunState]);

  useEffect(() => {
    if (cooldownTimeLeft <= 0) return;
    const interval = setInterval(() => {
      setCooldownTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownTimeLeft]);

  const handleSetupSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setClientMessage({ type: '', text: '' });
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setupForm),
      });

      if (!response.ok) {
        throw new Error('Falha ao configurar perfil.');
      }

      const data = await response.json();
      const savedProfile = data?.profile ?? data;
      setOverrideProfile({
        ...savedProfile,
        mesocycles: savedProfile?.mesocycles ?? initialAthleteProfile?.mesocycles ?? [],
      });
      setClientMessage({ type: 'success', text: 'Perfil configurado com sucesso!' });
      router.refresh();
    } catch (err) {
      console.error(err);
      setClientMessage({ type: 'error', text: 'Não foi possível configurar seu perfil.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForceGeneration = async () => {
    if (coachRunState === 'running' || cooldownTimeLeft > 0) {
      return;
    }

    setCoachRunState('running');
    setCoachRunMessage('Gerando novo mesociclo com validação de contrato...');

    try {
      const response = await fetch('/api/coach/master/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Falha ao gerar plano de treino.');
      }

      const data = await response.json();
      const startLabel =
        typeof data.startDate === 'string' && data.startDate.includes('-')
          ? data.startDate.split('-').reverse().slice(0, 2).join('/')
          : null;
      const startHint = startLabel
        ? data.rolledToNextWeek
          ? ` — início programado para segunda-feira (${startLabel}) preservando a Semana 1 completa`
          : ` — início em ${startLabel}`
        : '';
      setCoachRunState('validated');
      setCoachRunMessage(`Novo bloco gerado com sucesso${startHint} (tentativas: ${data.attempts ?? 1}).`);
      setCooldownTimeLeft(30);
      window.dispatchEvent(new CustomEvent('calendar-refresh'));
      setTimeout(() => {
        router.refresh();
      }, 1550);
    } catch (error) {
      console.error('Falha ao forçar geração do mesociclo.', error);
      setCoachRunState('failed');
      setCoachRunMessage('A IA falhou na geração. Use ajuste manual do treino e tente novamente.');
      setCooldownTimeLeft(30);
    }
  };

  const handleManualAdjust = () => {
    setCoachRunMessage('Modo manual ativado: ajuste os dados do treino diretamente no formulário abaixo.');
    setClientMessage({ type: 'info', text: 'Override manual ativo. Faça os ajustes e salve normalmente.' });
  };

  if (!athleteProfile) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        {clientMessage.text && (
          <div
            className={`w-full max-w-xl p-4 mb-4 rounded-xl border text-sm ${
              clientMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
            }`}
          >
            {clientMessage.text}
          </div>
        )}
        <OnboardingForm
          setupForm={setupForm}
          setSetupForm={setSetupForm}
          onSubmit={handleSetupSubmit}
          isSubmitting={isSubmitting}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Hypertrophy Header */}
      <div className="glass-card p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              Módulo de Força & Hipertrofia
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-xs text-slate-400">SmartFit SFR & Biomecânica</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 mt-1">
            Treino de Hipertrofia
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Periodização orientada por RIR, seleção de exercícios de alto SFR e controle de sobrecarga progressiva.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleManualAdjust}
            className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20 cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Ajuste Manual</span>
          </button>
          <button
            type="button"
            onClick={handleForceGeneration}
            disabled={coachRunState === 'running' || cooldownTimeLeft > 0}
            className="flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-600/20 hover:bg-indigo-600/30 px-3 py-2 text-xs font-semibold text-indigo-200 transition disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>
              {coachRunState === 'running'
                ? 'Gerando...'
                : cooldownTimeLeft > 0
                  ? `Aguarde ${cooldownTimeLeft}s`
                  : 'Forçar Nova Geração'}
            </span>
          </button>
        </div>
      </div>

      {coachRunMessage ? (
        <section
          className={`rounded-xl border p-3.5 text-xs sm:text-sm ${
            coachRunState === 'failed'
              ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
              : coachRunState === 'validated'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-slate-700 bg-slate-900/50 text-slate-300'
          }`}
        >
          {coachRunMessage}
        </section>
      ) : null}

      {/* Automatic Cycle Renewal Suggestion for Strength */}
      <CycleRenewalPrompt
        scope="strength"
        onRenewed={() => {
          setAnalyticsRefreshKey((k) => k + 1);
          router.refresh();
        }}
      />

      {/* 🧠 Master Coach AI Command Center */}
      {hasActiveMesocycle && (
        <ErrorBoundary
          fallback={
            <div className="glass-card p-6 text-rose-300 text-sm">
              ⚠️ Erro ao carregar Master Coach Hub.
            </div>
          }
        >
          <StrengthCoachHub
            mesocycle={coachHubMesocycle}
            onOpenStructure={() => {
              const el = document.getElementById('workout-select') || document.querySelector('form');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            onPlanNextBlock={handleForceGeneration}
            onForceRegenerate={handleForceGeneration}
          />
        </ErrorBoundary>
      )}

      {/* 🧠 Coach Insights Panel */}
      {hasActiveMesocycle && (
        <ErrorBoundary
          fallback={
            <div className="glass-card p-6 text-rose-300 text-sm">
              ⚠️ Erro ao carregar insights do treinador.
            </div>
          }
        >
          <CoachInsights key={coachRunState} />
        </ErrorBoundary>
      )}

      {/* 🏋️ Daily Hypertrophy Workout Tracker */}
      {hasActiveMesocycle ? (
        <section className="glass-card p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-100 mb-4 flex items-center gap-2">
            <Dumbbell className="h-5 w-5 text-indigo-400" />
            <span>Ficha de Treino & Registro Diário</span>
          </h2>
          <ErrorBoundary
            fallback={
              <div className="glass-card p-6 text-rose-300 text-sm">
                ⚠️ Erro crítico ao carregar a ficha de treino.
              </div>
            }
          >
            <HypertrophyDailyTracker
              onSaved={() => {
                setAnalyticsRefreshKey((k) => k + 1);
                window.dispatchEvent(new CustomEvent('calendar-refresh'));
                router.refresh();
              }}
            />
          </ErrorBoundary>
        </section>
      ) : (
        <section className="glass-card p-8 text-center space-y-6 max-w-2xl mx-auto shadow-xl">
          <div className="mx-auto w-16 h-16 bg-indigo-500/10 text-indigo-400 rounded-2xl border border-indigo-500/20 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-indigo-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-100">Criar Seu Novo Mesociclo de Hipertrofia</h2>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Você ainda não tem um bloco de treino ativo. O Master Coach IA e o Data Analyst IA analisarão seu perfil de atleta e histórico para planejar uma periodização estratégica de 4 a 6 semanas.
            </p>
          </div>
          <button
            type="button"
            onClick={handleForceGeneration}
            disabled={coachRunState === 'running' || cooldownTimeLeft > 0}
            className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-slate-100 font-bold px-8 py-4 rounded-xl transition duration-200 shadow-lg shadow-indigo-500/20 disabled:opacity-65 disabled:cursor-not-allowed cursor-pointer text-sm"
          >
            {coachRunState === 'running' ? (
              <>
                <span className="h-4 w-4 border-2 border-slate-200 border-t-transparent rounded-full animate-spin" />
                <span>Analisando Histórico & Projetando Bloco...</span>
              </>
            ) : cooldownTimeLeft > 0 ? (
              <span>Aguarde {cooldownTimeLeft}s para tentar novamente</span>
            ) : (
              <>
                <Dumbbell className="h-4 w-4" />
                <span>Gerar Meu Novo Bloco de Treino</span>
              </>
            )}
          </button>
        </section>
      )}

      {/* #3 Weekly Muscle Volume Landmarks (MEV / MAV / MRV + CrossFit Overlap) */}
      {strengthAnalytics?.muscleVolume && strengthAnalytics.muscleVolume.length > 0 && (
        <section className="glass-card p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100">
                  Volume Semanal por Grupamento Muscular (MEV / MAV / MRV)
                </h2>
                <p className="text-xs text-slate-400">
                  Séries válidas diretas da semana atual + sinalizador de demanda concorrente de CrossFit
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-400 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">Abaixo MEV</span>
              <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">MEV–MAV</span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">Zona Ótima (MAV)</span>
              <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30">&gt; MRV</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {strengthAnalytics.muscleVolume.map((item) => {
              const displaySets = item.effectiveSets ?? item.directSets;
              const secondarySets = item.secondarySets ?? 0;
              const pct = Math.min(100, Math.round((displaySets / item.mrv) * 100));
              const barColor =
                item.status === 'exceeding_mrv'
                  ? 'bg-rose-500'
                  : item.status === 'optimal_mav'
                    ? 'bg-emerald-500'
                    : item.status === 'approaching_mrv'
                      ? 'bg-amber-500'
                      : 'bg-slate-600';

              return (
                <div
                  key={item.key}
                  className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-slate-100">{item.muscleGroup}</span>
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      {item.hasCrossFitOverlap && (
                        <span
                          title={`Solicitado em ${item.crossFitSessionsCount} WOD(s) de CrossFit nesta semana`}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-300"
                        >
                          <Flame className="w-2.5 h-2.5 text-amber-400" />
                          +{item.crossFitSessionsCount} WOD
                        </span>
                      )}
                      <span
                        className="text-xs font-mono font-bold text-indigo-300"
                        title={
                          secondarySets > 0
                            ? `${item.directSets} diretas + ${secondarySets} secundárias (×0,5)`
                            : `${item.directSets} séries diretas`
                        }
                      >
                        {displaySets} séries
                        {secondarySets > 0 && (
                          <span className="text-[10px] text-slate-400 font-normal ml-1">
                            (+{secondarySets} sec)
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className={`h-full ${barColor} transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span>MEV: {item.mev}</span>
                    <span>MAV: {item.mavMin}–{item.mavMax}</span>
                    <span>MRV: {item.mrv}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* #4 Personal Records Hall of Fame & Live e1RM */}
      {strengthAnalytics?.personalRecords && strengthAnalytics.personalRecords.length > 0 && (
        <section className="glass-card p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Trophy className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100">
                  Quadro de Recordes Pessoais & 1RM Estimado
                </h2>
                <p className="text-xs text-slate-400">
                  Clique em qualquer exercício para abrir o histórico completo e curva de sobrecarga
                </p>
              </div>
            </div>
            <span className="text-xs font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
              Fórmula Epley Ajustada por RIR
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {strengthAnalytics.personalRecords.slice(0, 9).map((pr) => (
              <button
                key={pr.exerciseName}
                type="button"
                onClick={() => setSelectedHistoryExercise(pr.exerciseName)}
                className="text-left p-3.5 rounded-xl bg-slate-900/70 hover:bg-slate-800/80 border border-slate-800 hover:border-indigo-500/40 transition space-y-2 cursor-pointer group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-slate-100 group-hover:text-indigo-300 transition block">
                      {pr.exerciseName}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {pr.totalSessionsCount} sessões • {pr.achievedDate}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-mono text-xs font-black shrink-0">
                    e1RM {pr.bestEstimated1RM}kg
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800/70 text-slate-300 font-mono">
                  <span>
                    Melhor Série: <strong>{pr.best1RMSetLabel}</strong>
                  </span>
                  <span className="text-emerald-400">
                    Carga Máx: {pr.maxLoadKg}kg
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* #24 Mesocycle Comparison (Cycle-over-Cycle Diff) */}
      {strengthAnalytics?.mesocycleComparison?.hasPreviousMesocycle && (
        <section className="glass-card p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100">
                  Comparador de Mesociclos (Bloco Atual vs. Bloco Anterior)
                </h2>
                <p className="text-xs text-slate-400">
                  {strengthAnalytics.mesocycleComparison.activeTitle} vs.{' '}
                  {strengthAnalytics.mesocycleComparison.previousTitle}
                </p>
              </div>
            </div>
            {strengthAnalytics.mesocycleComparison.tonnageDeltaPercent !== null && (
              <span
                className={`text-xs font-mono font-bold px-2.5 py-1 rounded-full border ${
                  strengthAnalytics.mesocycleComparison.tonnageDeltaPercent >= 0
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                }`}
              >
                Densidade de Tonelagem:{' '}
                {strengthAnalytics.mesocycleComparison.tonnageDeltaPercent >= 0
                  ? `+${strengthAnalytics.mesocycleComparison.tonnageDeltaPercent}%`
                  : `${strengthAnalytics.mesocycleComparison.tonnageDeltaPercent}%`}{' '}
                / sessão
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Tonelagem Média / Sessão
              </span>
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-lg font-black text-slate-100">
                  {strengthAnalytics.mesocycleComparison.activeAvgTonnageKg} kg
                </span>
                <span className="text-xs text-slate-400">
                  Ant: {strengthAnalytics.mesocycleComparison.previousAvgTonnageKg} kg
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Séries Válidas / Sessão
              </span>
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-lg font-black text-indigo-300">
                  {strengthAnalytics.mesocycleComparison.activeAvgSetsPerSession} séries
                </span>
                <span className="text-xs text-slate-400">
                  Ant: {strengthAnalytics.mesocycleComparison.previousAvgSetsPerSession}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                RPE Médio Operacional
              </span>
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-lg font-black text-emerald-300">
                  RPE {strengthAnalytics.mesocycleComparison.activeAvgRpe ?? '--'}
                </span>
                <span className="text-xs text-slate-400">
                  Ant: RPE {strengthAnalytics.mesocycleComparison.previousAvgRpe ?? '--'}
                </span>
              </div>
            </div>
          </div>

          {strengthAnalytics.mesocycleComparison.topExerciseGains.length > 0 && (
            <div className="space-y-2 pt-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>Maiores Progressões de Carga Entre os Blocos</span>
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {strengthAnalytics.mesocycleComparison.topExerciseGains.map((item) => (
                  <div
                    key={item.exerciseName}
                    className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <span className="font-semibold text-slate-200 truncate pr-2">
                      {item.exerciseName}
                    </span>
                    <span
                      className={`font-mono font-bold shrink-0 ${
                        item.deltaKg >= 0 ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {item.previousMaxLoadKg}kg → {item.activeMaxLoadKg}kg (
                      {item.deltaKg >= 0 ? `+${item.deltaKg}kg` : `${item.deltaKg}kg`})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 📊 Strength Progression Analytics Chart */}
      <StrengthProgressChart />

      {/* #31 Exercise History Modal */}
      <ExerciseHistoryModal
        exerciseName={selectedHistoryExercise}
        onClose={() => setSelectedHistoryExercise(null)}
      />
    </div>
  );
}
