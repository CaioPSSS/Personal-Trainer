'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sparkles, Dumbbell, Footprints, ArrowRight, Plus } from 'lucide-react';
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

type ProfileWithMesocycles = AthleteProfile & {
  mesocycles?: MesocyclePlan[];
};

interface ExecutiveDashboardProps {
  athleteProfile: ProfileWithMesocycles | null;
}

export default function ExecutiveDashboard({ athleteProfile }: ExecutiveDashboardProps) {
  const router = useRouter();
  const [isMonthlyOpen, setIsMonthlyOpen] = useState(false);
  const [isCrossModalOpen, setIsCrossModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [calendarKey, setCalendarKey] = useState(0);
  const [analytics, setAnalytics] = useState<{
    streak?: number;
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
  const firstName = athleteProfile.displayName?.split(' ')[0] || 'Atleta';

  const handleRefreshCalendar = () => {
    setCalendarKey((prev) => prev + 1);
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
              {new Date().toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-xs font-semibold transition"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>+ Registrar Atividade</span>
          </button>
        </div>
      </div>

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

      {/* Top Widgets: Next Workout & Streak */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <NextWorkoutCard onRefresh={handleRefreshCalendar} />
        </div>
        <div>
          <StreakCounter currentStreak={analytics?.streak} />
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

      {/* Cross-Training Modal */}
      <CrossTrainingModal
        isOpen={isCrossModalOpen}
        onClose={() => setIsCrossModalOpen(false)}
        onSuccess={handleRefreshCalendar}
      />
    </div>
  );
}
