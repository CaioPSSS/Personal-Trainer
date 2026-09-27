'use client';

import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Footprints, Target } from 'lucide-react';
import { useIsClient } from '@/app/hooks/useIsClient';

export interface VolumeDataPoint {
  weekLabel: string;
  actualKm: number;
  targetKm: number;
}

interface WeeklyVolumeChartProps {
  data?: VolumeDataPoint[];
}

export default function WeeklyVolumeChart({ data: initialData }: WeeklyVolumeChartProps) {
  const isClient = useIsClient();
  const [data, setData] = useState<VolumeDataPoint[]>(initialData ?? []);
  const [isLoading, setIsLoading] = useState(!initialData);

  useEffect(() => {
    if (initialData !== undefined) return;
    let active = true;
    fetch('/api/analytics')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && json?.volumeData) setData(json.volumeData);
      })
      .catch((err) => console.error('[WeeklyVolumeChart]', err))
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

  const latest = data.length > 0 ? data[data.length - 1] : null;

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Footprints className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">Volume Semanal de Corrida</h3>
            <p className="text-xs text-slate-400">Quilometragem acumulada versus meta semanal planejada</p>
          </div>
        </div>

        {latest && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/80 text-xs self-start sm:self-auto">
            <Target className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">Semana Atual:</span>
            <strong className="text-emerald-300 font-bold">
              {latest.actualKm.toFixed(1)} / {latest.targetKm.toFixed(1)} km
            </strong>
          </div>
        )}
      </div>

      {data.length === 0 ? (
        <div className="h-[260px] flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-2">
          <Footprints className="w-10 h-10 text-slate-600 stroke-[1.5]" />
          <p className="text-sm font-semibold text-slate-300">Nenhum dado de volume acumulado</p>
          <p className="text-xs max-w-sm text-slate-500">
            Conclua treinos de corrida para preencher as barras semanais e acompanhar a meta de periodização.
          </p>
        </div>
      ) : (
        <div className="h-[280px] w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
              <XAxis
                dataKey="weekLabel"
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                unit=" km"
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0]?.payload as VolumeDataPoint;
                    const diff = Math.round((d.actualKm - d.targetKm) * 10) / 10;
                    return (
                      <div className="rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur-xl p-3 shadow-xl text-xs space-y-1">
                        <p className="font-bold text-slate-200">{label}</p>
                        <div className="flex items-center justify-between gap-4 text-emerald-400">
                          <span>Realizado:</span>
                          <span className="font-bold">{d.actualKm.toFixed(1)} km</span>
                        </div>
                        <div className="flex items-center justify-between gap-4 text-amber-400">
                          <span>Meta Alvo:</span>
                          <span className="font-bold">{d.targetKm.toFixed(1)} km</span>
                        </div>
                        <div className="pt-1 border-t border-slate-800 text-[10px] text-slate-400">
                          {diff >= 0 ? `+${diff} km acima da meta` : `${Math.abs(diff)} km restantes`}
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
                    {val === 'actualKm' ? 'Volume Realizado (km)' : 'Meta Planejada (km)'}
                  </span>
                )}
              />
              <Bar
                dataKey="actualKm"
                name="actualKm"
                fill="#10b981"
                radius={[6, 6, 0, 0]}
                maxBarSize={48}
              />
              <Line
                type="stepAfter"
                dataKey="targetKm"
                name="targetKm"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={{ r: 3, fill: '#f59e0b', strokeWidth: 1.5, stroke: '#451a03' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
