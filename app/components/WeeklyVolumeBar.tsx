'use client';

import React, { useState, useEffect } from 'react';
import { Dumbbell, Footprints, Flame, TrendingUp } from 'lucide-react';

export interface MetricVolume {
  current: number;
  target: number;
  unit: string;
}

interface WeeklyVolumeBarProps {
  strength?: MetricVolume;
  running?: MetricVolume;
  crossTraining?: MetricVolume;
}

const DEFAULT_STRENGTH: MetricVolume = { current: 0, target: 16, unit: 'séries' };
const DEFAULT_RUNNING: MetricVolume = { current: 0, target: 20.0, unit: 'km' };
const DEFAULT_CROSS: MetricVolume = { current: 0, target: 2, unit: 'sessões' };

export default function WeeklyVolumeBar({
  strength: propStrength,
  running: propRunning,
  crossTraining: propCross,
}: WeeklyVolumeBarProps) {
  // When props are provided, use them directly.
  // When no props, fetch asynchronously and store in fetched* state.
  const hasProps = !!(propStrength || propRunning || propCross);
  const [fetched, setFetched] = useState<{
    strength: MetricVolume;
    running: MetricVolume;
    crossTraining: MetricVolume;
  } | null>(null);
  const [loading, setLoading] = useState(!hasProps);

  useEffect(() => {
    if (hasProps) return;
    let active = true;
    fetch('/api/analytics')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && json?.weeklyVolume) {
          const wv = json.weeklyVolume;
          setFetched({
            strength: {
              current: wv.strength?.completedSets ?? 0,
              target: wv.strength?.targetSets ?? 16,
              unit: 'séries',
            },
            running: {
              current: wv.running?.completedKm ?? 0,
              target: wv.running?.targetKm ?? 20.0,
              unit: 'km',
            },
            crossTraining: {
              current: wv.crossTraining?.completedSessions ?? 0,
              target: wv.crossTraining?.targetSessions ?? 2,
              unit: 'sessões',
            },
          });
        }
      })
      .catch((err) => console.error('[WeeklyVolumeBar]', err))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive final values at render time — no setState needed for prop changes
  const strength = propStrength ?? fetched?.strength ?? DEFAULT_STRENGTH;
  const running = propRunning ?? fetched?.running ?? DEFAULT_RUNNING;
  const crossTraining = propCross ?? fetched?.crossTraining ?? DEFAULT_CROSS;

  const calcPercent = (curr: number, tgt: number) => {
    if (!tgt || tgt <= 0) return 0;
    return Math.min(100, Math.round((curr / tgt) * 100));
  };

  const strengthPct = calcPercent(strength.current, strength.target);
  const runningPct = calcPercent(running.current, running.target);
  const crossPct = calcPercent(crossTraining.current, crossTraining.target);

  const overallAdherence = Math.round((strengthPct + runningPct + crossPct) / 3);

  const getAdherenceBadge = (pct: number) => {
    if (pct >= 80) {
      return {
        label: 'Meta Próxima',
        className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      };
    }
    if (pct >= 40) {
      return {
        label: 'Em Progresso',
        className: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      };
    }
    return {
      label: 'Início da Semana',
      className: 'bg-slate-800 text-slate-400 border-slate-700',
    };
  };

  const badge = getAdherenceBadge(overallAdherence);

  if (loading) {
    return (
      <div className="glass-card p-5 space-y-4 animate-pulse">
        <div className="flex justify-between items-center">
          <div className="h-4 bg-slate-800 rounded w-48" />
          <div className="h-4 bg-slate-800 rounded w-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-20 bg-slate-900/60 rounded-xl" />
          <div className="h-20 bg-slate-900/60 rounded-xl" />
          <div className="h-20 bg-slate-900/60 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">Volume Semanal Acumulado</h3>
            <p className="text-xs text-slate-400">Progresso contra os alvos planejados da semana</p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs text-slate-400 font-medium">Adesão Geral:</span>
          <span
            className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${badge.className}`}
          >
            {overallAdherence}% • {badge.label}
          </span>
        </div>
      </div>

      {/* Progress Bars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
        {/* Strength (Indigo) */}
        <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-indigo-300">
              <Dumbbell className="w-3.5 h-3.5 text-indigo-400" />
              Musculação
            </span>
            <span className="text-slate-200 font-bold">
              {strength.current} / {strength.target} {strength.unit}
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-indigo-500 to-indigo-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${strengthPct}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-slate-400">
            <span>Séries efetivas</span>
            <span className="font-semibold text-indigo-300">{strengthPct}%</span>
          </div>
        </div>

        {/* Running (Emerald) */}
        <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-emerald-300">
              <Footprints className="w-3.5 h-3.5 text-emerald-400" />
              Corrida
            </span>
            <span className="text-slate-200 font-bold">
              {typeof running.current === 'number' ? running.current.toFixed(1) : running.current} / {running.target} {running.unit}
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${runningPct}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-slate-400">
            <span>Quilometragem</span>
            <span className="font-semibold text-emerald-300">{runningPct}%</span>
          </div>
        </div>

        {/* Cross-Training (Amber) */}
        <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-amber-300">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              Cross-Training
            </span>
            <span className="text-slate-200 font-bold">
              {crossTraining.current} / {crossTraining.target} {crossTraining.unit}
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-amber-500 to-amber-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${crossPct}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-slate-400">
            <span>Sessões complementares</span>
            <span className="font-semibold text-amber-300">{crossPct}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
