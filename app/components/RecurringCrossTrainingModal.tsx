'use client';

import React, { useState, useEffect } from 'react';
import { X, Flame, Waves, Bike, Heart, Swords, Activity, Clock, Check, Loader2, Plus, Trash2, CalendarDays } from 'lucide-react';
import { useToast } from './ToastProvider';
import { RecurringCrossTrainingRule } from '@/lib/scheduling/cross-training-scheduler';

interface RecurringCrossTrainingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const ACTIVITY_OPTIONS = [
  { id: 'crossfit', label: 'CrossFit', emoji: '🔥', icon: Flame, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  { id: 'swimming', label: 'Natação', emoji: '🏊', icon: Waves, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
  { id: 'cycling', label: 'Ciclismo', emoji: '🚴', icon: Bike, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  { id: 'yoga', label: 'Yoga', emoji: '🧘', icon: Heart, color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
  { id: 'martial_arts', label: 'Artes Marciais', emoji: '🥊', icon: Swords, color: 'text-red-400 bg-red-500/10 border-red-500/30' },
  { id: 'other', label: 'Outro', emoji: '🟣', icon: Activity, color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
];

const DAYS_OF_WEEK = [
  { key: 'monday', short: 'Seg', name: 'Segunda-feira' },
  { key: 'tuesday', short: 'Ter', name: 'Terça-feira' },
  { key: 'wednesday', short: 'Qua', name: 'Quarta-feira' },
  { key: 'thursday', short: 'Qui', name: 'Quinta-feira' },
  { key: 'friday', short: 'Sex', name: 'Sexta-feira' },
  { key: 'saturday', short: 'Sáb', name: 'Sábado' },
  { key: 'sunday', short: 'Dom', name: 'Domingo' },
];

export default function RecurringCrossTrainingModal({
  isOpen,
  onClose,
  onSuccess,
}: RecurringCrossTrainingModalProps) {
  const { success, error, info } = useToast();
  const [rules, setRules] = useState<RecurringCrossTrainingRule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // New rule draft state
  const [activityType, setActivityType] = useState('crossfit');
  const [title, setTitle] = useState('CrossFit WOD');
  const [selectedDays, setSelectedDays] = useState<string[]>(['monday', 'wednesday']);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [sessionRpe, setSessionRpe] = useState(7.5);

  useEffect(() => {
    if (!isOpen) return;

    const fetchRules = async () => {
      try {
        setIsLoading(true);
        const res = await fetch('/api/cross-training/recurring');
        if (res.ok) {
          const data = await res.json();
          setRules(data.rules || []);
        }
      } catch (err) {
        console.error('[RecurringCrossTrainingModal] Erro ao carregar regras:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRules();
  }, [isOpen]);

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

  const toggleDay = (dayKey: string) => {
    setSelectedDays((prev) =>
      prev.includes(dayKey) ? prev.filter((d) => d !== dayKey) : [...prev, dayKey]
    );
  };

  const handleAddRule = () => {
    if (selectedDays.length === 0) {
      error('Selecione pelo menos um dia da semana para a atividade recorrente.');
      return;
    }

    const defaultTitle =
      ACTIVITY_OPTIONS.find((a) => a.id === activityType)?.label || 'Cross-Training';

    const newRule: RecurringCrossTrainingRule = {
      id: `rule-${Date.now()}`,
      activityType,
      title: title.trim() || `${defaultTitle} WOD`,
      daysOfWeek: selectedDays,
      durationMinutes: durationMinutes || 60,
      sessionRpe,
      muscleGroups: activityType === 'crossfit' ? ['Pernas', 'Core', 'Full Body'] : ['Core'],
    };

    setRules((prev) => [...prev, newRule]);
    // Reset draft
    setSelectedDays([]);
    setTitle('CrossFit WOD');
  };

  const handleRemoveRule = (ruleId: string) => {
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      info('Salvando programação recorrente e projetando calendário...', 'Cross-Training');

      const res = await fetch('/api/cross-training/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao salvar programação recorrente.');
      }

      success(
        `Programação salva! ${data.syncResult?.createdCount || 0} treino(s) futuro(s) agendado(s).`,
        'Calendário Atualizado'
      );

      window.dispatchEvent(new CustomEvent('calendar-refresh'));
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar.';
      error(msg, 'Erro');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-400">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">
                Pré-Programação Recorrente
              </h2>
              <p className="text-xs text-slate-400">
                Fixe dias recorrentes (ex: CrossFit Seg/Qua) para agendamento automático futuro.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Existing Rules List */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Regras Ativas ({rules.length})
          </h3>

          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : rules.length === 0 ? (
            <div className="text-center py-4 px-3 bg-slate-950/50 rounded-2xl border border-dashed border-slate-800 text-xs text-slate-400">
              Nenhuma atividade recorrente pré-programada. Adicione uma abaixo!
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => {
                const opt = ACTIVITY_OPTIONS.find((a) => a.id === rule.activityType);
                const IconComponent = opt?.icon || Flame;
                const dayLabels = rule.daysOfWeek
                  .map((d) => DAYS_OF_WEEK.find((item) => item.key === d)?.short || d)
                  .join(', ');

                return (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between p-3 bg-slate-950/70 border border-slate-800 rounded-2xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl border ${opt?.color || 'text-amber-400 bg-amber-500/10 border-amber-500/30'}`}>
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-200">
                          {rule.title}
                        </div>
                        <div className="text-xs text-slate-400">
                          Toda <span className="text-amber-300 font-medium">{dayLabels}</span> • {rule.durationMinutes} min
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveRule(rule.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                      title="Remover regra"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add New Rule Section */}
        <div className="space-y-4 pt-4 border-t border-slate-800">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Adicionar Nova Regra
          </h3>

          {/* Activity Selector */}
          <div className="grid grid-cols-3 gap-2">
            {ACTIVITY_OPTIONS.map((item) => {
              const Icon = item.icon;
              const isSelected = activityType === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActivityType(item.id);
                    setTitle(`${item.label} WOD`);
                  }}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border text-xs font-semibold transition cursor-pointer ${
                    isSelected
                      ? `${item.color} ring-2 ring-amber-500/40`
                      : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <Icon className="w-4 h-4 mb-1" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Title, Duration & RPE */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1">
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Título do Treino
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: CrossFit WOD"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Duração (min)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={10}
                  max={240}
                  step={5}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 60)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
                <Clock className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2.5 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Esforço (RPE)
              </label>
              <select
                value={sessionRpe}
                onChange={(e) => setSessionRpe(parseFloat(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              >
                <option value={6}>6 - Moderado</option>
                <option value={7}>7 - Vigoroso</option>
                <option value={7.5}>7.5 - Padrão</option>
                <option value={8}>8 - Intenso</option>
                <option value={9}>9 - Máximo</option>
              </select>
            </div>
          </div>

          {/* Days of Week Selector */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
              Dias da Semana (Repetir em)
            </label>
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS_OF_WEEK.map((day) => {
                const isSelected = selectedDays.includes(day.key);
                return (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => toggleDay(day.key)}
                    className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                        : 'bg-slate-950/60 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    {day.short}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddRule}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold transition cursor-pointer border border-amber-500/20"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar à Lista de Recorrências
          </button>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 transition cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Salvando e Projetando...
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                Salvar & Atualizar Calendário
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
