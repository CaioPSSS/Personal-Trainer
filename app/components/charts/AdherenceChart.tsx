'use client';

import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { CheckCircle2 } from 'lucide-react';
import { useIsClient } from '@/app/hooks/useIsClient';

export interface AdherenceDataPoint {
  weekLabel: string;
  completedCount: number;
  plannedCount: number;
  skippedCount: number;
  percentage: number;
}

interface AdherenceChartProps {
  data?: AdherenceDataPoint[];
  mini?: boolean;
}

export default function AdherenceChart({ data: initialData, mini = false }: AdherenceChartProps) {
  const isClient = useIsClient();
  const [data, setData] = useState<AdherenceDataPoint[]>(initialData ?? []);
  const [isLoading, setIsLoading] = useState(!initialData);

  useEffect(() => {
    if (initialData !== undefined) return;
    let active = true;
    fetch('/api/analytics')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && json?.adherenceData) setData(json.adherenceData);
      })
      .catch((err) => console.error('[AdherenceChart]', err))
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
        <div className="h-[240px] bg-slate-900/40 rounded-xl animate-pulse" />
      </div>
    );
  }

  const totalCompleted = data.reduce((s, d) => s + d.completedCount, 0);
  const totalAll = data.reduce(
    (s, d) => s + d.completedCount + d.plannedCount + d.skippedCount,
    0
  );
  const overallPct = totalAll > 0 ? Math.round((totalCompleted / totalAll) * 100) : 0;

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">Taxa de Aderência ao Treinamento</h3>
            <p className="text-xs text-slate-400">
              Sessões concluídas vs. planejadas vs. puladas por semana
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-xs text-indigo-300 font-bold self-start sm:self-auto">
          <span>Aderência Média:</span>
          <span className="text-emerald-300">{overallPct}%</span>
        </div>
      </div>

      {data.length === 0 || totalAll === 0 ? (
        <div className="h-[220px] flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-2">
          <CheckCircle2 className="w-10 h-10 text-slate-600 stroke-[1.5]" />
          <p className="text-sm font-semibold text-slate-300">Sem histórico de eventos no calendário</p>
          <p className="text-xs max-w-sm text-slate-500">
            Conforme suas sessões forem marcadas como concluídas ou puladas, a consistência semanal será visualizada aqui.
          </p>
        </div>
      ) : (
        <div className={mini ? 'h-[200px] w-full pt-1' : 'h-[260px] w-full pt-2'}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
              <XAxis
                dataKey="weekLabel"
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0]?.payload as AdherenceDataPoint;
                    return (
                      <div className="rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur-xl p-3 shadow-xl text-xs space-y-1.5">
                        <div className="flex items-center justify-between gap-4 font-bold text-slate-200 border-b border-slate-800 pb-1">
                          <span>{label}</span>
                          <span className="text-emerald-400">{d.percentage}% Aderência</span>
                        </div>
                        <div className="flex items-center justify-between gap-4 text-emerald-400">
                          <span>Concluídos:</span>
                          <span className="font-bold">{d.completedCount}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4 text-indigo-400">
                          <span>Planejados:</span>
                          <span className="font-bold">{d.plannedCount}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4 text-rose-400">
                          <span>Pulados:</span>
                          <span className="font-bold">{d.skippedCount}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                formatter={(val) => {
                  const labels: Record<string, string> = {
                    completedCount: 'Concluídos',
                    plannedCount: 'Planejados',
                    skippedCount: 'Pulados',
                  };
                  return (
                    <span className="text-slate-300 font-medium">
                      {labels[val] || val}
                    </span>
                  );
                }}
              />
              <Bar
                dataKey="completedCount"
                name="completedCount"
                stackId="a"
                fill="#10b981"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="plannedCount"
                name="plannedCount"
                stackId="a"
                fill="#6366f1"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="skippedCount"
                name="skippedCount"
                stackId="a"
                fill="#ef4444"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
