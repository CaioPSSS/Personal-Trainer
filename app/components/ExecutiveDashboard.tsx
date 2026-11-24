'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Dumbbell,
  Footprints,
  ArrowRight,
  Plus,
  Brain,
  Zap,
  ShieldCheck,
  Calendar as CalendarIcon,
  Activity,
  Check,
  Copy,
  Loader2,
  X,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import NextWorkoutCard from './NextWorkoutCard';
import StreakCounter from './StreakCounter';
import WeeklyVolumeBar from './WeeklyVolumeBar';
import WeeklyCalendar from './WeeklyCalendar';
import MonthlyCalendar from './MonthlyCalendar';
import CrossTrainingModal from './CrossTrainingModal';
import AdherenceChart from './charts/AdherenceChart';
import OnboardingForm, { AthleteProfileFormState } from './OnboardingForm';
import { AthleteProfile, MesocyclePlan } from '@prisma/client';
import { useRouter } from 'next/navigation';
import type { DailyReadinessResult, WeeklyReviewSummary } from '@/lib/analytics/readiness-score';
import type { MultiSportRadarResult } from '@/lib/scheduling/multi-sport-radar';

type ProfileWithMesocycles = AthleteProfile & {
  mesocycles?: MesocyclePlan[];
};

interface ExecutiveDashboardProps {
  athleteProfile: ProfileWithMesocycles | null;
  initialCurrentWeek?: number;
  currentDateFormatted?: string;
  calendarFeedToken?: string | null;
}

export default function ExecutiveDashboard({
  athleteProfile,
  initialCurrentWeek = 1,
  currentDateFormatted,
  calendarFeedToken,
}: ExecutiveDashboardProps) {
  const router = useRouter();
  const [isMonthlyOpen, setIsMonthlyOpen] = useState(false);
  const [isCrossModalOpen, setIsCrossModalOpen] = useState(false);
  const [isIcsModalOpen, setIsIcsModalOpen] = useState(false);
  const [copiedIcs, setCopiedIcs] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [calendarKey, setCalendarKey] = useState(0);
  const [aiReviewText, setAiReviewText] = useState<string | null>(null);
  const [aiReviewFallback, setAiReviewFallback] = useState(false);
  const [isLoadingAiReview, setIsLoadingAiReview] = useState(false);
  const [isRebalancing, setIsRebalancing] = useState(false);
  const [analytics, setAnalytics] = useState<{
    streak?: number;
    recordStreak?: number;
    weeklyVolume?: {
      strength?: { completedSets: number; targetSets: number };
      running?: { completedKm: number; targetKm: number };
      crossTraining?: { completedSessions: number; targetSessions: number };
    };
    adherenceData?: Array<{
      weekLabel: string;
      completedCount: number;
      plannedCount: number;
      skippedCount: number;
      percentage: number;
    }>;
    readiness?: DailyReadinessResult;
    weeklyReview?: WeeklyReviewSummary;
    multiSportRadar?: MultiSportRadarResult;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadAnalytics() {
      try {
        const res = await fetch('/api/analytics');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setAnalytics(data);
        }
      } catch (err) {
        console.error('[ExecutiveDashboard] Erro ao carregar analytics:', err);
      }
    }
    loadAnalytics();
    return () => {
      isMounted = false;
    };
  }, [calendarKey]);

  const [setupForm, setSetupForm] = useState<AthleteProfileFormState>({
    displayName: athleteProfile?.displayName || '',
    trainingAgeYears: athleteProfile?.trainingAgeYears?.toString() || '',
    sessionDurationMin: athleteProfile?.sessionDurationMin?.toString() || '60',
    athleteContext: (athleteProfile?.athleteContext as string) || '',
    availableEquipment: Array.isArray(athleteProfile?.availableEquipment)
      ? (athleteProfile.availableEquipment as string[])
      : ['barbell', 'dumbbells', 'cables'],
    movementRestrictions: (athleteProfile?.movementRestrictions as string) || '',
    bodyWeightKg: athleteProfile?.bodyWeightKg ? String(athleteProfile.bodyWeightKg) : '',
    heightCm: athleteProfile?.heightCm ? String(athleteProfile.heightCm) : '',
  });

  const handleSetupSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setupForm),
      });
      if (response.ok) {
        router.refresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // If no athlete profile exists, show onboarding form
  if (!athleteProfile) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <OnboardingForm
          setupForm={setupForm}
          setSetupForm={setSetupForm}
          onSubmit={handleSetupSubmit}
          isSubmitting={isSubmitting}
        />
      </div>
    );
  }

  const hasActiveMesocycle = (athleteProfile.mesocycles?.length ?? 0) > 0;
  const activeMesocycle = athleteProfile.mesocycles?.[0] || null;
  const firstName = athleteProfile.displayName?.split(' ')[0] || 'Atleta';

  const currentWeek = initialCurrentWeek;
  const totalWeeks = activeMesocycle?.durationWeeks || 4;
  const progressPercent = Math.min(100, Math.round((currentWeek / totalWeeks) * 100));

  const handleRefreshCalendar = () => {
    setCalendarKey((prev) => prev + 1);
  };

  const handleRebalanceWeek = async () => {
    if (isRebalancing) return;
    setIsRebalancing(true);
    try {
      const res = await fetch('/api/schedule/rebalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        handleRefreshCalendar();
        window.dispatchEvent(new CustomEvent('calendar-refresh'));
      }
    } catch (err) {
      console.error('[ExecutiveDashboard] Erro ao rebalancear semana:', err);
    } finally {
      setIsRebalancing(false);
    }
  };

  const handleGenerateWeeklyAiReview = async () => {
    if (!analytics?.weeklyReview || isLoadingAiReview) return;
    setIsLoadingAiReview(true);
    setAiReviewFallback(false);
    try {
      const res = await fetch('/api/coach/weekly-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weeklyReview: analytics.weeklyReview,
          readiness: analytics.readiness,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiReviewFallback(Boolean(data.usedFallback || data.source === 'fallback'));
        if (data.commentary) {
          setAiReviewText(
            `${data.commentary.headline}\n\n${data.commentary.coachAnalysis}\n\n🎯 Ajuste Tático: ${data.commentary.tacticalAdjustment}`
          );
        } else {
          setAiReviewText(data.reviewText || null);
        }
      }
    } catch (err) {
      console.error('[ExecutiveDashboard] Erro ao gerar review IA:', err);
    } finally {
      setIsLoadingAiReview(false);
    }
  };

  const icsPath = calendarFeedToken
    ? `/api/calendar/ics?token=${encodeURIComponent(calendarFeedToken)}`
    : '/api/calendar/ics';
  const icsUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${icsPath}`
      : icsPath;
  const webcalUrl = icsUrl.replace(/^https?:\/\//i, 'webcal://');

  const handleCopyIcsUrl = async () => {
    try {
      await navigator.clipboard.writeText(icsUrl);
      setCopiedIcs(true);
      setTimeout(() => setCopiedIcs(false), 2500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Executive Greeting Header */}
      <div className="glass-card p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              Painel Geral
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-xs text-slate-400">
              {currentDateFormatted || 'Hoje'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-100 via-indigo-200 to-emerald-300 mt-1">
            Olá, {firstName}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Seu centro de comando multi-esportes: hipertrofia, corrida e constância integrada.
          </p>
        </div>

        {/* Quick Nav Shortcut Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/strength"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 text-xs font-semibold transition"
          >
            <Dumbbell className="w-3.5 h-3.5" />
            <span>Musculação</span>
          </Link>
          <Link
            href="/running"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-xs font-semibold transition"
          >
            <Footprints className="w-3.5 h-3.5" />
            <span>Corrida</span>
          </Link>
          <button
            type="button"
            onClick={() => setIsCrossModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-xs font-semibold transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>+ Registrar Atividade</span>
          </button>
          <button
            type="button"
            onClick={() => setIsIcsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 text-xs font-semibold transition cursor-pointer"
          >
            <CalendarIcon className="w-3.5 h-3.5 text-cyan-400" />
            <span>📅 Sincronizar Agenda (.ics)</span>
          </button>
        </div>
      </div>

      {/* #16 Daily Multi-Sport Readiness Score (0-100%) */}
      {analytics?.readiness && (
        <div
          className={`rounded-2xl border p-5 shadow-lg transition-all ${
            analytics.readiness.status === 'green'
              ? 'border-emerald-500/30 bg-gradient-to-r from-emerald-950/30 via-slate-900 to-slate-900'
              : analytics.readiness.status === 'yellow'
                ? 'border-amber-500/30 bg-gradient-to-r from-amber-950/30 via-slate-900 to-slate-900'
                : 'border-rose-500/35 bg-gradient-to-r from-rose-950/35 via-slate-900 to-slate-900'
          }`}
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-4">
              <div
                className={`w-16 h-16 rounded-2xl border flex flex-col items-center justify-center shrink-0 font-mono ${
                  analytics.readiness.status === 'green'
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                    : analytics.readiness.status === 'yellow'
                      ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                      : 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                }`}
              >
                <span className="text-xl font-black leading-none">{analytics.readiness.score}%</span>
                <span className="text-[9px] uppercase tracking-wider font-bold mt-0.5">Prontidão</span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Score Diário de Prontidão Multi-Esporte</span>
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                      analytics.readiness.status === 'green'
                        ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                        : analytics.readiness.status === 'yellow'
                          ? 'border-amber-500/30 bg-amber-500/15 text-amber-300'
                          : 'border-rose-500/30 bg-rose-500/15 text-rose-300'
                    }`}
                  >
                    {analytics.readiness.label}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-200 font-medium leading-relaxed">
                  {analytics.readiness.recommendation}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
              <div className="px-2.5 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] flex items-center gap-1.5">
                <span className="font-mono font-bold text-emerald-400">
                  +{analytics.readiness.breakdown.sleepScore}
                </span>
                <span className="text-slate-300 font-semibold">Sono</span>
              </div>
              <div className="px-2.5 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] flex items-center gap-1.5">
                <span className="font-mono font-bold text-indigo-400">
                  +{analytics.readiness.breakdown.recoveryWellnessScore}
                </span>
                <span className="text-slate-300 font-semibold">Recuperação</span>
              </div>
              <div className="px-2.5 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] flex items-center gap-1.5">
                <span className="font-mono font-bold text-amber-400">
                  -{analytics.readiness.breakdown.acuteLoadPenalty}
                </span>
                <span className="text-slate-300 font-semibold">
                  Carga 3d ({analytics.readiness.acuteSessionsLast3Days} sessões)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mesocycle Status Notification if none active */}
      {!hasActiveMesocycle && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-200">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <strong className="font-bold text-amber-100 block sm:inline">Nenhum bloco de treino ativo.</strong>{' '}
              Gere seu primeiro mesociclo com a IA do Master Coach para popular a periodização completa.
            </div>
          </div>
          <Link
            href="/strength"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 transition shrink-0"
          >
            <span>Configurar Bloco</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* 🧠 Master Coach Highlight Card */}
      {hasActiveMesocycle && activeMesocycle && (
        <div className="relative overflow-hidden rounded-2xl border border-indigo-500/25 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/40 p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 text-white rounded-2xl shadow-lg shadow-indigo-500/25 shrink-0">
                <Brain className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">
                    Master Coach AI
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    <Sparkles className="h-2.5 w-2.5" />
                    Periodização Ativa
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-100 mt-0.5">
                  {activeMesocycle.title}
                </h2>
                <p className="text-xs text-slate-400">
                  Divisão: {activeMesocycle.split} • Objetivo: {activeMesocycle.objective}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right hidden sm:block">
                <span className="text-xs font-mono font-bold text-indigo-300 block">
                  Semana {currentWeek} de {totalWeeks}
                </span>
                <span className="text-[10px] text-slate-500">{progressPercent}% do bloco</span>
              </div>
              <Link
                href="/strength"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-slate-100 font-bold text-xs transition shadow-md shadow-indigo-500/10 cursor-pointer"
              >
                <span>Acessar Módulo Força</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Week Progress Bar */}
          <div className="space-y-1">
            <div className="flex sm:hidden justify-between text-[11px] font-mono text-slate-400">
              <span>Semana {currentWeek} de {totalWeeks}</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Dynamic Multi-Sport Radar Banner */}
          {(() => {
            const radar = analytics?.multiSportRadar;
            const status = radar?.status ?? 'synergy';
            const borderClass =
              status === 'conflict'
                ? 'border-rose-500/35 bg-rose-950/25'
                : status === 'warning'
                  ? 'border-amber-500/35 bg-amber-950/25'
                  : 'border-cyan-500/25 bg-cyan-950/20';
            const titleColor =
              status === 'conflict'
                ? 'text-rose-300'
                : status === 'warning'
                  ? 'text-amber-300'
                  : 'text-cyan-300';
            return (
              <div className={`rounded-xl border px-3.5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${borderClass}`}>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {status === 'synergy' ? (
                      <Zap className="h-4 w-4 text-cyan-400 shrink-0" />
                    ) : (
                      <AlertTriangle className={`h-4 w-4 shrink-0 ${status === 'conflict' ? 'text-rose-400' : 'text-amber-400'}`} />
                    )}
                    <p className="text-slate-200 leading-snug">
                      <strong className={`${titleColor} font-semibold`}>
                        {radar?.headline || 'Radar Multi-Esportes:'}
                      </strong>{' '}
                      {radar?.summary || 'Sincronização entre força, corrida e CrossFit monitorada na semana atual.'}
                    </p>
                  </div>
                  {radar?.conflicts && radar.conflicts.length > 0 && (
                    <ul className="pl-6 space-y-0.5 text-[11px] text-slate-300 list-disc">
                      {radar.conflicts.slice(0, 3).map((c, idx) => (
                        <li key={idx}>{c.description}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {status !== 'synergy' ? (
                    <button
                      type="button"
                      onClick={handleRebalanceWeek}
                      disabled={isRebalancing}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-400/40 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 font-semibold transition cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isRebalancing ? 'animate-spin' : ''}`} />
                      <span>{isRebalancing ? 'Rebalanceando...' : 'Rebalancear Semana'}</span>
                    </button>
                  ) : (
                    <ShieldCheck className="h-4 w-4 text-cyan-400 shrink-0 hidden md:block" />
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Top Widgets: Next Workout & Streak */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <NextWorkoutCard onRefresh={handleRefreshCalendar} />
        </div>
        <div>
          <StreakCounter
            currentStreak={analytics?.streak}
            recordStreak={analytics?.recordStreak}
          />
        </div>
      </div>

      {/* Weekly Volume Adherence Bar */}
      <WeeklyVolumeBar
        strength={
          analytics?.weeklyVolume?.strength
            ? {
                current: analytics.weeklyVolume.strength.completedSets,
                target: analytics.weeklyVolume.strength.targetSets,
                unit: 'séries',
              }
            : undefined
        }
        running={
          analytics?.weeklyVolume?.running
            ? {
                current: analytics.weeklyVolume.running.completedKm,
                target: analytics.weeklyVolume.running.targetKm,
                unit: 'km',
              }
            : undefined
        }
        crossTraining={
          analytics?.weeklyVolume?.crossTraining
            ? {
                current: analytics.weeklyVolume.crossTraining.completedSessions,
                target: analytics.weeklyVolume.crossTraining.targetSessions,
                unit: 'sessões',
              }
            : undefined
        }
      />

      {/* Monthly Calendar View (Toggled) */}
      {isMonthlyOpen && (
        <MonthlyCalendar onClose={() => setIsMonthlyOpen(false)} />
      )}

      {/* Primary Interactive Weekly Calendar */}
      <WeeklyCalendar
        key={calendarKey}
        onToggleMonthly={() => setIsMonthlyOpen((prev) => !prev)}
        isMonthlyOpen={isMonthlyOpen}
      />

      {/* 📊 Training Adherence Consistency Analytics */}
      <AdherenceChart data={analytics?.adherenceData} />

      {/* #23 Weekly Review Card (Hybrid: Instant Comparative + On-Demand AI Review) */}
      {analytics?.weeklyReview && (
        <div className="glass-card p-6 border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100">
                  Check-in & Balanço Semanal ({analytics.weeklyReview.currentWeekLabel})
                </h2>
                <p className="text-xs text-slate-400">
                  Comparativo multi-esporte: Semana Atual vs. Anterior ({analytics.weeklyReview.previousWeekLabel})
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={isLoadingAiReview}
              onClick={handleGenerateWeeklyAiReview}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-indigo-500/35 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-200 text-xs font-bold transition disabled:opacity-50 cursor-pointer self-start sm:self-auto"
            >
              {isLoadingAiReview ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  <span>Gerando Análise IA...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>✨ Gerar Análise IA da Semana</span>
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Adesão Semanal
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-black text-emerald-400 font-mono">
                  {analytics.weeklyReview.adherencePercent.current}%
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  Ant: {analytics.weeklyReview.adherencePercent.previous}%
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Tonelagem Força
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-black text-indigo-300 font-mono">
                  {(analytics.weeklyReview.strengthTonnageKg.current / 1000).toFixed(1)}t
                </span>
                <span
                  className={`text-[10px] font-mono font-bold ${
                    (analytics.weeklyReview.strengthTonnageKg.deltaPercent ?? 0) >= 0
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }`}
                >
                  {analytics.weeklyReview.strengthTonnageKg.deltaPercent !== null
                    ? analytics.weeklyReview.strengthTonnageKg.deltaPercent >= 0
                      ? `+${analytics.weeklyReview.strengthTonnageKg.deltaPercent}%`
                      : `${analytics.weeklyReview.strengthTonnageKg.deltaPercent}%`
                    : 'Novo'}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Volume Corrida
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-black text-cyan-300 font-mono">
                  {analytics.weeklyReview.runningKm.current.toFixed(1)} km
                </span>
                <span
                  className={`text-[10px] font-mono font-bold ${
                    analytics.weeklyReview.runningKm.deltaKm >= 0 ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                >
                  {analytics.weeklyReview.runningKm.deltaKm >= 0
                    ? `+${analytics.weeklyReview.runningKm.deltaKm}km`
                    : `${analytics.weeklyReview.runningKm.deltaKm}km`}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                CrossFit / Funcional
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-black text-amber-300 font-mono">
                  {analytics.weeklyReview.crossTrainingSessions.current}x
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  Ant: {analytics.weeklyReview.crossTrainingSessions.previous}x
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1 col-span-2 md:col-span-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Gasto Estimado
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-black text-rose-300 font-mono">
                  {analytics.weeklyReview.caloriesBurnedTotal.current} kcal
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {analytics.weeklyReview.strengthSets.current} séries
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-slate-950/50 border border-slate-800/80 p-3.5 space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 block">
              Focos Prioritários para a Próxima Semana
            </span>
            <ul className="space-y-1 text-xs text-slate-300 list-disc pl-4">
              {analytics.weeklyReview.automatedFocusPoints.map((pt, i) => (
                <li key={i}>{pt}</li>
              ))}
            </ul>
          </div>

          {aiReviewText && (
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/25 p-4 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-indigo-300">
                <div className="flex items-center gap-1.5">
                  <Brain className="w-4 h-4 text-indigo-400" />
                  <span>Parecer Semanal do Master Coach IA</span>
                </div>
                {aiReviewFallback && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    Resumo heurístico offline (sem IA)
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                {aiReviewText}
              </p>
            </div>
          )}
        </div>
      )}

      {/* #27 Calendar .ics Sync Modal */}
      {isIcsModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    Sincronizar Agenda (.ics)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Google Calendar, Apple Calendar & Outlook (Eventos de Dia Inteiro)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsIcsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Seus treinos planejados e concluídos de <strong>Musculação</strong>, <strong>Corrida</strong> (com aquecimento, tiros e ritmos) e <strong>CrossFit</strong> são exportados como eventos de Dia Inteiro com a prescrição completa nas notas.
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                URL de Assinatura / Feed iCalendar
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={icsUrl}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 font-mono focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyIcsUrl}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
                >
                  {copiedIcs ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <a
                href={icsPath}
                download="personal-trainer-agenda.ics"
                className="px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-800/70 hover:bg-slate-800 text-xs font-semibold text-slate-200 transition"
              >
                Baixar Arquivo .ics
              </a>
              <a
                href={webcalUrl}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition shadow-md shadow-cyan-500/20"
              >
                Assinar no Apple / App de Calendário
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Cross-Training Modal */}
      <CrossTrainingModal
        isOpen={isCrossModalOpen}
        onClose={() => setIsCrossModalOpen(false)}
        onSuccess={handleRefreshCalendar}
      />
    </div>
  );
}
