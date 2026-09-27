'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Footprints,
  RefreshCw,
  Activity,
  Heart,
  Timer,
  CheckCircle2,
  Layers,
  Settings2,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  SkipForward,
  ExternalLink,
  Zap,
  Calendar,
  Sparkles,
  Check,
  AlertCircle,
} from 'lucide-react';
import { useToast } from '@/app/components/ToastProvider';
import RunningOnboardingForm from '@/app/components/RunningOnboardingForm';
import PaceEvolutionChart from '@/app/components/charts/PaceEvolutionChart';
import WeeklyVolumeChart from '@/app/components/charts/WeeklyVolumeChart';

interface RunningSegmentData {
  type: string;
  distanceKm?: number;
  distanceM?: number;
  durationMin?: number;
  paceRangeSec?: [number, number];
  reps?: number;
  restSec?: number;
  hrZone?: string;
  notes?: string;
}

interface RunningSessionData {
  id: string;
  weekNumber: number;
  dayOfWeek: string;
  sessionType: string;
  title: string;
  totalDistanceKm: number | null;
  totalDurationMin: number | null;
  targetPaceSec: number | null;
  targetHrZone: string | null;
  scheduledDate: string;
  status: string;
  notes?: string | null;
  segments?: RunningSegmentData[] | null;
}

interface RunningPlanData {
  id: string;
  title: string;
  month: number;
  year: number;
  objective: string;
  phase: string;
  weeklyTargetKm: number | null;
  status: string;
  sessions: RunningSessionData[];
}

interface RunningProfileData {
  id: string;
  currentPace5kSec?: number | null;
  currentPace10kSec?: number | null;
  weeklyVolumeKm?: number | null;
  maxHeartRate?: number | null;
  restingHeartRate?: number | null;
  primaryObjective?: string | null;
  targetPaceSec?: number | null;
  targetDistanceKm?: number | null;
  availableDays?: string[] | null;
  weeklyRunsTarget?: number | null;
  injuryHistory?: unknown | null;
  primaryTerrain?: string | null;
  hrZones?: Record<string, { min: number; max: number; label: string }> | null;
  runningPlans?: RunningPlanData[];
}

interface StravaStatusData {
  connected: boolean;
  athleteStravaId: number | null;
  scope: string | null;
  lastSyncAt: string | null;
}

const WEEK_DAYS_CONFIG = [
  { id: 0, key: 'monday', short: 'Seg', name: 'Segunda-feira' },
  { id: 1, key: 'tuesday', short: 'Ter', name: 'Terça-feira' },
  { id: 2, key: 'wednesday', short: 'Qua', name: 'Quarta-feira' },
  { id: 3, key: 'thursday', short: 'Qui', name: 'Quinta-feira' },
  { id: 4, key: 'friday', short: 'Sex', name: 'Sexta-feira' },
  { id: 5, key: 'saturday', short: 'Sáb', name: 'Sábado' },
  { id: 6, key: 'sunday', short: 'Dom', name: 'Domingo' },
];

const RUNNING_TARGET_OPTIONS = [2, 3, 4, 5];

function normalizeProfileDays(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    const res: string[] = [];
    for (const item of raw) {
      if (typeof item === 'string') {
        const lower = item.toLowerCase();
        if (lower.startsWith('seg') || lower.startsWith('mon') || lower === '0') res.push('monday');
        else if (lower.startsWith('ter') || lower.startsWith('tue') || lower === '1') res.push('tuesday');
        else if (lower.startsWith('qua') || lower.startsWith('wed') || lower === '2') res.push('wednesday');
        else if (lower.startsWith('qui') || lower.startsWith('thu') || lower === '3') res.push('thursday');
        else if (lower.startsWith('sex') || lower.startsWith('fri') || lower === '4') res.push('friday');
        else if (lower.startsWith('sab') || lower.startsWith('sáb') || lower.startsWith('sat') || lower === '5') res.push('saturday');
        else if (lower.startsWith('dom') || lower.startsWith('sun') || lower === '6') res.push('sunday');
      } else if (typeof item === 'number' && item >= 0 && item <= 6) {
        const keys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        res.push(keys[item]);
      }
    }
    if (res.length > 0) return Array.from(new Set(res));
  }
  return ['tuesday', 'thursday', 'saturday'];
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  easy: 'Easy Run (Rodagem)',
  tempo: 'Tempo Run (Limiar)',
  intervals: 'Intervalos (VO2max)',
  long_run: 'Longão de Resistência',
  fartlek: 'Fartlek (Variação de Ritmo)',
  hill_repeats: 'Subidas / Hill Repeats',
  progression: 'Corrida Progressiva',
  race_pace: 'Ritmo de Prova',
  recovery: 'Regenerativo',
};

const PHASE_LABELS: Record<string, string> = {
  base: 'Base Aeróbica',
  build: 'Fase de Construção (Build)',
  peak: 'Pico de Performance (Peak)',
  taper: 'Polimento (Taper)',
  recovery: 'Recuperação & Regeneração',
};

const SEGMENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  warmup: { label: 'Aquecimento', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  steady: { label: 'Ritmo Contínuo', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  tempo: { label: 'Limiar (Tempo)', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  interval: { label: 'Intervalo / Tiro', color: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  recovery_jog: { label: 'Trote Recuperação', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  cooldown: { label: 'Desaquecimento', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
  race_pace: { label: 'Ritmo de Prova', color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30' },
};

function formatPaceSec(paceSec?: number | null): string {
  if (!paceSec || isNaN(paceSec)) return '--:--';
  const min = Math.floor(paceSec / 60);
  const sec = Math.round(paceSec % 60);
  return `${min}:${sec.toString().padStart(2, '0')} /km`;
}

export default function RunningPage() {
  const { success, error: toastError, info } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<RunningProfileData | null>(null);
  const [activePlan, setActivePlan] = useState<RunningPlanData | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [stravaStatus, setStravaStatus] = useState<StravaStatusData | null>(null);

  // Expanded cards state
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});

  // Manual Run modal state
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualDistance, setManualDistance] = useState('');
  const [manualDurationMin, setManualDurationMin] = useState('');
  const [manualRpe, setManualRpe] = useState('7');
  const [manualNotes, setManualNotes] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isLoggingManual, setIsLoggingManual] = useState(false);

  // Skipping state
  const [skippingSessionId, setSkippingSessionId] = useState<string | null>(null);

  const configuredDays = useMemo(() => {
    return normalizeProfileDays(profile?.availableDays);
  }, [profile?.availableDays]);
  const currentRunsTarget = profile?.weeklyRunsTarget ?? 3;

  // Quick Availability Adjustment state
  const [isAdjustingSchedule, setIsAdjustingSchedule] = useState(false);
  const [quickDays, setQuickDays] = useState<string[]>(['tuesday', 'thursday', 'saturday']);
  const [quickTarget, setQuickTarget] = useState<number>(3);
  const [isSavingQuickSchedule, setIsSavingQuickSchedule] = useState(false);
  const [isRegeneratingPlan, setIsRegeneratingPlan] = useState(false);

  const startAdjustingSchedule = () => {
    setQuickDays(normalizeProfileDays(profile?.availableDays));
    setQuickTarget(profile?.weeklyRunsTarget ?? 3);
    setIsAdjustingSchedule(true);
  };

  const handleToggleQuickDay = (dayKey: string) => {
    setQuickDays((prev) => {
      if (prev.includes(dayKey)) {
        if (prev.length <= 1) {
          toastError('Selecione pelo menos 1 dia disponível na semana para correr.');
          return prev;
        }
        return prev.filter((d) => d !== dayKey);
      } else {
        return [...prev, dayKey];
      }
    });
  };

  const handleSaveQuickSchedule = async () => {
    if (quickDays.length === 0) {
      toastError('Selecione pelo menos 1 dia disponível na semana para correr.');
      return;
    }
    setIsSavingQuickSchedule(true);
    info('Salvando preferências de disponibilidade...', 'Perfil de Corrida');
    try {
      const res = await fetch('/api/running/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryObjective: profile?.primaryObjective,
          currentPace5kSec: profile?.currentPace5kSec,
          currentPace10kSec: profile?.currentPace10kSec,
          weeklyVolumeKm: profile?.weeklyVolumeKm,
          maxHeartRate: profile?.maxHeartRate,
          restingHeartRate: profile?.restingHeartRate,
          targetPaceSec: profile?.targetPaceSec,
          targetDistanceKm: profile?.targetDistanceKm,
          primaryTerrain: profile?.primaryTerrain,
          availableDays: quickDays,
          weeklyRunsTarget: quickTarget,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Falha ao salvar disponibilidade.');
      }

      const data = await res.json();
      setProfile(data.profile ?? null);
      success(
        `Disponibilidade atualizada: ${quickDays.length} dias, meta de ${quickTarget} corridas/sem.`,
        'Configuração Atualizada'
      );
      setIsAdjustingSchedule(false);
      window.dispatchEvent(new CustomEvent('calendar-refresh'));
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Erro ao salvar disponibilidade.');
    } finally {
      setIsSavingQuickSchedule(false);
    }
  };

  const handleConfirmAndRegeneratePlan = async () => {
    if (quickDays.length === 0) {
      toastError('Selecione pelo menos 1 dia disponível na semana para correr.');
      return;
    }
    setIsRegeneratingPlan(true);
    info('Atualizando disponibilidade e gerando novo plano com a IA...', 'Novo Mesociclo');
    try {
      // Step 1: Save updated profile
      const profileRes = await fetch('/api/running/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryObjective: profile?.primaryObjective,
          currentPace5kSec: profile?.currentPace5kSec,
          currentPace10kSec: profile?.currentPace10kSec,
          weeklyVolumeKm: profile?.weeklyVolumeKm,
          maxHeartRate: profile?.maxHeartRate,
          restingHeartRate: profile?.restingHeartRate,
          targetPaceSec: profile?.targetPaceSec,
          targetDistanceKm: profile?.targetDistanceKm,
          primaryTerrain: profile?.primaryTerrain,
          availableDays: quickDays,
          weeklyRunsTarget: quickTarget,
        }),
      });

      if (!profileRes.ok) {
        const errData = await profileRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Falha ao salvar disponibilidade.');
      }

      // Step 2: Trigger plan generation
      const genRes = await fetch('/api/running/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!genRes.ok) {
        const errData = await genRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Falha na geração do novo plano.');
      }

      const genData = await genRes.json();
      success(
        `Novo mesociclo de 4 semanas gerado com sucesso via ${genData.modelUsed || 'Running Coach AI'} (${genData.sessionsCount} sessões distribuídas em ${quickDays.length} dias)!`,
        'Plano Gerado'
      );
      setIsAdjustingSchedule(false);
      await reloadRunningData();
      window.dispatchEvent(new CustomEvent('calendar-refresh'));
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Erro ao gerar novo mesociclo.');
    } finally {
      setIsRegeneratingPlan(false);
    }
  };

  const toggleExpandSession = (sessionId: string) => {
    setExpandedSessions((prev) => ({
      ...prev,
      [sessionId]: !prev[sessionId],
    }));
  };

  const loadStravaStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/strava/sync');
      if (res.ok) {
        const data = await res.json();
        setStravaStatus(data);
      }
    } catch (err) {
      console.error('[RunningPage] Erro ao carregar status do Strava:', err);
    }
  }, []);

  const reloadRunningData = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/running/profile');
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile ?? null);

        if (data.profile?.runningPlans && data.profile.runningPlans.length > 0) {
          setActivePlan(data.profile.runningPlans[0]);
        } else {
          const planRes = await fetch('/api/running/generate');
          if (planRes.ok) {
            const planData = await planRes.json();
            setActivePlan(planData.plan ?? null);
          }
        }
      }
      await loadStravaStatus();
    } catch (err) {
      console.error('[RunningPage] Erro ao carregar dados:', err);
    } finally {
      setIsLoading(false);
    }
  }, [loadStravaStatus]);

  useEffect(() => {
    let active = true;

    // Check URL parameters for Strava OAuth callbacks
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('strava_connected') === 'true') {
        success(
          'Strava conectado com sucesso! Suas corridas serão sincronizadas.',
          'Strava Conectado'
        );
        window.history.replaceState({}, '', window.location.pathname);
      } else if (params.get('strava_error')) {
        toastError(
          `Falha na autorização do Strava: ${params.get('strava_error')}`,
          'Erro Strava'
        );
        window.history.replaceState({}, '', window.location.pathname);
      }
    }

    async function initData() {
      try {
        const res = await fetch('/api/running/profile');
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          if (!active) return;
          setProfile(data.profile ?? null);

          if (data.profile?.runningPlans && data.profile.runningPlans.length > 0) {
            setActivePlan(data.profile.runningPlans[0]);
          } else {
            const planRes = await fetch('/api/running/generate');
            if (planRes.ok && active) {
              const planData = await planRes.json();
              setActivePlan(planData.plan ?? null);
            }
          }
        }

        const stravaRes = await fetch('/api/strava/sync');
        if (stravaRes.ok && active) {
          const stravaData = await stravaRes.json();
          setStravaStatus(stravaData);
        }
      } catch (err) {
        console.error('[RunningPage] Erro ao carregar dados:', err);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    initData();

    return () => {
      active = false;
    };
  }, [success, toastError]);

  const handleSyncStrava = async () => {
    setIsSyncing(true);
    info('Iniciando sincronização com Strava...', 'Strava');
    try {
      const res = await fetch('/api/strava/sync', { method: 'POST' });
      const data = await res.json();

      if (res.ok && data.success) {
        success(
          `Sincronização concluída! ${data.count ?? 0} corridas importadas do Strava.`,
          'Strava Sincronizado'
        );
        await reloadRunningData();
      } else if (data.requiresReauth) {
        toastError(data.error ?? 'Reautorização necessária com o Strava.');
      } else {
        toastError(data.error ?? 'Falha ao sincronizar atividades do Strava.');
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Erro na sincronização Strava.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSkipSession = async (sessionId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSkippingSessionId(sessionId);
    try {
      const res = await fetch('/api/running/session/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? 'Falha ao pular treino.');
      }

      info('Treino marcado como pulado no plano e calendário.', 'Treino Pulado');

      // Update in local state reactively
      setActivePlan((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          sessions: prev.sessions.map((s) =>
            s.id === sessionId ? { ...s, status: 'skipped' } : s
          ),
        };
      });
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Erro ao pular treino.');
    } finally {
      setSkippingSessionId(null);
    }
  };

  const openManualModalForSession = (session?: RunningSessionData) => {
    if (session) {
      setSelectedSessionId(session.id);
      setManualDistance(session.totalDistanceKm ? String(session.totalDistanceKm) : '');
      setManualDurationMin(session.totalDurationMin ? String(session.totalDurationMin) : '');
    } else {
      setSelectedSessionId(null);
      setManualDistance('');
      setManualDurationMin('');
    }
    setShowManualModal(true);
  };

  const handleManualRunSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDistance || !manualDurationMin) {
      toastError('Informe a distância e duração da corrida.');
      return;
    }

    setIsLoggingManual(true);
    try {
      const res = await fetch('/api/running/execution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distanceKm: Number(manualDistance),
          durationMinutes: Number(manualDurationMin),
          sessionRpe: Number(manualRpe),
          notes: manualNotes.trim() || undefined,
          runningSessionId: selectedSessionId || undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error ?? 'Falha ao registrar corrida manual.');
      }

      success('Corrida registrada e sincronizada com o calendário com sucesso!', 'Treino Concluído');
      setShowManualModal(false);
      setManualDistance('');
      setManualDurationMin('');
      setManualNotes('');
      setSelectedSessionId(null);
      await reloadRunningData();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Erro ao salvar treino.');
    } finally {
      setIsLoggingManual(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-pulse">
        <div className="glass-card p-6 h-32 bg-slate-900/40 rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card p-4 h-24 bg-slate-900/40 rounded-2xl" />
          ))}
        </div>
        <div className="glass-card p-6 h-64 bg-slate-900/40 rounded-2xl" />
      </div>
    );
  }

  // If no profile or no active plan exists, or user clicked to adjust/reconfigure
  if (!activePlan || showForm) {
    return (
      <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Módulo de Corrida & Endurance
            </span>
          </div>
          {activePlan && (
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:text-white transition"
            >
              Voltar ao Plano Ativo
            </button>
          )}
        </div>

        <RunningOnboardingForm
          initialProfile={profile}
          onPlanGenerated={() => {
            setShowForm(false);
            reloadRunningData();
          }}
        />
      </div>
    );
  }

  // Plan progress calculations
  const totalSessions = activePlan.sessions.length;
  const completedSessions = activePlan.sessions.filter((s) => s.status === 'completed').length;
  const skippedSessions = activePlan.sessions.filter((s) => s.status === 'skipped').length;
  const progressPct = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;

  const totalPlannedKm = activePlan.sessions.reduce(
    (acc, s) => acc + (s.totalDistanceKm || 0),
    0
  );
  const completedKm = activePlan.sessions
    .filter((s) => s.status === 'completed')
    .reduce((acc, s) => acc + (s.totalDistanceKm || 0), 0);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Strava Connection Banner */}
      <div className="glass-card p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-orange-500/20 bg-gradient-to-r from-orange-950/20 via-slate-900/60 to-slate-900/60 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 font-black text-sm shrink-0">
            S
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-slate-100">
                Integração Strava
              </span>
              {stravaStatus?.connected ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/15 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3" />
                  Conectado {stravaStatus.athleteStravaId ? `(#${stravaStatus.athleteStravaId})` : ''}
                </span>
              ) : (
                <span className="text-[11px] font-medium text-amber-300 bg-amber-500/15 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                  Não conectado
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {stravaStatus?.lastSyncAt
                ? `Última sincronização: ${new Date(stravaStatus.lastSyncAt).toLocaleString('pt-BR')}`
                : 'Sincronize para puxar ritmo, parciais e telemetria cardíaca.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
          {!stravaStatus?.connected && (
            <a
              href="/api/strava/auth"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold transition shadow-md shadow-orange-500/20 cursor-pointer"
            >
              <span>Conectar Strava</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}

          <button
            type="button"
            onClick={handleSyncStrava}
            disabled={isSyncing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Strava 🔄'}</span>
          </button>
        </div>
      </div>

      {/* Running Header */}
      <div className="glass-card p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Módulo de Corrida & Endurance
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-xs text-slate-400">Jack Daniels VDOT & Pete Pfitzinger</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-300 mt-1">
            {activePlan.title || 'Periodização de Corrida'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {activePlan.objective || 'Estrutura 80/20 polarizada, zonas de FC Karvonen e telemetria.'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => openManualModalForSession()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-bold transition shadow-md shadow-emerald-500/10 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Registrar Corrida Manual</span>
          </button>

          <button
            type="button"
            onClick={() => setShowForm(true)}
            title="Ajustar Perfil & Gerar Novo Ciclo"
            className="p-2 rounded-xl border border-slate-700/80 bg-slate-800/60 hover:bg-slate-700/60 text-slate-300 transition cursor-pointer"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Availability & Frequency Section (Running AI Schedule Indicator & Quick Adjustment) */}
      <div className="glass-card p-5 space-y-4 border-slate-800">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
                Disponibilidade Semanal & Meta de Treinos
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Running AI Schedule
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {isAdjustingSchedule
                  ? 'Ajuste seus dias e meta semanal antes de gerar um novo ciclo de corrida.'
                  : 'Configuração atual respeitada pelo gerador de periodização e pelo calendário multi-esportes.'}
              </p>
            </div>
          </div>

          {!isAdjustingSchedule && (
            <button
              type="button"
              onClick={startAdjustingSchedule}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 hover:border-emerald-500/40 bg-slate-800/80 hover:bg-slate-800 text-xs font-semibold text-slate-300 hover:text-emerald-300 transition cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Ajustar Disponibilidade & Meta</span>
            </button>
          )}
        </div>

        {/* Days of Week pills */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-200">
              {isAdjustingSchedule ? '1. Selecione os Dias Disponíveis para Correr:' : 'Dias Configurados para Corrida:'}
            </span>
            <span className="text-emerald-400 font-mono text-[11px]">
              {isAdjustingSchedule
                ? `${quickDays.length} ${quickDays.length === 1 ? 'dia selecionado' : 'dias selecionados'}`
                : `${configuredDays.length} ${configuredDays.length === 1 ? 'dia ativo' : 'dias ativos'}`}
            </span>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {WEEK_DAYS_CONFIG.map((day) => {
              const isSelected = isAdjustingSchedule
                ? quickDays.includes(day.key)
                : configuredDays.includes(day.key);

              return (
                <button
                  key={day.id}
                  type="button"
                  disabled={!isAdjustingSchedule || isSavingQuickSchedule || isRegeneratingPlan}
                  onClick={() => isAdjustingSchedule && handleToggleQuickDay(day.key)}
                  className={`py-2 px-2 rounded-xl text-xs font-semibold border transition flex flex-col items-center justify-center gap-1 ${
                    isAdjustingSchedule ? 'cursor-pointer' : 'cursor-default'
                  } ${
                    isSelected
                      ? 'bg-emerald-600/25 border-emerald-500 text-emerald-200 shadow-sm shadow-emerald-500/20'
                      : 'bg-slate-900/60 border-slate-800 text-slate-500'
                  }`}
                  title={`${day.name} (${isSelected ? 'Disponível' : 'Descanso'})`}
                >
                  <span className="text-sm font-bold">{day.short}</span>
                  <div className="flex items-center gap-1 text-[10px]">
                    {isSelected ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Weekly runs target selector or summary */}
        {isAdjustingSchedule ? (
          <div className="space-y-3 pt-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">
                  2. Meta de Treinos de Corrida por Semana:
                </span>
                <span className="text-emerald-400 font-mono text-[11px]">
                  {quickTarget} treinos / semana
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {RUNNING_TARGET_OPTIONS.map((count) => {
                  const isCurrent = quickTarget === count;
                  return (
                    <button
                      key={count}
                      type="button"
                      disabled={isSavingQuickSchedule || isRegeneratingPlan}
                      onClick={() => setQuickTarget(count)}
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

              {quickTarget > quickDays.length && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs animate-fadeIn">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>
                    Você configurou meta de {quickTarget} corridas, mas apenas {quickDays.length} dias disponíveis. A IA limitará o cronograma aos dias disponíveis ou selecione mais dias.
                  </span>
                </div>
              )}
            </div>

            {/* Adjustment Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800 flex-wrap">
              <button
                type="button"
                disabled={isSavingQuickSchedule || isRegeneratingPlan}
                onClick={() => setIsAdjustingSchedule(false)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSavingQuickSchedule || isRegeneratingPlan}
                onClick={handleSaveQuickSchedule}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
              >
                <Check className={`w-3.5 h-3.5 ${isSavingQuickSchedule ? 'animate-spin' : ''}`} />
                <span>{isSavingQuickSchedule ? 'Salvando...' : 'Salvar Disponibilidade'}</span>
              </button>
              <button
                type="button"
                disabled={isSavingQuickSchedule || isRegeneratingPlan}
                onClick={handleConfirmAndRegeneratePlan}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-bold transition shadow-md shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isRegeneratingPlan ? 'animate-spin' : ''}`} />
                <span>{isRegeneratingPlan ? 'Gerando Plano com IA...' : 'Confirmar & Gerar Novo Mesociclo'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pt-2 border-t border-slate-800/60 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-400">Meta Semanal:</span>
              <span className="font-bold text-emerald-300 flex items-center gap-1 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                <Footprints className="w-3 h-3" />
                {currentRunsTarget} corridas / semana
              </span>
              {currentRunsTarget > configuredDays.length ? (
                <span className="text-amber-300 text-[11px] flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Limitado aos {configuredDays.length} dias livres
                </span>
              ) : (
                <span className="text-slate-400 text-[11px] flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  Alinhado com disponibilidade
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Sessões de corrida isoladas a 48h de treinos pesados de pernas.
            </p>
          </div>
        )}
      </div>

      {/* Plan Summary Banner & Progress */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card p-4 space-y-1 border-slate-800">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>Fase do Mês</span>
          </div>
          <p className="text-lg font-bold text-slate-100">
            {PHASE_LABELS[activePlan.phase] ?? activePlan.phase}
          </p>
          <span className="text-[11px] text-emerald-400">
            Mês {activePlan.month} / {activePlan.year} (4 semanas)
          </span>
        </div>

        <div className="glass-card p-4 space-y-1 border-slate-800">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>Volume Semanal Alvo</span>
          </div>
          <p className="text-lg font-bold text-slate-100">
            {activePlan.weeklyTargetKm ? `${activePlan.weeklyTargetKm.toFixed(1)} km` : '-- km'}
          </p>
          <span className="text-[11px] text-slate-400">Meta ciclo: ~{totalPlannedKm.toFixed(1)} km</span>
        </div>

        <div className="glass-card p-4 space-y-1 border-slate-800">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <Timer className="w-3.5 h-3.5 text-emerald-400" />
            <span>Ritmo Base 5K</span>
          </div>
          <p className="text-lg font-bold text-slate-100 font-mono">
            {formatPaceSec(profile?.currentPace5kSec)}
          </p>
          <span className="text-[11px] text-slate-400">
            {profile?.currentPace10kSec
              ? `10K: ${formatPaceSec(profile.currentPace10kSec)}`
              : 'VDOT Calibrado'}
          </span>
        </div>

        <div className="glass-card p-4 space-y-1 border-slate-800">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <Heart className="w-3.5 h-3.5 text-rose-400" />
            <span>FC Repouso / Máx</span>
          </div>
          <p className="text-lg font-bold text-slate-100 font-mono">
            {profile?.restingHeartRate ?? '--'} / {profile?.maxHeartRate ?? '--'} bpm
          </p>
          <span className="text-[11px] text-rose-400">
            {profile?.hrZones?.zone2
              ? `Zona 2: ${profile.hrZones.zone2.min}-${profile.hrZones.zone2.max} bpm`
              : 'Zonas Karvonen ativas'}
          </span>
        </div>
      </div>

      {/* Plan Progress Bar */}
      <div className="glass-card p-4 space-y-2 border-slate-800">
        <div className="flex justify-between items-center text-xs">
          <span className="font-semibold text-slate-300">Progresso do Ciclo Mensal</span>
          <span className="text-emerald-400 font-bold">
            {completedSessions} de {totalSessions} treinos concluídos ({progressPct}%)
          </span>
        </div>
        <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
          {skippedSessions > 0 && (
            <div
              className="h-full bg-slate-600 transition-all duration-500"
              style={{ width: `${Math.round((skippedSessions / totalSessions) * 100)}%` }}
              title={`${skippedSessions} treinos pulados`}
            />
          )}
        </div>
        <div className="flex justify-between text-[11px] text-slate-500 pt-1">
          <span>{completedKm.toFixed(1)} km rodados de {totalPlannedKm.toFixed(1)} km planejados</span>
          {skippedSessions > 0 && <span>{skippedSessions} treinos pulados</span>}
        </div>
      </div>

      {/* Sessions Grid with Expandable Cards */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Footprints className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-base font-bold text-slate-100">Grade de Sessões do Ciclo (4 Semanas)</h2>
              <p className="text-xs text-slate-400">
                Clique nos cards para expandir segmentos granulares de aquecimento, tiros e desaquecimento.
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {totalSessions} Treinos Estruturados
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activePlan.sessions.map((session) => {
            const isExpanded = !!expandedSessions[session.id];
            const isCompleted = session.status === 'completed';
            const isSkipped = session.status === 'skipped';
            const isPlanned = session.status === 'planned';

            return (
              <div
                key={session.id}
                className={`rounded-2xl border transition-all duration-200 space-y-3 p-4 flex flex-col justify-between ${
                  isCompleted
                    ? 'border-emerald-500/40 bg-emerald-950/20'
                    : isSkipped
                    ? 'border-slate-800 bg-slate-900/30 opacity-40 hover:opacity-75'
                    : 'border-slate-800/80 bg-slate-900/60 hover:border-emerald-500/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">
                      Semana {session.weekNumber} • {session.scheduledDate}
                    </span>
                    {isCompleted ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3" />
                        Feito
                      </span>
                    ) : isSkipped ? (
                      <span className="text-[10px] font-semibold text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700">
                        Pulado
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-300 bg-slate-800 px-2 py-0.5 rounded-full">
                        Planejado
                      </span>
                    )}
                  </div>

                  <div className="mt-2">
                    <h3 className="text-sm font-bold text-slate-100">{session.title}</h3>
                    <span className="text-xs text-slate-400">
                      {SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType}
                    </span>
                  </div>

                  <div className="space-y-1.5 pt-2 mt-2 border-t border-slate-800/60 text-xs text-slate-300">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Distância Prevista:</span>
                      <span className="font-semibold text-slate-100">
                        {session.totalDistanceKm ? `${session.totalDistanceKm.toFixed(1)} km` : '--'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Ritmo Alvo Médio:</span>
                      <span className="font-semibold text-emerald-300 font-mono">
                        {session.targetPaceSec ? formatPaceSec(session.targetPaceSec) : 'Sensação / RPE'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Zona Cardíaca:</span>
                      <span className="font-semibold text-rose-300">
                        {session.targetHrZone ?? 'Zona 2'}
                      </span>
                    </div>
                  </div>

                  {session.notes && (
                    <p className="text-[11px] text-slate-400 pt-1.5 border-t border-slate-800/40 line-clamp-2">
                      {session.notes}
                    </p>
                  )}

                  {/* Expandable Granular Segments */}
                  {session.segments && session.segments.length > 0 && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => toggleExpandSession(session.id)}
                        className="w-full flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-slate-800/50 hover:bg-slate-800 text-[11px] font-semibold text-slate-300 transition"
                      >
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3 text-emerald-400" />
                          <span>{session.segments.length} Segmentos Granulares</span>
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="space-y-2 mt-2 pt-2 border-t border-slate-800/60">
                          {session.segments.map((seg, idx) => {
                            const segConfig = SEGMENT_TYPE_LABELS[seg.type] ?? {
                              label: seg.type,
                              color: 'bg-slate-800 text-slate-300 border-slate-700',
                            };
                            return (
                              <div
                                key={idx}
                                className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1 text-xs"
                              >
                                <div className="flex items-center justify-between flex-wrap gap-1">
                                  <span
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${segConfig.color}`}
                                  >
                                    {segConfig.label}
                                  </span>
                                  {seg.reps && (
                                    <span className="text-[10px] text-slate-300 font-bold bg-slate-800 px-1.5 py-0.5 rounded">
                                      {seg.reps}x repetições
                                    </span>
                                  )}
                                </div>

                                <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-300 pt-1">
                                  {seg.distanceKm != null && (
                                    <div>
                                      <span className="text-slate-500">Dist: </span>
                                      <span className="font-semibold">{seg.distanceKm.toFixed(1)} km</span>
                                    </div>
                                  )}
                                  {seg.distanceM != null && (
                                    <div>
                                      <span className="text-slate-500">Dist: </span>
                                      <span className="font-semibold">{seg.distanceM} m</span>
                                    </div>
                                  )}
                                  {seg.durationMin != null && (
                                    <div>
                                      <span className="text-slate-500">Dur: </span>
                                      <span className="font-semibold">{seg.durationMin} min</span>
                                    </div>
                                  )}
                                  {seg.paceRangeSec && (
                                    <div className="col-span-2">
                                      <span className="text-slate-500">Pace: </span>
                                      <span className="font-mono text-emerald-300 font-semibold">
                                        {formatPaceSec(seg.paceRangeSec[0])} - {formatPaceSec(seg.paceRangeSec[1])}
                                      </span>
                                    </div>
                                  )}
                                  {seg.hrZone && (
                                    <div>
                                      <span className="text-slate-500">FC: </span>
                                      <span className="text-rose-300">{seg.hrZone}</span>
                                    </div>
                                  )}
                                  {seg.restSec != null && (
                                    <div>
                                      <span className="text-slate-500">Recup: </span>
                                      <span>{seg.restSec}s</span>
                                    </div>
                                  )}
                                </div>

                                {seg.notes && (
                                  <p className="text-[10px] text-slate-400 italic pt-0.5">
                                    {seg.notes}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Quick actions for planned session */}
                {isPlanned && (
                  <div className="flex items-center gap-2 pt-3 border-t border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => openManualModalForSession(session)}
                      className="flex-1 py-1.5 px-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition text-center cursor-pointer"
                    >
                      Registrar
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleSkipSession(session.id, e)}
                      disabled={skippingSessionId === session.id}
                      className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
                      title="Marcar treino como pulado"
                    >
                      <SkipForward className="w-3 h-3" />
                      <span>{skippingSessionId === session.id ? '...' : 'Pular'}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Progression Analytics (Pace Evolution & Weekly Volume) */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-bold text-slate-100">Análise de Performance & Volume</h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PaceEvolutionChart />
          <WeeklyVolumeChart />
        </div>
      </div>

      {/* Manual Run Log Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-card max-w-md w-full p-6 space-y-4 border-emerald-500/30">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Footprints className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-slate-100">
                  {selectedSessionId ? 'Registrar Execução de Sessão' : 'Registrar Corrida Manual'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualRunSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Distância (km) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    required
                    placeholder="ex: 5.2"
                    value={manualDistance}
                    onChange={(e) => setManualDistance(e.target.value)}
                    disabled={isLoggingManual}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Duração (min) *</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    required
                    placeholder="ex: 28.5"
                    value={manualDurationMin}
                    onChange={(e) => setManualDurationMin(e.target.value)}
                    disabled={isLoggingManual}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Percepção de Esforço (RPE: 1 a 10)</label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={manualRpe}
                  onChange={(e) => setManualRpe(e.target.value)}
                  disabled={isLoggingManual}
                  className="w-full accent-emerald-500"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>1 (Leve / Recuperação)</span>
                  <span className="font-bold text-emerald-400">RPE {manualRpe}</span>
                  <span>10 (Exaustão Máxima)</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Observações / Sensações</label>
                <textarea
                  rows={2}
                  placeholder="ex: Ritmo confortável, vento contra na volta..."
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  disabled={isLoggingManual}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  disabled={isLoggingManual}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isLoggingManual}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition disabled:opacity-50"
                >
                  {isLoggingManual ? 'Salvando...' : 'Salvar Treino'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
