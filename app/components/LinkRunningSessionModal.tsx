'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Link as LinkIcon,
  Unlink,
  Footprints,
  Calendar,
  CheckCircle2,
  Zap,
  Activity,
} from 'lucide-react';
import { useToast } from './ToastProvider';

export interface UnlinkedExecutionDTO {
  id: string;
  stravaActivityId?: string | null;
  date: string;
  source: string;
  distanceKm: number;
  durationSeconds: number;
  avgPaceSec?: number | null;
  notes?: string | null;
}

export interface CandidateSessionDTO {
  id: string;
  weekNumber: number;
  dayOfWeek: string;
  scheduledDate: string;
  sessionType: string;
  title: string;
  totalDistanceKm: number | null;
  totalDurationMin: number | null;
  status: string;
  linkedExecutions?: Array<{
    id: string;
    distanceKm: number;
    avgPaceSec?: number | null;
    source: string;
    date: string;
    notes?: string | null;
  }>;
}

interface LinkRunningSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialExecutionId?: string | null;
  initialSessionId?: string | null;
  initialDate?: string | null;
}

function formatPace(paceSec?: number | null): string {
  if (!paceSec || isNaN(paceSec)) return '--:--';
  const min = Math.floor(paceSec / 60);
  const sec = Math.round(paceSec % 60);
  return `${min}:${sec.toString().padStart(2, '0')}/km`;
}

function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (min >= 60) {
    const hours = Math.floor(min / 60);
    const remMin = min % 60;
    return `${hours}h ${remMin}m`;
  }
  return `${min}m ${sec}s`;
}

export default function LinkRunningSessionModal({
  isOpen,
  onClose,
  onSuccess,
  initialExecutionId,
  initialSessionId,
  initialDate,
}: LinkRunningSessionModalProps) {
  const { success, error: toastError, info } = useToast();

  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [unlinkedExecutions, setUnlinkedExecutions] = useState<UnlinkedExecutionDTO[]>([]);
  const [sessions, setSessions] = useState<CandidateSessionDTO[]>([]);

  // Selection states
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(
    initialExecutionId || null
  );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    initialSessionId || null
  );

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    async function load() {
      try {
        setLoading(true);
        const url = initialDate
          ? `/api/running/session/link?date=${initialDate}`
          : '/api/running/session/link';
        const res = await fetch(url);
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          if (!active) return;
          setUnlinkedExecutions(data.unlinkedExecutions || []);
          setSessions(data.sessions || []);
          if (initialExecutionId) setSelectedExecutionId(initialExecutionId);
          if (initialSessionId) setSelectedSessionId(initialSessionId);
        }
      } catch (err) {
        console.error('Erro ao buscar dados para vínculo:', err);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [isOpen, initialDate, initialExecutionId, initialSessionId]);

  // Find objects
  const currentExecution = useMemo(() => {
    return unlinkedExecutions.find((e) => e.id === selectedExecutionId) || null;
  }, [unlinkedExecutions, selectedExecutionId]);

  // Filter candidate sessions: prioritize sessions in the same week or date
  const candidateSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      // If we have an execution date, prioritize matching dates
      if (currentExecution) {
        const aMatchesDate = a.scheduledDate === currentExecution.date ? 1 : 0;
        const bMatchesDate = b.scheduledDate === currentExecution.date ? 1 : 0;
        if (aMatchesDate !== bMatchesDate) return bMatchesDate - aMatchesDate;
      }
      return a.scheduledDate.localeCompare(b.scheduledDate);
    });
  }, [sessions, currentExecution]);

  // Handle Submit Link
  const handleLink = async () => {
    if (!selectedExecutionId || !selectedSessionId) {
      toastError('Selecione uma corrida realizada e um treino do plano para vincular.');
      return;
    }

    setIsSubmitting(true);
    info('Vinculando atividade ao plano de treino...', 'Vínculo Strava');
    try {
      const res = await fetch('/api/running/session/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'link',
          executionId: selectedExecutionId,
          sessionId: selectedSessionId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Falha ao vincular treino.');
      }

      success(
        data.message || 'Corrida vinculada ao plano e calendário com sucesso!',
        'Treino Vinculado'
      );
      window.dispatchEvent(new CustomEvent('calendar-refresh'));
      onSuccess?.();
      onClose();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Erro ao vincular corrida.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Unlink
  const handleUnlink = async (executionId: string) => {
    setIsSubmitting(true);
    info('Desvinculando atividade...', 'Vínculo Strava');
    try {
      const res = await fetch('/api/running/session/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unlink',
          executionId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Falha ao desvincular treino.');
      }

      success(
        data.message || 'Corrida desvinculada do plano com sucesso.',
        'Vínculo Removido'
      );
      window.dispatchEvent(new CustomEvent('calendar-refresh'));
      onSuccess?.();
      onClose();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Erro ao desvincular corrida.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <div className="glass-card w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl border border-emerald-500/30 bg-slate-900/95 shadow-2xl overflow-hidden animate-scaleUp">
        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <LinkIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>Vincular Corrida ao Plano</span>
              </h2>
              <p className="text-xs text-slate-400">
                Associe corridas do Strava às sessões estruturadas do seu mesociclo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
              <span className="text-xs">Carregando treinos e corridas...</span>
            </div>
          ) : (
            <>
              {/* Step 1: Select Execution (Strava / Manual Run) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-emerald-400" />
                    <span>1. Selecione a Corrida Realizada:</span>
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {unlinkedExecutions.length} atividade(s) disponível(is)
                  </span>
                </div>

                {unlinkedExecutions.length === 0 && !selectedExecutionId ? (
                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-center space-y-1 text-xs text-slate-400">
                    <p className="font-semibold text-slate-300">
                      Nenhuma corrida não vinculada encontrada recentemente.
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Sincronize com o Strava ou registre uma corrida manual para vincular.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {unlinkedExecutions.map((exec) => {
                      const isSelected = selectedExecutionId === exec.id;
                      return (
                        <div
                          key={exec.id}
                          onClick={() => setSelectedExecutionId(exec.id)}
                          className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-950/30 shadow-md shadow-emerald-500/10'
                              : 'border-slate-800/80 bg-slate-950/40 hover:bg-slate-800/40 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                exec.source === 'strava'
                                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              }`}
                            >
                              <Footprints className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-100 truncate">
                                {exec.notes || (exec.source === 'strava' ? 'Corrida Strava' : 'Corrida Manual')}
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                                <span>{exec.date}</span>
                                <span>•</span>
                                <span className="font-semibold text-emerald-300">
                                  {exec.distanceKm.toFixed(1)} km
                                </span>
                                <span>•</span>
                                <span>{formatDuration(exec.durationSeconds)}</span>
                                {exec.avgPaceSec && (
                                  <>
                                    <span>•</span>
                                    <span className="font-mono text-slate-300">
                                      {formatPace(exec.avgPaceSec)}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {isSelected ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <div className="w-4 h-4 rounded-full border border-slate-700" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Step 2: Select Planned Session */}
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                    <span>2. Selecione o Treino do Plano que foi Realizado:</span>
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {candidateSessions.length} sessão(ões) no plano
                  </span>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {candidateSessions.map((session) => {
                    const isSelected = selectedSessionId === session.id;
                    const isCompleted = session.status === 'completed';
                    const hasLink = (session.linkedExecutions?.length ?? 0) > 0;

                    return (
                      <div
                        key={session.id}
                        onClick={() => setSelectedSessionId(session.id)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-950/30 shadow-md shadow-indigo-500/10'
                            : 'border-slate-800/80 bg-slate-950/40 hover:bg-slate-800/40 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                            <Zap className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-slate-100 truncate">
                                {session.title}
                              </span>
                              {isCompleted && (
                                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded border border-emerald-500/30">
                                  {hasLink ? 'Vinculado' : 'Concluído'}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-400">
                              <span>Semana {session.weekNumber}</span>
                              <span>•</span>
                              <span>{session.scheduledDate}</span>
                              {session.totalDistanceKm && (
                                <>
                                  <span>•</span>
                                  <span className="font-semibold text-slate-300">
                                    {session.totalDistanceKm.toFixed(1)} km previsto
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          {hasLink && session.linkedExecutions?.[0] && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUnlink(session.linkedExecutions![0].id);
                              }}
                              className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 transition flex items-center gap-1"
                              title="Desvincular esta corrida do treino"
                            >
                              <Unlink className="w-3 h-3" />
                              <span>Desvincular</span>
                            </button>
                          )}
                          <div>
                            {isSelected ? (
                              <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                            ) : (
                              <div className="w-4 h-4 rounded-full border border-slate-700" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between gap-3 bg-slate-950/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-400 hover:text-slate-200 transition cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleLink}
            disabled={!selectedExecutionId || !selectedSessionId || isSubmitting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-bold transition shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <LinkIcon className="w-4 h-4" />
            <span>{isSubmitting ? 'Vinculando...' : 'Confirmar Vínculo'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
