'use client';

import React, { useState, useMemo } from 'react';
import {
  User,
  Settings as SettingsIcon,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Dumbbell,
  Clock,
  RefreshCw,
  Footprints,
  Heart,
  Timer,
  Activity,
  AlertCircle,
  Calendar,
  Sparkles,
  Check,
} from 'lucide-react';
import { useToast } from '@/app/components/ToastProvider';

interface RunningProfileInfo {
  id?: string;
  primaryObjective?: string | null;
  currentPace5kSec?: number | null;
  currentPace10kSec?: number | null;
  currentPaceHalfSec?: number | null;
  weeklyVolumeKm?: number | null;
  maxHeartRate?: number | null;
  restingHeartRate?: number | null;
  primaryTerrain?: string | null;
  availableDays?: unknown;
  hrZones?: unknown;
}

interface SettingsClientProps {
  athleteProfile: {
    displayName?: string | null;
    trainingAgeYears?: number | null;
    sessionDurationMin?: number;
    athleteContext?: string | null;
    availableEquipment?: unknown;
    movementRestrictions?: unknown;
    availableDays?: unknown;
    weeklyWorkoutsTarget?: number | null;
  } | null;
  runningProfile?: RunningProfileInfo | null;
  stravaConnected: boolean;
  stravaLastSync?: string | null;
  athleteStravaId?: number | null;
  stravaScope?: string | null;
}

function formatPaceSec(paceSec?: number | null): string {
  if (!paceSec || isNaN(paceSec)) return '--:--';
  const min = Math.floor(paceSec / 60);
  const sec = Math.round(paceSec % 60);
  return `${min}:${sec.toString().padStart(2, '0')} /km`;
}

function parseDaysToIndices(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    const res: number[] = [];
    for (const item of raw) {
      if (typeof item === 'number' && item >= 0 && item <= 6) res.push(item);
      else if (typeof item === 'string') {
        const lower = item.toLowerCase();
        if (lower.startsWith('seg') || lower === '0') res.push(0);
        else if (lower.startsWith('ter') || lower === '1') res.push(1);
        else if (lower.startsWith('qua') || lower === '2') res.push(2);
        else if (lower.startsWith('qui') || lower === '3') res.push(3);
        else if (lower.startsWith('sex') || lower === '4') res.push(4);
        else if (lower.startsWith('sab') || lower.startsWith('sáb') || lower === '5') res.push(5);
        else if (lower.startsWith('dom') || lower === '6') res.push(6);
      }
    }
    if (res.length > 0) return Array.from(new Set(res)).sort((a, b) => a - b);
  }
  return [0, 1, 2, 4, 5]; // Default: Seg, Ter, Qua, Sex, Sáb (5 dias)
}

const WEEK_DAYS = [
  { id: 0, short: 'Seg', name: 'Segunda-feira' },
  { id: 1, short: 'Ter', name: 'Terça-feira' },
  { id: 2, short: 'Qua', name: 'Quarta-feira' },
  { id: 3, short: 'Qui', name: 'Quinta-feira' },
  { id: 4, short: 'Sex', name: 'Sexta-feira' },
  { id: 5, short: 'Sáb', name: 'Sábado' },
  { id: 6, short: 'Dom', name: 'Domingo' },
];

const TARGET_WORKOUT_OPTIONS = [2, 3, 4, 5, 6];

const OBJECTIVE_LABELS: Record<string, string> = {
  improve_5k_pace: 'Melhorar Pace nos 5K',
  complete_10k: 'Completar 10K com Consistência',
  half_marathon_prep: 'Preparação para Meia Maratona (21K)',
  general_endurance: 'Condicionamento Aeróbico Geral',
};

const TERRAIN_LABELS: Record<string, string> = {
  treadmill: 'Esteira',
  road_flat: 'Asfalto / Plano',
  trail: 'Trilha / Terra',
  mixed: 'Misto (Rua + Esteira)',
};

export default function SettingsClient({
  athleteProfile,
  runningProfile,
  stravaConnected,
  stravaLastSync: initialLastSync,
  athleteStravaId,
  stravaScope,
}: SettingsClientProps) {
  const { success, error: toastError, info } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(initialLastSync ?? null);

  // Available days & workout target state
  const initialDays = useMemo(() => {
    return parseDaysToIndices(athleteProfile?.availableDays);
  }, [athleteProfile?.availableDays]);

  const [selectedDays, setSelectedDays] = useState<number[]>(initialDays);
  const [weeklyTarget, setWeeklyTarget] = useState<number>(athleteProfile?.weeklyWorkoutsTarget ?? 3);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  const handleToggleDay = (dayId: number) => {
    setSelectedDays((prev) => {
      if (prev.includes(dayId)) {
        if (prev.length <= 1) return prev; // Keep at least 1 day
        return prev.filter((d) => d !== dayId);
      } else {
        return [...prev, dayId].sort((a, b) => a - b);
      }
    });
  };

  const handleSaveSchedule = async () => {
    if (selectedDays.length === 0) {
      toastError('Selecione pelo menos 1 dia disponível na semana.');
      return;
    }
    setIsSavingSchedule(true);
    info('Salvando preferências e rebalanceando calendário...', 'Agendador Inteligente');
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          availableDays: selectedDays,
          weeklyWorkoutsTarget: weeklyTarget,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError(data.error || 'Falha ao salvar configurações.');
        return;
      }

      const rebalancedCount = data.rebalance?.rebalancedCount ?? 0;
      success(
        `Meta de ${weeklyTarget} treinos em ${selectedDays.length} dias salva com sucesso! (${rebalancedCount} treinos reorganizados na semana).`,
        'Calendário Rebalanceado'
      );
      window.dispatchEvent(new CustomEvent('calendar-refresh'));
    } catch (err) {
      console.error(err);
      toastError('Erro ao salvar preferências de treino.');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleConnectStrava = () => {
    window.location.href = '/api/strava/auth';
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    info('Iniciando sincronização com Strava...', 'Strava');
    try {
      const res = await fetch('/api/strava/sync', { method: 'POST' });
      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.requiresReauth) {
          toastError(data.error ?? 'Reautorização necessária com o Strava.');
        } else {
          toastError(data.error ?? 'Falha ao sincronizar atividades do Strava.');
        }
        return;
      }

      const syncDate = data.lastSyncAt ? new Date(data.lastSyncAt).toISOString() : new Date().toISOString();
      setLastSync(syncDate);
      success(
        `Sincronização concluída! ${data.count ?? 0} corridas processadas.`,
        'Strava Atualizado'
      );
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Erro na comunicação com Strava.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="glass-card p-6 flex items-center justify-between border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <SettingsIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100">Configurações & Integrações</h1>
            <p className="text-xs text-slate-400">
              Gerencie seus perfis de treino, preferências biométricas e sincronização Strava.
            </p>
          </div>
        </div>
      </div>

      {/* Athlete Profile Summary */}
      <div className="glass-card p-6 space-y-4 border-slate-800">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
          <User className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-bold text-slate-100">Perfil de Hipertrofia & Musculação</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
          <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800/80 space-y-1">
            <span className="text-slate-400 font-medium">Nome do Atleta</span>
            <p className="text-sm font-bold text-slate-200">
              {athleteProfile?.displayName || 'Caio Souza'}
            </p>
          </div>

          <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800/80 space-y-1">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              <Clock className="w-3 h-3 text-indigo-400" />
              Tempo de Treino
            </span>
            <p className="text-sm font-bold text-slate-200">
              {athleteProfile?.trainingAgeYears
                ? `${athleteProfile.trainingAgeYears} anos`
                : 'Intermediário / Avançado'}
            </p>
          </div>

          <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800/80 space-y-1">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              <Dumbbell className="w-3 h-3 text-indigo-400" />
              Duração Alvo por Sessão
            </span>
            <p className="text-sm font-bold text-slate-200">
              {athleteProfile?.sessionDurationMin || 60} minutos
            </p>
          </div>
        </div>

        <div className="bg-slate-900/40 rounded-xl p-3.5 border border-slate-800/60 space-y-1.5 text-xs text-slate-300">
          <div className="font-semibold text-slate-200">Equipamentos & Academia:</div>
          <p className="text-slate-400">
            Catálogo SmartFit: Crossover, Halteres monobloco, Máquinas articuladas, Smith Machine, Leg Press 45°, Cadeira Extensora, Mesa Flexora.
          </p>
        </div>
      </div>

      {/* Available Days & Weekly Workouts Target (Smart Multi-Sport Scheduler) */}
      <div className="glass-card p-6 space-y-5 border-slate-800">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
                Disponibilidade Semanal & Meta de Treinos
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Smart Scheduler
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Defina seus dias livres e a quantidade de treinos semanais. A IA distribui as sessões afastando pernas de corridas longas e CrossFit.
              </p>
            </div>
          </div>
        </div>

        {/* Days of week selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-200">
              1. Dias Disponíveis na Semana:
            </span>
            <span className="text-indigo-400 font-mono text-[11px]">
              {selectedDays.length} {selectedDays.length === 1 ? 'dia selecionado' : 'dias selecionados'}
            </span>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {WEEK_DAYS.map((day) => {
              const isSelected = selectedDays.includes(day.id);
              return (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => handleToggleDay(day.id)}
                  className={`py-2.5 px-2 rounded-xl text-xs font-semibold border transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600/25 border-indigo-500 text-indigo-200 shadow-sm shadow-indigo-500/20'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                  title={`${day.name} (${isSelected ? 'Disponível' : 'Indisponível'})`}
                >
                  <span className="text-sm font-bold">{day.short}</span>
                  <div className="flex items-center gap-1 text-[10px]">
                    {isSelected ? (
                      <Check className="w-3 h-3 text-indigo-400" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Weekly workout target selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-200">
              2. Meta de Treinos de Musculação por Semana:
            </span>
            <span className="text-indigo-400 font-mono text-[11px]">
              {weeklyTarget} sessões / semana
            </span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {TARGET_WORKOUT_OPTIONS.map((count) => {
              const isCurrent = weeklyTarget === count;
              return (
                <button
                  key={count}
                  type="button"
                  onClick={() => setWeeklyTarget(count)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition flex items-center justify-center gap-2 cursor-pointer ${
                    isCurrent
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 border-indigo-400 text-white shadow-md shadow-indigo-600/20'
                      : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <Dumbbell className="w-3.5 h-3.5" />
                  <span>{count} Treinos</span>
                </button>
              );
            })}
          </div>

          {weeklyTarget > selectedDays.length && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs animate-fadeIn">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>
                Você configurou uma meta de {weeklyTarget} treinos, mas apenas {selectedDays.length} dias disponíveis. O agendador utilizará todos os {selectedDays.length} dias ou você pode selecionar mais dias.
              </span>
            </div>
          )}
        </div>

        {/* Multi-sport intelligence rules notes */}
        <div className="bg-slate-900/40 rounded-xl p-3.5 border border-slate-800/80 space-y-2 text-xs text-slate-300">
          <div className="flex items-center gap-1.5 font-semibold text-indigo-300">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Regras Biomecânicas Automáticas:</span>
          </div>
          <ul className="space-y-1 text-slate-400 list-disc list-inside text-[11px] leading-relaxed">
            <li>
              <strong className="text-slate-300">Proteção de Corrida Longa:</strong> O treino de pernas é automaticamente repelido do dia da Corrida Longa e do dia anterior (evita fadiga excêntrica e risco articular).
            </li>
            <li>
              <strong className="text-slate-300">Janela para Tiros e Velocidade:</strong> Pernas não colidem com treinos de ritmo ou tiros intensos na semana.
            </li>
            <li>
              <strong className="text-slate-300">Reatividade a CrossFit:</strong> Ao adicionar um treino de CrossFit na semana, os treinos de força restantes são reorganizados instantaneamente para respeitar a recuperação muscular.
            </li>
          </ul>
        </div>

        {/* Action button */}
        <div className="pt-1">
          <button
            type="button"
            onClick={handleSaveSchedule}
            disabled={isSavingSchedule}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold shadow-md shadow-indigo-600/25 transition disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isSavingSchedule ? 'animate-spin' : ''}`} />
            <span>
              {isSavingSchedule
                ? 'Rebalanceando Calendário...'
                : 'Salvar Preferências & Rebalancear Calendário'}
            </span>
          </button>
        </div>
      </div>

      {/* Running Profile Section */}
      <div className="glass-card p-6 space-y-4 border-slate-800">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Footprints className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-100">Perfil de Corrida & Endurance</h2>
          </div>
          <a
            href="/running"
            className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold transition"
          >
            Acessar Hub de Corrida →
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800/80 space-y-1">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              <Timer className="w-3 h-3 text-emerald-400" />
              Pace Referência 5K
            </span>
            <p className="text-sm font-bold text-slate-200 font-mono">
              {formatPaceSec(runningProfile?.currentPace5kSec)}
            </p>
            <span className="text-[10px] text-slate-500">
              10K: {formatPaceSec(runningProfile?.currentPace10kSec)}
            </span>
          </div>

          <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800/80 space-y-1">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              <Activity className="w-3 h-3 text-emerald-400" />
              Volume Atual
            </span>
            <p className="text-sm font-bold text-slate-200">
              {runningProfile?.weeklyVolumeKm
                ? `${runningProfile.weeklyVolumeKm.toFixed(1)} km/sem`
                : '15.0 km/sem'}
            </p>
            <span className="text-[10px] text-slate-500">Distribuição polarizada 80/20</span>
          </div>

          <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800/80 space-y-1">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              <Heart className="w-3 h-3 text-rose-400" />
              Frequência Cardíaca
            </span>
            <p className="text-sm font-bold text-slate-200 font-mono">
              {runningProfile?.restingHeartRate ?? 55} / {runningProfile?.maxHeartRate ?? 188} bpm
            </p>
            <span className="text-[10px] text-slate-500">Repouso / Máxima (Karvonen)</span>
          </div>

          <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800/80 space-y-1">
            <span className="text-slate-400 font-medium">Objetivo Principal</span>
            <p className="text-sm font-bold text-slate-200 truncate">
              {runningProfile?.primaryObjective
                ? OBJECTIVE_LABELS[runningProfile.primaryObjective] ?? runningProfile.primaryObjective
                : 'Melhorar Ritmo e Eficiência'}
            </p>
            <span className="text-[10px] text-slate-500">
              Terreno: {runningProfile?.primaryTerrain ? TERRAIN_LABELS[runningProfile.primaryTerrain] ?? runningProfile.primaryTerrain : 'Asfalto / Plano'}
            </span>
          </div>
        </div>
      </div>

      {/* Strava Integration Card */}
      <div className="glass-card p-6 space-y-5 border-slate-800">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 font-black text-sm">
              S
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Integração Strava API</h2>
              <p className="text-xs text-slate-400">
                OAuth2, Webhook push em tempo real e sincronização de telemetria esportiva.
              </p>
            </div>
          </div>

          {stravaConnected ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Conectado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-300">
              <AlertCircle className="w-3.5 h-3.5" />
              Não Conectado
            </span>
          )}
        </div>

        {/* Integration Details */}
        <div className="space-y-3 text-xs text-slate-300">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
              <span className="text-slate-400 block mb-1">Strava Client ID</span>
              <span className="font-mono text-slate-200 font-bold">282597</span>
            </div>
            <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
              <span className="text-slate-400 block mb-1">Strava Athlete ID</span>
              <span className="font-mono text-slate-200 font-bold">
                {athleteStravaId ?? 129158587}
              </span>
            </div>
            <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
              <span className="text-slate-400 block mb-1">Escopo de Permissões</span>
              <span className="font-mono text-emerald-400">
                {stravaScope || 'read,activity:read_all'}
              </span>
            </div>
          </div>

          {lastSync ? (
            <p className="text-[11px] text-emerald-400/90 font-medium">
              Última sincronização: {new Date(lastSync).toLocaleString('pt-BR')}
            </p>
          ) : (
            <p className="text-[11px] text-slate-500">
              Nenhuma sincronização realizada ainda neste dispositivo.
            </p>
          )}

          <p className="text-slate-400 leading-relaxed">
            As corridas registradas no Strava são enviadas em tempo real via Webhook push e convertidas em dados analíticos (distância, ritmo, FC e splits quilométricos) para alimentar o plano periodizado do Running Coach AI.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2 flex-wrap">
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Agora'}</span>
          </button>

          <button
            type="button"
            onClick={handleConnectStrava}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold shadow-md shadow-orange-500/20 transition cursor-pointer"
          >
            <span>{stravaConnected ? 'Reconectar Strava' : 'Conectar Strava'}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Security & System Info */}
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/30 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-slate-400" />
          <span>Segurança de Dados e Armazenamento Local Singleton</span>
        </div>
        <span>Personal Trainer v2.0 Multi-Sport</span>
      </div>
    </div>
  );
}
