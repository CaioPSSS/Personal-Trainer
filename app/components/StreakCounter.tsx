'use client';

import React, { useState, useEffect } from 'react';
import { Flame, Trophy, Award, Sparkles } from 'lucide-react';

interface StreakCounterProps {
  currentStreak?: number;
  recordStreak?: number;
}

interface MilestoneInfo {
  label: string;
  badgeClass: string;
  description: string;
}

function getMilestoneInfo(streak: number): MilestoneInfo {
  if (streak >= 30) {
    return {
      label: '👑 Modo Lendário',
      badgeClass: 'bg-gradient-to-r from-amber-500/25 via-rose-500/25 to-purple-500/25 border-amber-400/50 text-amber-300 shadow-amber-500/20',
      description: 'Mais de 30 dias de disciplina inabalável! Hábito de elite construído.',
    };
  }
  if (streak >= 14) {
    return {
      label: '🛡️ Consistência de Aço',
      badgeClass: 'bg-gradient-to-r from-indigo-500/25 to-emerald-500/25 border-emerald-400/50 text-emerald-300 shadow-emerald-500/20',
      description: '2 semanas consecutivas sem falhar! O corpo já se adaptou.',
    };
  }
  if (streak >= 7) {
    return {
      label: '🔥 Em Chamas!',
      badgeClass: 'bg-gradient-to-r from-amber-500/25 to-rose-500/25 border-orange-500/40 text-orange-300 shadow-orange-500/20',
      description: '1 semana completa de constância ativa! Mantenha a chama acesa.',
    };
  }
  if (streak >= 3) {
    return {
      label: '⚡ Ritmo Imparável',
      badgeClass: 'bg-amber-500/20 border-amber-500/30 text-amber-300 shadow-amber-500/10',
      description: 'O momento está a seu favor! Continue acelerando.',
    };
  }
  if (streak >= 1) {
    return {
      label: '🔥 Aquecendo',
      badgeClass: 'bg-slate-800/80 border-slate-700 text-slate-300',
      description: 'Constância ativa! Conclua a sessão de hoje para avançar.',
    };
  }
  return {
    label: '🌱 Primeiro Passo',
    badgeClass: 'bg-slate-800/60 border-slate-700/60 text-slate-400',
    description: 'Comece sua sequência concluindo qualquer atividade hoje.',
  };
}

export default function StreakCounter({
  currentStreak: propStreak,
  recordStreak = 12,
}: StreakCounterProps) {
  // When prop is provided, use it directly (no state mirror needed).
  // When no prop is provided, fetch asynchronously.
  const [fetchedStreak, setFetchedStreak] = useState<number | null>(null);
  const [loading, setLoading] = useState(propStreak === undefined);

  useEffect(() => {
    // Only fetch when no prop is provided
    if (propStreak !== undefined) return;
    let active = true;
    fetch('/api/analytics')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && typeof json?.streak === 'number') setFetchedStreak(json.streak);
      })
      .catch((err) => console.error('[StreakCounter]', err))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive final streak value without any state-in-effect
  const streak = propStreak ?? fetchedStreak ?? 0;
  const milestone = getMilestoneInfo(streak);
  const isHighStreak = streak >= 7;

  if (loading) {
    return (
      <div className="glass-card p-5 animate-pulse h-28 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-800" />
          <div className="space-y-2">
            <div className="h-6 w-24 bg-slate-800 rounded" />
            <div className="h-3 w-40 bg-slate-800 rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`glass-card p-5 relative overflow-hidden flex items-center justify-between transition-all duration-300 ${
        isHighStreak ? 'border-amber-500/40 shadow-lg shadow-orange-500/10' : ''
      }`}
    >
      {isHighStreak && (
        <div className="absolute -right-8 -top-8 w-36 h-36 bg-gradient-to-br from-amber-500/20 via-orange-500/15 to-transparent rounded-full blur-2xl pointer-events-none" />
      )}

      <div className="flex items-center gap-4">
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-500 relative ${
            streak > 0
              ? 'bg-gradient-to-br from-amber-500/20 via-orange-500/20 to-rose-500/20 border-orange-500/50 text-orange-400 shadow-lg shadow-orange-500/25'
              : 'bg-slate-800/60 border-slate-700 text-slate-500'
          }`}
        >
          <Flame
            className={`w-6 h-6 fill-current transition-transform duration-300 ${
              streak > 0 ? 'animate-bounce drop-shadow-[0_2px_8px_rgba(249,115,22,0.6)]' : ''
            }`}
          />
          {streak >= 7 && (
            <Sparkles className="w-3 h-3 text-amber-300 absolute -top-1 -right-1 animate-ping" />
          )}
        </div>

        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500">
              {streak} {streak === 1 ? 'Dia' : 'Dias'}
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Consecutivos
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1 max-w-[220px] sm:max-w-none">
            {milestone.description}
          </p>
        </div>
      </div>

      <div className="hidden sm:flex flex-col items-end gap-1.5">
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border shadow-sm ${milestone.badgeClass}`}
        >
          <Award className="w-3 h-3" />
          <span>{milestone.label}</span>
        </span>

        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Trophy className="w-3.5 h-3.5 text-amber-400" />
          <span>Recorde:</span>
          <strong className="text-slate-200 font-bold">{Math.max(streak, recordStreak)} dias</strong>
        </div>
      </div>
    </div>
  );
}
