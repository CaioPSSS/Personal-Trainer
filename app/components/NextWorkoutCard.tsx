'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Dumbbell, Footprints, Flame, Waves, ArrowRight, Calendar } from 'lucide-react';
import SkipWorkoutDialog from './SkipWorkoutDialog';

export interface NextWorkoutEvent {
  id: string;
  title: string;
  eventType: string;
  date: string;
  status: string;
}

interface NextWorkoutCardProps {
  initialEvent?: NextWorkoutEvent | null;
  onRefresh?: () => void;
}

export default function NextWorkoutCard({ initialEvent, onRefresh }: NextWorkoutCardProps) {
  const [fetchedEvent, setFetchedEvent] = useState<NextWorkoutEvent | null>(null);
  const [loading, setLoading] = useState(initialEvent === undefined);
  const [isSkipOpen, setIsSkipOpen] = useState(false);

  useEffect(() => {
    if (initialEvent !== undefined) return;

    let active = true;
    const fetchNextWorkout = async () => {
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const res = await fetch(`/api/calendar?startDate=${todayStr}`);
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          const plannedEvents: NextWorkoutEvent[] = (data.events || []).filter(
            (e: NextWorkoutEvent) => e.status === 'planned'
          );
          setFetchedEvent(plannedEvents[0] || null);
        }
      } catch (err) {
        console.error('Falha ao carregar próximo treino:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchNextWorkout();
    return () => {
      active = false;
    };
  }, [initialEvent]);

  const event = initialEvent !== undefined ? initialEvent : fetchedEvent;

  const handleSkipSuccess = () => {
    setFetchedEvent(null);
    onRefresh?.();
  };

  const getSportVisuals = (eventType: string) => {
    switch (eventType) {
      case 'strength':
        return {
          icon: Dumbbell,
          tag: 'Musculação',
          href: '/strength',
          color: 'from-indigo-600/30 to-slate-900',
          border: 'border-indigo-500/40',
          badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
          btnClass: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20',
        };
      case 'running':
        return {
          icon: Footprints,
          tag: 'Corrida',
          href: '/running',
          color: 'from-emerald-600/30 to-slate-900',
          border: 'border-emerald-500/40',
          badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
          btnClass: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20',
        };
      case 'crossfit':
        return {
          icon: Flame,
          tag: 'CrossFit',
          href: '/',
          color: 'from-amber-600/30 to-slate-900',
          border: 'border-amber-500/40',
          badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          btnClass: 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-500/20',
        };
      default:
        return {
          icon: Waves,
          tag: 'Atividade',
          href: '/',
          color: 'from-cyan-600/30 to-slate-900',
          border: 'border-cyan-500/40',
          badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
          btnClass: 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-500/20',
        };
    }
  };

  if (loading) {
    return (
      <div className="glass-card p-6 animate-pulse flex flex-col justify-between min-h-[160px]">
        <div className="h-4 bg-slate-800 rounded w-1/4 mb-3" />
        <div className="h-7 bg-slate-800 rounded w-1/2 mb-4" />
        <div className="h-10 bg-slate-800 rounded w-1/3" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="glass-card p-6 border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            <span>Próximo Treino</span>
          </div>
          <h3 className="text-lg font-bold text-slate-200">
            Nenhum treino planejado na fila imediata
          </h3>
          <p className="text-xs text-slate-400">
            Aproveite seu descanso ou confira os programas disponíveis em Musculação e Corrida.
          </p>
        </div>
        <Link
          href="/strength"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
        >
          <span>Ir para Musculação</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  const visuals = getSportVisuals(event.eventType);
  const SportIcon = visuals.icon;
  const todayStr = new Date().toISOString().split('T')[0];
  const isToday = event.date === todayStr;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${visuals.border} bg-gradient-to-br ${visuals.color} p-6 shadow-xl backdrop-blur-xl`}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-2">
          {/* Header Tag */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${visuals.badge}`}
            >
              <SportIcon className="w-3.5 h-3.5" />
              {visuals.tag}
            </span>
            <span className="text-xs text-slate-300 font-medium">
              {isToday ? (
                <span className="text-emerald-400 font-bold">● Hoje</span>
              ) : (
                `Data: ${event.date}`
              )}
            </span>
          </div>

          {/* Title */}
          <h2 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight">
            {event.title}
          </h2>
          <p className="text-xs text-slate-300 max-w-lg">
            Sua próxima sessão está pronta para execução. Registre suas cargas e repetições para manter a periodização calibrada.
          </p>
        </div>

        {/* Action CTAs */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsSkipOpen(true)}
            className="px-3.5 py-2.5 rounded-xl text-xs font-semibold border border-slate-700/80 bg-slate-900/60 hover:bg-slate-800 text-slate-300 hover:text-slate-100 transition"
          >
            Pular Treino
          </button>
          <Link
            href={visuals.href}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${visuals.btnClass}`}
          >
            <span>Iniciar Treino</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      <SkipWorkoutDialog
        isOpen={isSkipOpen}
        onClose={() => setIsSkipOpen(false)}
        event={event}
        onSuccess={handleSkipSuccess}
      />
    </div>
  );
}
