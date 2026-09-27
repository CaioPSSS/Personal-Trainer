'use client';

import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, Calendar as CalendarIcon } from 'lucide-react';

interface MonthlyCalendarProps {
  onSelectDate?: (dateStr: string) => void;
  onClose?: () => void;
}

interface CalendarMonthEvent {
  id: string;
  date: string;
  eventType: string;
  status: string;
}

const WEEK_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function MonthlyCalendar({ onSelectDate, onClose }: MonthlyCalendarProps) {
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [events, setEvents] = useState<CalendarMonthEvent[]>([]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  // First day of month
  const firstDayOfMonth = new Date(year, month, 1);
  // Last day of month
  const lastDayOfMonth = new Date(year, month + 1, 0);

  // Monday-based offset for first day
  // getDay(): 0 is Sun, 1 is Mon...
  const firstDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7; // 0 for Mon, 6 for Sun
  const totalDays = lastDayOfMonth.getDate();

  const startDateStr = formatDateISO(new Date(year, month, 1));
  const endDateStr = formatDateISO(lastDayOfMonth);
  const todayStr = formatDateISO(new Date());

  useEffect(() => {
    let active = true;
    const loadMonthEvents = async () => {
      try {
        const res = await fetch(`/api/calendar?startDate=${startDateStr}&endDate=${endDateStr}`);
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          setEvents(data.events || []);
        }
      } catch (err) {
        console.error('Falha ao carregar eventos do mês:', err);
      }
    };

    loadMonthEvents();
    return () => {
      active = false;
    };
  }, [startDateStr, endDateStr]);

  const handlePrevMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const getDotColor = (eventType: string) => {
    switch (eventType) {
      case 'strength':
        return 'bg-indigo-400';
      case 'running':
        return 'bg-emerald-400';
      case 'crossfit':
        return 'bg-amber-400';
      case 'swimming':
        return 'bg-cyan-400';
      default:
        return 'bg-slate-400';
    }
  };

  // Build grid cells (days from month + padding before and after)
  const cells: Array<{
    dayNumber?: number;
    dateStr?: string;
    isCurrentMonth: boolean;
    isToday?: boolean;
  }> = [];

  // Padding cells before first day
  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push({ isCurrentMonth: false });
  }

  // Actual days
  for (let d = 1; d <= totalDays; d++) {
    const dObj = new Date(year, month, d);
    const dateStr = formatDateISO(dObj);
    cells.push({
      dayNumber: d,
      dateStr,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
    });
  }

  // Padding to complete grid to multiple of 7
  while (cells.length % 7 !== 0 || cells.length < 35) {
    cells.push({ isCurrentMonth: false });
  }

  const monthName = firstDayOfMonth.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="glass-card p-5 space-y-4 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-bold text-slate-100 capitalize">
            {monthName}
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Mês anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setCurrentDate(new Date())}
            className="px-2 py-0.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Próximo mês"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="ml-2 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Fechar visão mensal"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Week day labels */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEK_DAYS.map((day) => (
          <span key={day} className="text-[11px] font-semibold text-slate-500 py-1">
            {day}
          </span>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((cell, idx) => {
          if (!cell.isCurrentMonth || !cell.dateStr) {
            return (
              <div
                key={`empty-${idx}`}
                className="h-14 rounded-xl border border-slate-900/50 bg-slate-950/20"
              />
            );
          }

          const dayEvents = events.filter((e) => e.date === cell.dateStr);

          return (
            <button
              key={cell.dateStr}
              type="button"
              onClick={() => onSelectDate?.(cell.dateStr!)}
              className={`h-14 rounded-xl border p-1.5 flex flex-col justify-between items-center transition-all duration-150 ${
                cell.isToday
                  ? 'border-indigo-500/60 bg-indigo-950/30'
                  : 'border-slate-800/80 bg-slate-900/50 hover:bg-slate-800/60 hover:border-slate-700'
              }`}
            >
              <span
                className={`text-[11px] font-bold ${
                  cell.isToday
                    ? 'text-indigo-300'
                    : 'text-slate-300'
                }`}
              >
                {cell.dayNumber}
              </span>

              {/* Dots */}
              <div className="flex items-center gap-1 justify-center flex-wrap max-w-full">
                {dayEvents.slice(0, 3).map((ev) => (
                  <span
                    key={ev.id}
                    className={`w-1.5 h-1.5 rounded-full ${getDotColor(ev.eventType)}`}
                    title={`${ev.eventType} (${ev.status})`}
                  />
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-[8px] text-slate-400">+{dayEvents.length - 3}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-4 pt-2 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-indigo-400" />
          Musculação
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          Corrida
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          CrossFit
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-cyan-400" />
          Natação
        </span>
      </div>
    </div>
  );
}
