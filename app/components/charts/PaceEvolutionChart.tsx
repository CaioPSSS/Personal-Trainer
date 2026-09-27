'use client';

import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Timer, TrendingDown } from 'lucide-react';
import { useIsClient } from '@/app/hooks/useIsClient';

export interface PaceDataPoint {
  date: string;
  pace5kSec: number;
  pace10kSec: number;
  formatted5k: string;
  formatted10k: string;
}

interface PaceEvolutionChartProps {
  data?: PaceDataPoint[];
}

function formatPace(sec?: number | null): string {
  if (!sec || isNaN(sec) || sec <= 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function PaceEvolutionChart({ data: initialData }: PaceEvolutionChartProps) {
  const isClient = useIsClient();
  const [data, setData] = useState<PaceDataPoint[]>(initialData ?? []);
  const [isLoading, setIsLoading] = useState(!initialData);

  useEffect(() => {
    // Only fetch if no initial data was provided
    if (initialData !== undefined) return;
    let active = true;
    fetch('/api/analytics')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && json?.paceData) setData(json.paceData);
      })
      .catch((err) => console.error('[PaceEvolutionChart]', err))
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isClient || isLoading) {
    return (
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between animate-pulse">
          <div className="h-5 bg-slate-800 rounded w-48" />
          <div className="h-4 bg-slate-800 rounded w-24" />
        </div>
        <div className="h-[280px] bg-slate-900/40 rounded-xl animate-pulse" />
      </div>
    );
  }

  let paceImprovement: number | null = null;
  if (data.length >= 2) {
    const first5k = data[0].pace5kSec;
    const last5k = data[data.length - 1].pace5kSec;
    if (first5k > 0 && last5k > 0) {
      paceImprovement = first5k - last5k;
    }
  }

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Timer className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">Evolução de Ritmo (Pace)</h3>
            <p className="text-xs text-slate-400">Tendência de velocidade para distâncias 5K e 10K</p>
          </div>
        </div>

        {paceImprovement !== null && paceImprovement > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold self-start sm:self-auto">
            <TrendingDown className="w-3.5 h-3.5 rotate-180" />
            <span>-{paceImprovement}s/km de melhora</span>
          </div>
        )}
      </div>

      {data.length === 0 ? (
        <div className="h-[260px] flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-2">
          <Timer className="w-10 h-10 text-slate-600 stroke-[1.5]" />
          <p className="text-sm font-semibold text-slate-300">Sem histórico suficiente de corridas</p>
          <p className="text-xs max-w-sm text-slate-500">
            Conecte o Strava ou registre suas corridas manuais para acompanhar a curva de ritmo ao longo das semanas.
          </p>
        </div>
      ) : (
        <div className="h-[280px] w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
              <XAxis
                dataKey="date"
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickFormatter={(val: string) => {
                  if (!val || !val.includes('-')) return val;
                  const parts = val.split('-');
                  return `${parts[2]}/${parts[1]}`;
                }}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickFormatter={(val: number) => formatPace(val)}
                domain={['dataMin - 15', 'dataMax + 15']}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0]?.payload as PaceDataPoint;
                    return (
                      <div className="rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur-xl p-3 shadow-xl text-xs space-y-1">
                        <p className="font-bold text-slate-200">{label}</p>
                        <div className="flex items-center justify-between gap-4 text-emerald-400">
                          <span>Pace 5K:</span>
                          <span className="font-mono font-bold">{d.formatted5k}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4 text-cyan-400">
                          <span>Pace 10K:</span>
                          <span className="font-mono font-bold">{d.formatted10k}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                formatter={(val) => (
                  <span className="text-slate-300 font-medium">
                    {val === 'pace5kSec' ? 'Pace 5K' : 'Pace 10K'}
                  </span>
                )}
              />
              <Line
                type="monotone"
                dataKey="pace5kSec"
                name="pace5kSec"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#10b981', strokeWidth: 1.5, stroke: '#022c22' }}
                activeDot={{ r: 6, stroke: '#6ee7b7', strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="pace10kSec"
                name="pace10kSec"
                stroke="#06b6d4"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={{ r: 3, fill: '#06b6d4', strokeWidth: 1.5, stroke: '#083344' }}
                activeDot={{ r: 5, stroke: '#67e8f9', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
