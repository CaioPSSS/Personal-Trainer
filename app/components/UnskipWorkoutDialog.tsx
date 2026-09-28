'use client';

import React, { useState } from 'react';
import { X, RotateCcw, CheckCircle2, History } from 'lucide-react';
import { useToast } from './ToastProvider';

export interface UnskipWorkoutDialogProps {
  isOpen: boolean;
  onClose: () => void;
  event: {
    id: string;
    title: string;
    eventType: string;
    date: string;
    originalDate?: string | null;
  } | null;
  onSuccess: () => void;
}

export default function UnskipWorkoutDialog({
  isOpen,
  onClose,
  event,
  onSuccess,
}: UnskipWorkoutDialogProps) {
  const { success, error } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !event) return null;

  const isStrength = event.eventType === 'strength';
  const wasRescheduled = event.originalDate === 'skip_and_reschedule';

  const handleUnskip = async (strategy: 'restore_schedule' | 'unskip_only') => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/calendar/unskip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          strategy,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Falha ao reverter pulo de treino');
      }

      const data = await res.json();
      if (strategy === 'restore_schedule' && data.revertedShiftCount > 0) {
        success(
          `Treino despulado e ${data.revertedShiftCount} treino(s) subsequente(s) retornados à data original!`,
          'Treino Reativado'
        );
      } else {
        success('Treino restaurado para o status planejado.', 'Treino Reativado');
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Não foi possível despular o treino.';
      error(msg, 'Erro');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Despular Treino</h3>
              <p className="text-xs text-slate-400 truncate max-w-[240px]">{event.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">
            Data original da sessão: <span className="font-semibold text-slate-100">{event.date}</span>.
            {isStrength && wasRescheduled
              ? ' Este treino foi pulado anteriormente com adiamento (+1 dia) dos treinos seguintes. Escolha como deseja restaurar:'
              : ' Deseja reativar esta sessão e colocá-la de volta como planejada no seu calendário?'}
          </p>

          <div className="flex flex-col gap-2.5 pt-1">
            {isStrength && wasRescheduled ? (
              <>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleUnskip('restore_schedule')}
                  className="flex items-center justify-between px-4 py-3 rounded-xl border border-indigo-500/40 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-200 text-xs font-semibold transition disabled:opacity-50 cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <History className="w-4 h-4 text-indigo-400 shrink-0" />
                    <div>
                      <div className="font-bold text-slate-100">Despular e restaurar datas anteriores</div>
                      <div className="text-[11px] text-indigo-300/80">
                        Volta os treinos seguintes em -1 dia para a programação original
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleUnskip('unskip_only')}
                  className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition disabled:opacity-50 cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-slate-400 shrink-0" />
                    <div>
                      <div className="font-bold text-slate-200">Apenas despular este treino</div>
                      <div className="text-[11px] text-slate-400">
                        Mantém os outros treinos nas datas atuais
                      </div>
                    </div>
                  </div>
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleUnskip('unskip_only')}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-indigo-500/30 bg-indigo-600/25 hover:bg-indigo-600/40 text-indigo-200 text-xs font-semibold transition disabled:opacity-50 cursor-pointer shadow-md shadow-indigo-500/10"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Confirmar e Despular Treino</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
