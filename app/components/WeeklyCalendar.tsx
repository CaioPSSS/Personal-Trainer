'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  CheckCircle2,
  XCircle,
  Dumbbell,
  Footprints,
  Flame,
  Waves,
  GripVertical,
  Plus,
} from 'lucide-react';
import { useToast } from './ToastProvider';
import SkipWorkoutDialog from './SkipWorkoutDialog';
import CrossTrainingModal from './CrossTrainingModal';

export interface CalendarEventDTO {
  id: string;
  athleteProfileId: string;
  date: string; // YYYY-MM-DD
  eventType: 'strength' | 'running' | 'crossfit' | 'swimming' | 'rest' | 'other' | string;
  referenceId?: string | null;
  referenceModel?: string | null;
  title: string;
  status: 'planned' | 'completed' | 'skipped' | string;
  colorCode?: string | null;
  sortOrder: number;
  originalDate?: string | null;
}

interface WeeklyCalendarProps {
  onToggleMonthly?: () => void;
  isMonthlyOpen?: boolean;
}

const DAYS_OF_WEEK = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 is Sun, 1 is Mon
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function WeeklyCalendar({ onToggleMonthly, isMonthlyOpen }: WeeklyCalendarProps) {
  const { success, error } = useToast();
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => getStartOfWeek(new Date()));
  const [events, setEvents] = useState<CalendarEventDTO[]>([]);
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const navHoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Skip dialog state
  const [skipTarget, setSkipTarget] = useState<CalendarEventDTO | null>(null);
  const [isSkipOpen, setIsSkipOpen] = useState(false);

  // Cross-training modal state
  const [isCrossModalOpen, setIsCrossModalOpen] = useState(false);

  const todayStr = formatDateISO(new Date());

  // Generate 7 days for current week
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    const dateStr = formatDateISO(d);
    return {
      date: d,
      dateStr,
      label: DAYS_OF_WEEK[i],
      dayNumber: d.getDate(),
      isToday: dateStr === todayStr,
    };
  });

  const startDateStr = weekDays[0].dateStr;
  const endDateStr = weekDays[6].dateStr;

  const refreshCalendar = async () => {
    try {
      const res = await fetch(`/api/calendar?startDate=${startDateStr}&endDate=${endDateStr}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (err) {
      console.error('Falha ao carregar eventos:', err);
    }
  };

  useEffect(() => {
    let active = true;
    const loadEvents = async () => {
      try {
        const res = await fetch(`/api/calendar?startDate=${startDateStr}&endDate=${endDateStr}`);
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          setEvents(data.events || []);
        }
      } catch (err) {
        console.error('Falha ao carregar eventos:', err);
      }
    };

    loadEvents();

    const handleCustomRefresh = () => {
      loadEvents();
    };
    window.addEventListener('calendar-refresh', handleCustomRefresh);

    return () => {
      active = false;
      window.removeEventListener('calendar-refresh', handleCustomRefresh);
    };
  }, [startDateStr, endDateStr]);

  const handlePrevWeek = () => {
    setCurrentWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() - 7);
      return next;
    });
  };

  const handleNextWeek = () => {
    setCurrentWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + 7);
      return next;
    });
  };

  const handleCurrentWeek = () => {
    setCurrentWeekStart(getStartOfWeek(new Date()));
  };

  // Adjacent week anchor dates for cross-week dragging
  const nextWeekStartDate = new Date(currentWeekStart);
  nextWeekStartDate.setDate(nextWeekStartDate.getDate() + 7);
  const nextMondayStr = formatDateISO(nextWeekStartDate);

  const prevSundayDate = new Date(currentWeekStart);
  prevSundayDate.setDate(prevSundayDate.getDate() - 1);
  const prevSundayStr = formatDateISO(prevSundayDate);

  // Drag-and-drop mechanics
  const handleDragStart = (e: React.DragEvent, event: CalendarEventDTO) => {
    if (event.status !== 'planned') return;
    setDraggingEventId(event.id);
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ eventId: event.id, sourceDate: event.date })
    );
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDate !== dateStr) {
      setDragOverDate(dateStr);
    }
  };

  const handleDragLeave = () => {
    setDragOverDate(null);
  };

  const handleNavButtonDragOver = (e: React.DragEvent, direction: 'prev' | 'next') => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (navHoverTimeoutRef.current) return;
    navHoverTimeoutRef.current = setTimeout(() => {
      if (direction === 'next') {
        handleNextWeek();
      } else {
        handlePrevWeek();
      }
      navHoverTimeoutRef.current = null;
    }, 450);
  };

  const handleNavButtonDragLeave = () => {
    if (navHoverTimeoutRef.current) {
      clearTimeout(navHoverTimeoutRef.current);
      navHoverTimeoutRef.current = null;
    }
  };

  const handleCrossWeekDrop = async (e: React.DragEvent, targetDate: string, weekShiftDays: number) => {
    e.preventDefault();
    setDragOverDate(null);
    setDraggingEventId(null);
    if (navHoverTimeoutRef.current) {
      clearTimeout(navHoverTimeoutRef.current);
      navHoverTimeoutRef.current = null;
    }

    const rawData = e.dataTransfer.getData('application/json');
    if (!rawData) return;

    try {
      const { eventId, sourceDate } = JSON.parse(rawData);
      if (sourceDate === targetDate) return;

      // Optimistically shift the current week view so the moved workout is immediately visible
      setCurrentWeekStart((prev) => {
        const next = new Date(prev);
        next.setDate(next.getDate() + weekShiftDays);
        return next;
      });

      const res = await fetch('/api/calendar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, newDate: targetDate }),
      });

      if (!res.ok) {
        throw new Error('Falha ao reagendar treino');
      }

      success(`Treino movido para ${targetDate}`, 'Reagendado');
    } catch (err) {
      console.error(err);
      error('Não foi possível reagendar o treino.', 'Erro');
    }
  };

  const handleDrop = async (e: React.DragEvent, targetDate: string) => {
    e.preventDefault();
    setDragOverDate(null);
    setDraggingEventId(null);
    if (navHoverTimeoutRef.current) {
      clearTimeout(navHoverTimeoutRef.current);
      navHoverTimeoutRef.current = null;
    }

    const rawData = e.dataTransfer.getData('application/json');
    if (!rawData) return;

    try {
      const { eventId, sourceDate } = JSON.parse(rawData);
      if (sourceDate === targetDate) return;

      // Optimistic update
      setEvents((prev) =>
        prev.map((ev) => (ev.id === eventId ? { ...ev, date: targetDate } : ev))
      );

      const res = await fetch('/api/calendar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, newDate: targetDate }),
      });

      if (!res.ok) {
        throw new Error('Falha ao reagendar treino');
      }

      success(`Treino remarcado para ${targetDate}`, 'Reagendado');
      refreshCalendar();
    } catch (err) {
      console.error(err);
      error('Não foi possível reagendar o treino.', 'Erro');
      refreshCalendar();
    }
  };

  // Sport color & icon mappings
  const getSportVisuals = (eventType: string) => {
    switch (eventType) {
      case 'strength':
        return {
          icon: Dumbbell,
          tag: 'Musculação',
          colorClass: 'bg-indigo-950/60 border-indigo-500/40 text-indigo-200 hover:border-indigo-400',
          badgeClass: 'bg-indigo-500/20 text-indigo-300',
          accentColor: '#6366f1',
        };
      case 'running':
        return {
          icon: Footprints,
          tag: 'Corrida',
          colorClass: 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200 hover:border-emerald-400',
          badgeClass: 'bg-emerald-500/20 text-emerald-300',
          accentColor: '#10b981',
        };
      case 'crossfit':
        return {
          icon: Flame,
          tag: 'CrossFit',
          colorClass: 'bg-amber-950/60 border-amber-500/40 text-amber-200 hover:border-amber-400',
          badgeClass: 'bg-amber-500/20 text-amber-300',
          accentColor: '#f59e0b',
        };
      case 'swimming':
        return {
          icon: Waves,
          tag: 'Natação',
          colorClass: 'bg-cyan-950/60 border-cyan-500/40 text-cyan-200 hover:border-cyan-400',
          badgeClass: 'bg-cyan-500/20 text-cyan-300',
          accentColor: '#06b6d4',
        };
      default:
        return {
          icon: CalendarIcon,
          tag: 'Atividade',
          colorClass: 'bg-slate-900/60 border-slate-700/60 text-slate-300 hover:border-slate-500',
          badgeClass: 'bg-slate-800 text-slate-300',
          accentColor: '#64748b',
        };
    }
  };

  // Week volume summaries
  const strengthCount = events.filter((e) => e.eventType === 'strength').length;
  const runningCount = events.filter((e) => e.eventType === 'running').length;
  const crossCount = events.filter((e) => ['crossfit', 'swimming', 'cycling'].includes(e.eventType)).length;

  return (
    <div className="glass-card p-5 space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <CalendarIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Agenda Semanal
            </h3>
            <p className="text-xs text-slate-400">
              {weekDays[0].dayNumber} a {weekDays[6].dayNumber} de{' '}
              {weekDays[6].date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={handlePrevWeek}
              onDragOver={(e) => handleNavButtonDragOver(e, 'prev')}
              onDragLeave={handleNavButtonDragLeave}
              onDrop={(e) => handleCrossWeekDrop(e, prevSundayStr, -7)}
              className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition ${
                draggingEventId ? 'ring-1 ring-indigo-500/50' : ''
              }`}
              title="Semana anterior (segure o treino aqui para voltar a semana ou solte para mover para Domingo)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleCurrentWeek}
              className="px-2.5 py-1 text-xs font-semibold text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={handleNextWeek}
              onDragOver={(e) => handleNavButtonDragOver(e, 'next')}
              onDragLeave={handleNavButtonDragLeave}
              onDrop={(e) => handleCrossWeekDrop(e, nextMondayStr, 7)}
              className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition ${
                draggingEventId ? 'ring-1 ring-indigo-500/50' : ''
              }`}
              title="Próxima semana (segure o treino aqui para avançar a semana ou solte para mover para Segunda)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsCrossModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 hover:border-amber-400 transition"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>+ Registrar Atividade</span>
          </button>

          {onToggleMonthly && (
            <button
              type="button"
              onClick={onToggleMonthly}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                isMonthlyOpen
                  ? 'bg-indigo-600 text-white border-indigo-500'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              {isMonthlyOpen ? 'Fechar Mês' : 'Visão Mensal'}
            </button>
          )}
        </div>
      </div>

      {/* Cross-Week Quick Drop Zones (Active when dragging an event) */}
      {draggingEventId && (
        <div className="flex flex-col sm:flex-row items-center gap-2 p-2.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/40 animate-fadeSlideIn">
          <div
            onDragOver={(e) => handleDragOver(e, prevSundayStr)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleCrossWeekDrop(e, prevSundayStr, -7)}
            className={`flex-1 w-full py-2.5 px-3 rounded-xl border-2 border-dashed text-center transition flex items-center justify-center gap-2 cursor-pointer ${
              dragOverDate === prevSundayStr
                ? 'border-indigo-400 bg-indigo-600/30 text-indigo-100 font-bold scale-[1.01]'
                : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500'
            }`}
          >
            <ChevronLeft className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="text-xs">
              Solte aqui para mover para o <strong>Domingo Anterior ({prevSundayStr.split('-')[2]}/{prevSundayStr.split('-')[1]})</strong>
            </span>
          </div>

          <div
            onDragOver={(e) => handleDragOver(e, nextMondayStr)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleCrossWeekDrop(e, nextMondayStr, 7)}
            className={`flex-1 w-full py-2.5 px-3 rounded-xl border-2 border-dashed text-center transition flex items-center justify-center gap-2 cursor-pointer ${
              dragOverDate === nextMondayStr
                ? 'border-emerald-400 bg-emerald-600/30 text-emerald-100 font-bold scale-[1.01]'
                : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500'
            }`}
          >
            <span className="text-xs">
              Solte aqui para mover para a <strong>Próxima Segunda ({nextMondayStr.split('-')[2]}/{nextMondayStr.split('-')[1]})</strong>
            </span>
            <ChevronRight className="w-4 h-4 text-emerald-400 shrink-0" />
          </div>
        </div>
      )}

      {/* 7-Day Agenda Columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {weekDays.map((day) => {
          const dayEvents = events.filter((e) => e.date === day.dateStr);
          const isOver = dragOverDate === day.dateStr;

          return (
            <div
              key={day.dateStr}
              onDragOver={(e) => handleDragOver(e, day.dateStr)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, day.dateStr)}
              className={`flex flex-col rounded-2xl p-3 min-h-[190px] transition-all duration-200 border ${
                isOver
                  ? 'border-indigo-400 bg-indigo-950/30 scale-[1.02]'
                  : day.isToday
                    ? 'border-indigo-500/50 bg-slate-900/90 shadow-md shadow-indigo-500/10'
                    : 'border-slate-800/80 bg-slate-900/40 hover:bg-slate-900/60'
              }`}
            >
              {/* Day Header */}
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/60">
                <span className="text-xs font-medium text-slate-400">{day.label}</span>
                <span
                  className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                    day.isToday
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-300 bg-slate-800/60'
                  }`}
                >
                  {day.dayNumber}
                </span>
              </div>

              {/* Day Events Stack */}
              <div className="flex-1 space-y-2">
                {dayEvents.length === 0 ? (
                  <div className="h-full flex items-center justify-center py-6 text-center">
                    <span className="text-[11px] text-slate-600 italic">Descanso / Livre</span>
                  </div>
                ) : (
                  dayEvents.map((event) => {
                    const visuals = getSportVisuals(event.eventType);
                    const SportIcon = visuals.icon;
                    const isCompleted = event.status === 'completed';
                    const isSkipped = event.status === 'skipped';
                    const isPlanned = event.status === 'planned';

                    return (
                      <div
                        key={event.id}
                        draggable={isPlanned}
                        onDragStart={(e) => handleDragStart(e, event)}
                        onDragEnd={() => {
                          setDraggingEventId(null);
                          setDragOverDate(null);
                          if (navHoverTimeoutRef.current) {
                            clearTimeout(navHoverTimeoutRef.current);
                            navHoverTimeoutRef.current = null;
                          }
                        }}
                        className={`group relative rounded-xl border p-2.5 text-xs transition-all duration-200 select-none ${
                          isPlanned ? 'cursor-grab active:cursor-grabbing border-dashed' : ''
                        } ${
                          isSkipped
                            ? 'opacity-30 line-through grayscale border-slate-800 bg-slate-900/40'
                            : isCompleted
                              ? 'opacity-100 border-solid ' + visuals.colorClass
                              : visuals.colorClass
                        } ${draggingEventId === event.id ? 'opacity-40 scale-95' : ''}`}
                      >
                        {/* Event Content */}
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <SportIcon className="w-3.5 h-3.5 shrink-0" />
                            <span className="font-semibold truncate text-[11px] text-slate-100">
                              {event.title}
                            </span>
                          </div>
                          {isPlanned && (
                            <GripVertical className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          )}
                        </div>

                        {/* Status Footer */}
                        <div className="mt-2 flex items-center justify-between text-[10px]">
                          <span className={`px-1.5 py-0.5 rounded-md font-medium ${visuals.badgeClass}`}>
                            {visuals.tag}
                          </span>

                          <div className="flex items-center gap-1">
                            {isCompleted && (
                              <span className="flex items-center gap-0.5 text-emerald-400 font-semibold">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Feito</span>
                              </span>
                            )}
                            {isSkipped && (
                              <span className="flex items-center gap-0.5 text-slate-500">
                                <XCircle className="w-3 h-3" />
                                <span>Pulado</span>
                              </span>
                            )}
                            {isPlanned && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSkipTarget(event);
                                  setIsSkipOpen(true);
                                }}
                                className="text-slate-400 hover:text-amber-300 transition-colors px-1 py-0.5 rounded hover:bg-slate-800/80"
                                title="Pular treino"
                              >
                                Pular
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Weekly Volume Totals Footer */}
      <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <Dumbbell className="w-3.5 h-3.5 text-indigo-400" />
            <strong className="text-indigo-300">{strengthCount}</strong> musculação
          </span>
          <span className="flex items-center gap-1.5 text-slate-300">
            <Footprints className="w-3.5 h-3.5 text-emerald-400" />
            <strong className="text-emerald-300">{runningCount}</strong> corrida
          </span>
          <span className="flex items-center gap-1.5 text-slate-300">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <strong className="text-amber-300">{crossCount}</strong> cross-training
          </span>
        </div>
        <div className="text-[11px] text-slate-500 italic">
          💡 Dica: Arraste os treinos planejados entre os dias para reagendar.
        </div>
      </div>

      {/* Skip Workout Dialog */}
      <SkipWorkoutDialog
        isOpen={isSkipOpen}
        onClose={() => {
          setIsSkipOpen(false);
          setSkipTarget(null);
        }}
        event={skipTarget}
        onSuccess={refreshCalendar}
      />

      {/* Cross-Training Modal */}
      <CrossTrainingModal
        isOpen={isCrossModalOpen}
        onClose={() => setIsCrossModalOpen(false)}
        onSuccess={refreshCalendar}
      />
    </div>
  );
}
