'use client';

import React, { useState } from 'react';
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
