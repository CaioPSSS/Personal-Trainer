'use client';

import React, { useEffect, useState } from 'react';
import { X, Trophy, TrendingUp, Calendar, Dumbbell } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface ExerciseHistoryModalProps {
  exerciseName: string | null;
  onClose: () => void;
}

interface SessionHistorySet {
  setNumber: number;
  loadKg: number;
  reps: number;
  rpe?: number | null;
  isFailure?: boolean;
  e1RM: number;
}

interface SessionHistoryEntry {
  date: string;
  exerciseName: string;
  movementPattern?: string | null;
  maxLoadKg: number;
  bestEstimated1RM: number;
  totalTonnageKg: number;
  bestSetLabel: string;
  sets: SessionHistorySet[];
}

interface ExerciseHistoryResponse {
  exerciseName: string;
  totalSessions: number;
  allTimeMaxLoadKg: number;
  allTimeBest1RM: number;
  allTimeBestSetLabel: string;
  sessions: SessionHistoryEntry[];
}

export default function ExerciseHistoryModal({
  exerciseName,
  onClose,
}: ExerciseHistoryModalProps) {
  const [data, setData] = useState<ExerciseHistoryResponse | null>(null);
  const [loadedExercise, setLoadedExercise] = useState<string | null>(null);
  const loading = Boolean(exerciseName && loadedExercise !== exerciseName);

  useEffect(() => {
    if (!exerciseName) return;
    let isMounted = true;

    fetch(`/api/workout/exercise-history?name=${encodeURIComponent(exerciseName)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (isMounted) {
          if (json) setData(json);
          setLoadedExercise(exerciseName);
        }
      })
      .catch((err) => {
        console.error('Erro ao buscar histórico do exercício:', err);
        if (isMounted) setLoadedExercise(exerciseName);
      });

    return () => {
      isMounted = false;
    };
  }, [exerciseName]);

  useEffect(() => {
    if (!exerciseName) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [exerciseName, onClose]);

  if (!exerciseName) return null;

  const chartData = (data?.sessions ?? []).map((s) => {
    const [, m, d] = s.date.split('-');
    return {
      dateLabel: `${d}/${m}`,
      maxLoadKg: s.maxLoadKg,
      e1RM: s.bestEstimated1RM,
    };
  });

  const reversedSessions = [...(data?.sessions ?? [])].reverse();

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-3xl border border-slate-700/80 bg-slate-900 p-6 shadow-2xl space-y-5 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 block">
                Histórico & Progressão Real
              </span>
              <h3 className="text-lg font-extrabold text-slate-100">{exerciseName}</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <span className="h-8 w-8 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-slate-400">Carregando histórico de sessões e e1RM...</span>
          </div>
        ) : !data || data.sessions.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <Dumbbell className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-sm font-bold text-slate-300">Nenhuma sessão anterior registrada</p>
            <p className="text-xs text-slate-500">
              Assim que você concluir séries deste exercício, sua curva de carga e 1RM estimado aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* PR Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  Maior Carga
                </span>
                <p className="text-xl font-black text-slate-100 mt-1">{data.allTimeMaxLoadKg} kg</p>
                <span className="text-[10px] text-slate-500">{data.totalSessions} sessões registradas</span>
              </div>
              <div className="bg-slate-950/70 border border-indigo-500/30 rounded-2xl p-3.5">
                <span className="text-[10px] uppercase font-bold text-indigo-300">
                  1RM Estimado (e1RM)
                </span>
                <p className="text-xl font-black text-indigo-300 mt-1">{data.allTimeBest1RM} kg</p>
                <span className="text-[10px] text-slate-400">Fórmula Epley + RIR</span>
              </div>
              <div className="bg-slate-950/70 border border-emerald-500/30 rounded-2xl p-3.5">
                <span className="text-[10px] uppercase font-bold text-emerald-300">
                  Melhor Série Histórica
                </span>
                <p className="text-xs font-bold text-emerald-200 mt-1.5">{data.allTimeBestSetLabel}</p>
              </div>
            </div>

            {/* Chart */}
            {chartData.length >= 2 && (
              <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Curva de Evolução: Carga Máxima vs. e1RM (kg)
                </h4>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="dateLabel" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} domain={['auto', 'auto']} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '12px',
                          fontSize: '12px',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="e1RM"
                        name="1RM Estimado (kg)"
                        stroke="#818cf8"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="maxLoadKg"
                        name="Carga Máx (kg)"
                        stroke="#34d399"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Session Log Table */}
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Últimas Execuções ({reversedSessions.length})
              </h4>
              {reversedSessions.slice(0, 12).map((session, idx) => (
                <div
                  key={`${session.date}-${idx}`}
                  className="bg-slate-950/60 border border-slate-800/90 rounded-xl p-3 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                      {session.date}
                    </span>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-indigo-300 font-semibold">
                        e1RM: {session.bestEstimated1RM} kg
                      </span>
                      <span className="text-slate-500">•</span>
                      <span className="text-slate-400 font-mono">
                        Vol: {session.totalTonnageKg} kg
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {session.sets.map((s) => (
                      <span
                        key={s.setNumber}
                        className="text-[11px] bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-lg text-slate-300 font-mono"
                      >
                        S{s.setNumber}: {s.loadKg}kg × {s.reps}
                        {s.rpe ? ` @${s.rpe}` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
