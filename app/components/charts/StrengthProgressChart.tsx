'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
import { Dumbbell, TrendingUp, Layers } from 'lucide-react';
import { useIsClient } from '@/app/hooks/useIsClient';

export interface StrengthDataPoint {
  exerciseName: string;
  date: string;
  maxLoadKg: number;
  totalVolumeLoadKg: number;
}

interface StrengthProgressChartProps {
  data?: StrengthDataPoint[];
}

export default function StrengthProgressChart({ data: initialData }: StrengthProgressChartProps) {
  const isClient = useIsClient();
  const [data, setData] = useState<StrengthDataPoint[]>(initialData ?? []);
  const [isLoading, setIsLoading] = useState(!initialData);
  // Default to empty string; will be derived reactively from exercises list
  const [selectedExercise, setSelectedExercise] = useState<string>('');

  useEffect(() => {
    if (initialData !== undefined) return;
    let active = true;
    fetch('/api/analytics')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && json?.strengthData) setData(json.strengthData);
      })
      .catch((err) => console.error('[StrengthProgressChart]', err))
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Extract unique exercises from data
  const exercises = useMemo(() => {
    const set = new Set<string>();
    data.forEach((d) => {
      if (d.exerciseName) set.add(d.exerciseName);
    });
    return Array.from(set).sort();
  }, [data]);

  // Derive selectedExercise purely from the exercises list (no useEffect)
  const activeExercise = useMemo(() => {
    if (exercises.length === 0) return '';
    if (selectedExercise && exercises.includes(selectedExercise)) return selectedExercise;
    // Prioritize common compound lifts if present
    const compoundPriority = exercises.find((ex) =>
      /supino|agachamento|leg press|remada|hack|levantamento|barra/i.test(ex)
    );
    return compoundPriority ?? exercises[0];
  }, [exercises, selectedExercise]);

  // Filter and deduplicate data points for selected exercise by date
  const filteredData = useMemo(() => {
    if (!activeExercise) return [];
    const points = data.filter((d) => d.exerciseName === activeExercise);
    const byDate = new Map<string, StrengthDataPoint>();
    for (const p of points) {
      const existing = byDate.get(p.date);
      if (!existing || p.maxLoadKg > existing.maxLoadKg) {
        byDate.set(p.date, p);
      }
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data, activeExercise]);

  if (!isClient || isLoading) {
    return (
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between animate-pulse">
          <div className="h-5 bg-slate-800 rounded w-48" />
          <div className="h-9 bg-slate-800 rounded w-36" />
        </div>
        <div className="h-[280px] bg-slate-900/40 rounded-xl animate-pulse" />
      </div>
    );
  }

  let loadDelta: number | null = null;
  if (filteredData.length >= 2) {
    const firstLoad = filteredData[0].maxLoadKg;
    const lastLoad = filteredData[filteredData.length - 1].maxLoadKg;
    if (firstLoad > 0) {
      loadDelta = Math.round((lastLoad - firstLoad) * 10) / 10;
    }
  }

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Dumbbell className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">Progressão de Carga em Hipertrofia</h3>
            <p className="text-xs text-slate-400">
              Sobrecarga progressiva nos blocos ativo e anterior
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {loadDelta !== null && (
            <div
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                loadDelta >= 0
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
              }`}
            >
              <TrendingUp className={`w-3.5 h-3.5 ${loadDelta < 0 ? 'rotate-180' : ''}`} />
              <span>
                {loadDelta >= 0 ? `+${loadDelta} kg` : `${loadDelta} kg`}
              </span>
            </div>
          )}

          {exercises.length > 0 && (
            <div className="relative">
              <select
                value={activeExercise}
                onChange={(e) => setSelectedExercise(e.target.value)}
                aria-label="Selecionar exercício para visualizar histórico"
                className="bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-200 focus:outline-none focus:border-indigo-500 transition cursor-pointer max-w-[200px] truncate"
              >
                {exercises.map((ex) => (
                  <option key={ex} value={ex} className="bg-slate-900 text-slate-200">
                    {ex}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {exercises.length === 0 || filteredData.length === 0 ? (
        <div className="h-[260px] flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-2">
          <Layers className="w-10 h-10 text-slate-600 stroke-[1.5]" />
          <p className="text-sm font-semibold text-slate-300">Sem registros de séries concluídas</p>
          <p className="text-xs max-w-sm text-slate-500">
            Conclua treinos diários de musculação preenchendo as cargas das séries para traçar a evolução nos blocos atual e anterior.
          </p>
        </div>
      ) : (
        <div className="h-[280px] w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={filteredData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
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
                unit=" kg"
                domain={['dataMin - 5', 'dataMax + 5']}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0]?.payload as StrengthDataPoint;
                    return (
                      <div className="rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur-xl p-3 shadow-xl text-xs space-y-1">
                        <p className="font-bold text-slate-200">{label}</p>
                        <p className="text-indigo-300 font-semibold truncate max-w-[200px]">
                          {d.exerciseName}
                        </p>
                        <div className="flex items-center justify-between gap-4 text-indigo-400 pt-1 border-t border-slate-800">
                          <span>Carga Máxima:</span>
                          <span className="font-bold font-mono">{d.maxLoadKg} kg</span>
                        </div>
                        <div className="flex items-center justify-between gap-4 text-slate-400 text-[10px]">
                          <span>Volume Total:</span>
                          <span className="font-mono">{d.totalVolumeLoadKg} kg</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                formatter={() => (
                  <span className="text-slate-300 font-medium">
                    Carga Máxima Efetiva (kg)
                  </span>
                )}
              />
              <Line
                type="monotone"
                dataKey="maxLoadKg"
                name="maxLoadKg"
                stroke="#6366f1"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#6366f1', strokeWidth: 1.5, stroke: '#1e1b4b' }}
                activeDot={{ r: 6, stroke: '#a5b4fc', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
