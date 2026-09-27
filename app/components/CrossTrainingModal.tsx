'use client';

import React, { useState, useEffect } from 'react';
import { X, Flame, Waves, Bike, Heart, Swords, Activity, Clock, Calendar, Check, Loader2 } from 'lucide-react';
import { useToast } from './ToastProvider';

interface CrossTrainingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialDate?: string;
}

const ACTIVITY_OPTIONS = [
  { id: 'crossfit', label: 'CrossFit', emoji: '🔥', icon: Flame, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30 hover:border-amber-400' },
  { id: 'swimming', label: 'Natação', emoji: '🏊', icon: Waves, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30 hover:border-cyan-400' },
  { id: 'cycling', label: 'Ciclismo', emoji: '🚴', icon: Bike, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-400' },
  { id: 'yoga', label: 'Yoga', emoji: '🧘', icon: Heart, color: 'text-rose-400 bg-rose-500/10 border-rose-500/30 hover:border-rose-400' },
  { id: 'martial_arts', label: 'Artes Marciais', emoji: '🥊', icon: Swords, color: 'text-red-400 bg-red-500/10 border-red-500/30 hover:border-red-400' },
  { id: 'other', label: 'Outro', emoji: '🟣', icon: Activity, color: 'text-purple-400 bg-purple-500/10 border-purple-500/30 hover:border-purple-400' },
];

const MUSCLE_GROUPS = [
  'Pernas',
  'Costas',
  'Peito',
  'Ombros',
  'Braços',
  'Core',
  'Full Body',
];

function getRpeDescription(rpe: number): { label: string; color: string } {
  if (rpe <= 4) return { label: 'Leve / Recuperação', color: 'text-emerald-400' };
  if (rpe <= 6) return { label: 'Moderado', color: 'text-cyan-400' };
  if (rpe <= 8) return { label: 'Intenso / Desafiador', color: 'text-amber-400' };
  if (rpe <= 9) return { label: 'Muito Intenso', color: 'text-orange-400' };
  return { label: 'Esforço Máximo / Exaustão', color: 'text-rose-400' };
}

export default function CrossTrainingModal({
  isOpen,
  onClose,
  onSuccess,
  initialDate,
}: CrossTrainingModalProps) {
  const { success, error } = useToast();

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [activityType, setActivityType] = useState('crossfit');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const date = selectedDate ?? initialDate ?? todayStr;
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [sessionRpe, setSessionRpe] = useState(7);
  const [muscleGroups, setMuscleGroups] = useState<string[]>(['Pernas', 'Core']);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleMuscleGroup = (mg: string) => {
    setMuscleGroups((prev) => {
      if (mg === 'Full Body') {
        return prev.includes('Full Body') ? [] : ['Full Body'];
      }
      const filtered = prev.filter((item) => item !== 'Full Body');
      if (filtered.includes(mg)) {
        return filtered.filter((item) => item !== mg);
      }
      return [...filtered, mg];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!durationMinutes || durationMinutes <= 0) {
      error('Informe uma duração válida em minutos.');
      return;
    }

    setIsSubmitting(true);

    try {
      const selectedOption = ACTIVITY_OPTIONS.find((a) => a.id === activityType);
      const activityLabel = selectedOption?.label || 'Atividade';

      const res = await fetch('/api/cross-training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activityType,
          date,
          durationMinutes: Number(durationMinutes),
          sessionRpe: Number(sessionRpe),
          muscleGroups,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Falha ao registrar atividade.');
      }

      success(`Atividade de ${activityLabel} registrada!`, 'Sucesso');

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('calendar-refresh'));
      }

      if (onSuccess) {
        onSuccess();
      }

      onClose();
    } catch (err) {
      console.error(err);
      error(err instanceof Error ? err.message : 'Falha ao registrar cross-training.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const rpeInfo = getRpeDescription(sessionRpe);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cross-training-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-xl z-10 space-y-5 my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h2 id="cross-training-title" className="text-lg font-bold text-slate-100">
                Registrar Cross-Training
              </h2>
              <p className="text-xs text-slate-400">
                Adicione sessões concorrentes para sincronização no calendário e autoregulação de fadiga
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Activity Type Grid */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Tipo de Atividade
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ACTIVITY_OPTIONS.map((item) => {
                const isSelected = activityType === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActivityType(item.id)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium transition-all duration-200 ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-500/20 text-white shadow-md shadow-indigo-500/10'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
                    }`}
                  >
                    <Icon className={`w-5 h-5 mb-1 ${isSelected ? 'text-indigo-400' : 'text-slate-400'}`} />
                    <span className="truncate max-w-full text-center">
                      {item.label} {item.emoji}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date & Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="ct-date" className="block text-xs font-semibold text-slate-300 mb-1.5">
                Data
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-500 absolute left-3 top-3 pointer-events-none" />
                <input
                  id="ct-date"
                  type="date"
                  value={date}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="ct-duration" className="block text-xs font-semibold text-slate-300 mb-1.5">
                Duração (minutos)
              </label>
              <div className="relative">
                <Clock className="w-4 h-4 text-slate-500 absolute left-3 top-3 pointer-events-none" />
                <input
                  id="ct-duration"
                  type="number"
                  min="1"
                  max="360"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                  required
                />
              </div>
            </div>
          </div>

          {/* Session RPE Slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="ct-rpe" className="text-xs font-semibold text-slate-300">
                RPE da Sessão (Percepção Subjetiva de Esforço)
              </label>
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <span className="text-white px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700">
                  {sessionRpe} / 10
                </span>
                <span className={rpeInfo.color}>{rpeInfo.label}</span>
              </div>
            </div>
            <input
              id="ct-rpe"
              type="range"
              min="1"
              max="10"
              step="1"
              value={sessionRpe}
              onChange={(e) => setSessionRpe(Number(e.target.value))}
              className="w-full accent-indigo-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
              <span>1 - Muito leve</span>
              <span>5 - Moderado</span>
              <span>8 - Pesado</span>
              <span>10 - Máximo</span>
            </div>
          </div>

          {/* Muscle Groups Checkboxes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Grupos Musculares Mais Solicitados
            </label>
            <div className="flex flex-wrap gap-1.5">
              {MUSCLE_GROUPS.map((mg) => {
                const isSelected = muscleGroups.includes(mg);
                return (
                  <button
                    key={mg}
                    type="button"
                    onClick={() => toggleMuscleGroup(mg)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300 shadow-sm shadow-indigo-500/10'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-indigo-400" />}
                    <span>{mg}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes Textarea */}
          <div>
            <label htmlFor="ct-notes" className="block text-xs font-semibold text-slate-300 mb-1.5">
              Notas da Sessão (Opcional)
            </label>
            <textarea
              id="ct-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: WOD com clean & jerk e saltos na caixa; pernas e ombros fadigados..."
              className="w-full bg-slate-800/80 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition resize-none"
            />
          </div>

          {/* Submit Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800 transition"
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-600 hover:to-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <span>Salvar Atividade</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
