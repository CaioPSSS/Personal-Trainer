'use client';

import React, { useState } from 'react';
import { X, AlertTriangle, CalendarClock, Slash } from 'lucide-react';
import { useToast } from './ToastProvider';

export interface SkipWorkoutDialogProps {
  isOpen: boolean;
  onClose: () => void;
  event: {
    id: string;
    title: string;
    eventType: string;
    date: string;
  } | null;
  onSuccess: () => void;
}

export default function SkipWorkoutDialog({
  isOpen,
  onClose,
  event,
  onSuccess,
}: SkipWorkoutDialogProps) {
  const { success, error } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !event) return null;

  const isStrength = event.eventType === 'strength';

  const handleSkip = async (strategy: 'skip_only' | 'skip_and_reschedule') => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/calendar/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          strategy,
        }),
      });

      if (!res.ok) {
        throw new Error('Falha ao processar solicitação de pulo');
      }

      const data = await res.json();
      if (strategy === 'skip_and_reschedule') {
        success(
          `Treino pulado e ${data.shiftedCount} treino(s) subsequente(s) adiado(s) em +1 dia.`,
          'Reagendamento Efetuado'
        );
      } else {
        success('Treino marcado como pulado.', 'Treino Pulado');
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      error('Não foi possível pular o treino.', 'Erro');
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
      <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Pular Treino</h3>
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
        <div className="py-5 space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">
            Data agendada: <span className="font-semibold text-slate-100">{event.date}</span>.
            {isStrength
              ? ' Como este é um treino de musculação, você pode escolher apenas registrar o pulo ou empurrar as próximas sessões da semana em +1 dia para preservar a sequência.'
              : ' Você deseja marcar esta sessão como pulada? Seu histórico de adesão será atualizado.'}
          </p>

          <div className="flex flex-col gap-2.5 pt-2">
            {isStrength ? (
              <>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleSkip('skip_and_reschedule')}
                  className="flex items-center justify-between px-4 py-3 rounded-xl border border-indigo-500/40 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-200 text-xs font-semibold transition disabled:opacity-50 cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <CalendarClock className="w-4 h-4 text-indigo-400 shrink-0" />
                    <div>
                      <div className="font-bold text-slate-100">Pular e reagendar (+1 dia)</div>
                      <div className="text-[11px] text-indigo-300/80">
                        Adia os treinos restantes da semana para manter o split
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleSkip('skip_only')}
                  className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition disabled:opacity-50 cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <Slash className="w-4 h-4 text-slate-400 shrink-0" />
                    <div>
                      <div className="font-bold text-slate-200">Apenas pular</div>
                      <div className="text-[11px] text-slate-400">
                        Mantém as próximas sessões nas datas atuais
                      </div>
                    </div>
                  </div>
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSkip('skip_only')}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-rose-500/30 bg-rose-600/20 hover:bg-rose-600/30 text-rose-200 text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
              >
                <Slash className="w-4 h-4" />
                <span>Confirmar pulo de treino</span>
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
