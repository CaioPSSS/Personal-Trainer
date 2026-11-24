'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Sparkles,
  Calendar,
  CheckCircle2,
  Dumbbell,
  Footprints,
  Loader2,
  X,
  Clock,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { useToast } from './ToastProvider';
import type {
  RunningCycleStatusResult,
  StrengthCycleStatusResult,
} from '@/lib/scheduling/cycle-status';

interface CyclesStatusResponse {
  today: string;
  strength: StrengthCycleStatusResult;
  running: RunningCycleStatusResult;
  anyNeedsRenewal: boolean;
}

export interface CycleRenewalPromptProps {
  scope?: 'all' | 'strength' | 'running';
  onRenewed?: () => void;
}

const SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000;

function formatShortDateBR(isoDate?: string | null): string {
  if (!isoDate || !isoDate.includes('-')) return '--';
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}

function computeSnoozeKey(
  scope: 'all' | 'strength' | 'running',
  data: CyclesStatusResponse
): string | null {
  const showStrength =
    (scope === 'all' || scope === 'strength') && data.strength.needsRenewal;
  const showRunning =
    (scope === 'all' || scope === 'running') && data.running.needsRenewal;
  if (!showStrength && !showRunning) return null;

  const parts: string[] = [`scope:${scope}`];
  if (showStrength) {
    parts.push(`s:${data.strength.planId ?? 'none'}:${data.strength.status}`);
  }
  if (showRunning) {
    parts.push(`r:${data.running.planId ?? 'none'}:${data.running.status}`);
  }
  return `personal-trainer-cycle-renewal-snooze::${parts.join('|')}`;
}

function readSnoozedState(key: string | null): boolean {
  if (!key || typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return false;
    const expiresAt = Number(raw);
    if (!isNaN(expiresAt) && Date.now() < expiresAt) {
      return true;
    }
    window.localStorage.removeItem(key);
    return false;
  } catch {
    return false;
  }
}

export default function CycleRenewalPrompt({
  scope = 'all',
  onRenewed,
}: CycleRenewalPromptProps) {
  const { success, error: toastError, info } = useToast();

  const [statusData, setStatusData] = useState<CyclesStatusResponse | null>(null);
  const [isSnoozed, setIsSnoozed] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [generateRunning, setGenerateRunning] = useState(false);
  const [generateStrength, setGenerateStrength] = useState(false);
  const [selectedStartDate, setSelectedStartDate] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [stepErrors, setStepErrors] = useState<string[]>([]);

  const fetchCycleStatus = useCallback(async (): Promise<CyclesStatusResponse | null> => {
    try {
      const res = await fetch('/api/cycles/status', { cache: 'no-store' });
      if (!res.ok) return null;
      return (await res.json()) as CyclesStatusResponse;
    } catch (err) {
      console.error('[CycleRenewalPrompt] Falha ao consultar status dos ciclos:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function syncStatus() {
      const json = await fetchCycleStatus();
      if (active && json) {
        setStatusData(json);
        setIsSnoozed(readSnoozedState(computeSnoozeKey(scope, json)));
      }
    }

    void syncStatus();

    const handleRefresh = () => {
      void syncStatus();
    };
    window.addEventListener('calendar-refresh', handleRefresh);
    return () => {
      active = false;
      window.removeEventListener('calendar-refresh', handleRefresh);
    };
  }, [fetchCycleStatus, scope]);

  const showStrength = Boolean(
    statusData &&
      (scope === 'all' || scope === 'strength') &&
      statusData.strength.needsRenewal
  );
  const showRunning = Boolean(
    statusData &&
      (scope === 'all' || scope === 'running') &&
      statusData.running.needsRenewal
  );

  const snoozeKey = useMemo(
    () => (statusData ? computeSnoozeKey(scope, statusData) : null),
    [statusData, scope]
  );

  const defaultSuggestedStartDate = useMemo(() => {
    if (!statusData) return '';
    if (showRunning && showStrength) {
      return statusData.running.suggestedStartDate >= statusData.strength.suggestedStartDate
        ? statusData.running.suggestedStartDate
        : statusData.strength.suggestedStartDate;
    }
    if (showRunning) return statusData.running.suggestedStartDate;
    if (showStrength) return statusData.strength.suggestedStartDate;
    return statusData.today;
  }, [statusData, showRunning, showStrength]);

  const defaultSuggestedStartLabel = useMemo(() => {
    if (!statusData) return '';
    if (showRunning && (!showStrength || statusData.running.suggestedStartDate >= statusData.strength.suggestedStartDate)) {
      return statusData.running.suggestedStartLabel;
    }
    if (showStrength) return statusData.strength.suggestedStartLabel;
    return '';
  }, [statusData, showRunning, showStrength]);

  const openConfirmationModal = () => {
    setGenerateRunning(showRunning);
    setGenerateStrength(showStrength);
    setSelectedStartDate(defaultSuggestedStartDate);
    setStepErrors([]);
    setProgressLabel(null);
    setIsModalOpen(true);
  };

  const handleSnooze = () => {
    if (snoozeKey && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(snoozeKey, String(Date.now() + SNOOZE_DURATION_MS));
      } catch {
        // Ignore storage errors
      }
      setIsSnoozed(true);
    }
    info('Aviso adiado por 24 horas. Você pode renovar a qualquer momento nas páginas de treino.', 'Lembrar Depois');
  };

  const handleConfirmRenewal = async () => {
    if (!generateRunning && !generateStrength) {
      toastError('Selecione pelo menos um módulo para gerar o próximo ciclo.');
      return;
    }

    setIsGenerating(true);
    setStepErrors([]);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (process.env.NEXT_PUBLIC_INTERNAL_SECRET) {
      headers['x-internal-token'] = process.env.NEXT_PUBLIC_INTERNAL_SECRET;
    }

    const errors: string[] = [];
    const generatedModules: string[] = [];
    let finalStartDate = selectedStartDate;

    const totalSteps = (generateRunning ? 1 : 0) + (generateStrength ? 1 : 0);
    let currentStep = 0;

    // 1. Always generate Running FIRST so Strength scheduler respects 48h leg synergy around new runs
    if (generateRunning) {
      currentStep++;
      setProgressLabel(
        `(${currentStep}/${totalSteps}) Running Coach AI gerando novo ciclo de 4 semanas...`
      );
      try {
        const res = await fetch('/api/running/generate', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            startDate: selectedStartDate || undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Falha ao gerar plano de corrida.');
        }
        if (data.startDate) finalStartDate = data.startDate;
        generatedModules.push('Corrida');
      } catch (err) {
        errors.push(
          `Corrida: ${err instanceof Error ? err.message : 'Erro desconhecido ao gerar.'}`
        );
      }
    }

    // 2. Generate Strength Mesocycle
    if (generateStrength) {
      currentStep++;
      setProgressLabel(
        `(${currentStep}/${totalSteps}) Master Coach AI projetando novo mesociclo de musculação...`
      );
      try {
        const res = await fetch('/api/coach/master/generate', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            startDate: selectedStartDate || undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || data.detail || 'Falha ao gerar bloco de musculação.');
        }
        if (data.startDate) finalStartDate = data.startDate;
        generatedModules.push('Musculação');
      } catch (err) {
        errors.push(
          `Musculação: ${err instanceof Error ? err.message : 'Erro desconhecido ao gerar.'}`
        );
      }
    }

    setIsGenerating(false);
    setProgressLabel(null);
    setStepErrors(errors);

    if (generatedModules.length > 0) {
      success(
        `Novo ciclo de ${generatedModules.join(' e ')} gerado com sucesso (início em ${formatShortDateBR(finalStartDate)})!`,
        'Ciclo Renovado'
      );
      window.dispatchEvent(new CustomEvent('calendar-refresh'));
      const refreshed = await fetchCycleStatus();
      if (refreshed) setStatusData(refreshed);
      onRenewed?.();
    }

    if (errors.length === 0) {
      setIsModalOpen(false);
    } else if (generatedModules.length === 0) {
      toastError(errors[0], 'Falha na Renovação');
    }
  };

  if (!statusData || (!showStrength && !showRunning) || isSnoozed) {
    return null;
  }

  const isCompletedStatus =
    (showStrength && statusData.strength.status === 'completed') ||
    (showRunning && statusData.running.status === 'completed');

  const headline =
    showStrength && showRunning
      ? 'Ciclos de Musculação e Corrida concluídos!'
      : showStrength
        ? statusData.strength.status === 'completed'
          ? 'Último treino do mesociclo concluído!'
          : 'Período do mesociclo de musculação encerrado'
        : statusData.running.status === 'completed'
          ? 'Última corrida do ciclo concluída!'
          : 'Período do plano de corrida encerrado';

  const summaryItems: string[] = [];
  if (showStrength && statusData.strength.reason) {
    summaryItems.push(statusData.strength.reason);
  }
  if (showRunning && statusData.running.reason) {
    summaryItems.push(statusData.running.reason);
  }

  return (
    <>
      <div
        className={`rounded-2xl border p-4 sm:p-5 shadow-lg transition-all ${
          isCompletedStatus
            ? 'border-emerald-500/40 bg-gradient-to-r from-emerald-950/35 via-slate-900/90 to-indigo-950/30'
            : 'border-amber-500/40 bg-gradient-to-r from-amber-950/35 via-slate-900/90 to-indigo-950/30'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${
                isCompletedStatus
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                  : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
              }`}
            >
              {isCompletedStatus ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <Sparkles className="w-5 h-5" />
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    isCompletedStatus
                      ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                      : 'border-amber-500/30 bg-amber-500/15 text-amber-300'
                  }`}
                >
                  {isCompletedStatus ? 'Ciclo Concluído' : 'Período Encerrado'}
                </span>
                {defaultSuggestedStartLabel && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-300">
                    <Calendar className="w-3 h-3 text-indigo-400" />
                    Início sugerido: <strong>{defaultSuggestedStartLabel}</strong>
                  </span>
                )}
              </div>

              <h3 className="text-sm sm:text-base font-extrabold text-slate-100">
                {headline}
              </h3>

              <p className="text-xs text-slate-300 leading-relaxed">
                {summaryItems.join(' ')} Deseja que o Coach IA gere o próximo período mantendo sua progressão?
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            <button
              type="button"
              onClick={handleSnooze}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-900/70 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Lembrar amanhã</span>
            </button>

            <button
              type="button"
              onClick={openConfirmationModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500 hover:from-emerald-400 hover:via-teal-400 hover:to-indigo-400 text-slate-950 text-xs font-extrabold shadow-md shadow-emerald-500/15 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Revisar e Gerar Próximo Ciclo</span>
            </button>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cycle-renewal-modal-title"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    id="cycle-renewal-modal-title"
                    className="text-base font-extrabold text-slate-100"
                  >
                    Confirmar Geração do Próximo Ciclo
                  </h3>
                  <p className="text-xs text-slate-400">
                    Revise o resumo, escolha os módulos e a data de início da Semana 1.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isGenerating}
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Module Checkboxes */}
            <div className="space-y-3">
              {showRunning && (
                <label
                  className={`flex items-start gap-3 p-3.5 rounded-xl border transition cursor-pointer ${
                    generateRunning
                      ? 'border-emerald-500/50 bg-emerald-950/25'
                      : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={generateRunning}
                    disabled={isGenerating}
                    onChange={(e) => setGenerateRunning(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded accent-emerald-500"
                  />
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                        <Footprints className="w-3.5 h-3.5" />
                        Corrida — Novo Ciclo de 4 Semanas
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {statusData.running.completedSessions}/{statusData.running.totalSessions} concl.
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Plano anterior: <strong className="text-slate-200">{statusData.running.title}</strong>
                      {statusData.running.lastSessionDate
                        ? ` (última sessão: ${formatShortDateBR(statusData.running.lastSessionDate)})`
                        : ''}
                    </p>
                  </div>
                </label>
              )}

              {showStrength && (
                <label
                  className={`flex items-start gap-3 p-3.5 rounded-xl border transition cursor-pointer ${
                    generateStrength
                      ? 'border-indigo-500/50 bg-indigo-950/25'
                      : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={generateStrength}
                    disabled={isGenerating}
                    onChange={(e) => setGenerateStrength(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded accent-indigo-500"
                  />
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                        <Dumbbell className="w-3.5 h-3.5" />
                        Musculação — Novo Mesociclo de Hipertrofia
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {statusData.strength.completedWorkouts} treino(s)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Bloco anterior: <strong className="text-slate-200">{statusData.strength.title}</strong>
                      {statusData.strength.endDate
                        ? ` (fim: ${formatShortDateBR(statusData.strength.endDate)})`
                        : ''}
                    </p>
                  </div>
                </label>
              )}

              {generateRunning && generateStrength && (
                <div className="rounded-xl border border-cyan-500/25 bg-cyan-950/20 px-3 py-2 text-[11px] text-cyan-200">
                  Ordem automática: <strong>1º Corrida → 2º Musculação</strong>, garantindo 48h de recuperação entre treinos de pernas e corridas intensas.
                </div>
              )}
            </div>

            {/* Start Date Selector */}
            <div className="space-y-1.5">
              <label
                htmlFor="cycle-start-date-input"
                className="text-xs font-semibold text-slate-200 flex items-center gap-1.5"
              >
                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                Data de Início da Semana 1
              </label>
              <input
                id="cycle-start-date-input"
                type="date"
                min={statusData.today}
                value={selectedStartDate}
                disabled={isGenerating}
                onChange={(e) => setSelectedStartDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-indigo-500 transition"
              />
              <p className="text-[11px] text-slate-400">
                Se não houver dias disponíveis suficientes na semana escolhida para cumprir sua meta semanal, a Semana 1 rola automaticamente para a próxima segunda-feira sem descartar treinos.
              </p>
            </div>

            {/* Progress / Errors */}
            {isGenerating && progressLabel && (
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/30 p-3.5 flex items-center gap-2.5 text-xs text-indigo-200">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
                <span>{progressLabel}</span>
              </div>
            )}

            {stepErrors.length > 0 && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3.5 space-y-1 text-xs text-rose-200">
                <div className="flex items-center gap-1.5 font-bold text-rose-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Ocorreu um problema em uma das etapas:</span>
                </div>
                <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                  {stepErrors.map((errMsg, idx) => (
                    <li key={idx}>{errMsg}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                disabled={isGenerating}
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800/70 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition disabled:opacity-40 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isGenerating || (!generateRunning && !generateStrength)}
                onClick={handleConfirmRenewal}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-indigo-500 hover:from-emerald-400 hover:to-indigo-400 text-slate-950 text-xs font-extrabold shadow-md shadow-indigo-500/20 transition disabled:opacity-50 cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Gerando com IA...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Confirmar e Gerar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
