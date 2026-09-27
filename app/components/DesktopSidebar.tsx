'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Dumbbell, Footprints, Settings, Sparkles, Plus } from 'lucide-react';
import CrossTrainingModal from './CrossTrainingModal';

const NAV_ITEMS = [
  { href: '/', label: 'Início', icon: LayoutDashboard, badge: 'Geral' },
  { href: '/strength', label: 'Musculação', icon: Dumbbell, badge: 'Hipertrofia' },
  { href: '/running', label: 'Corrida', icon: Footprints, badge: 'Strava AI' },
  { href: '/settings', label: 'Perfil & Ajustes', icon: Settings, badge: null },
];

export default function DesktopSidebar() {
  const pathname = usePathname();
  const [isCrossModalOpen, setIsCrossModalOpen] = useState(false);

  return (
    <aside
      aria-label="Menu principal"
      className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-slate-950/90 backdrop-blur-xl border-r border-slate-800/80 z-40 p-5 justify-between"
    >
      <div className="space-y-6">
        {/* Brand Lockup */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative w-10 h-10 rounded-xl overflow-hidden shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform duration-200 border border-slate-700/60 bg-slate-900 flex items-center justify-center">
            <Image
              src="/personal_trainer.svg"
              alt="Personal Trainer Multi-Sport"
              width={40}
              height={40}
              className="w-full h-full object-cover"
              priority
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-base tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-emerald-300 to-amber-300">
                Personal Trainer
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">
                Multi-Sport AI
              </span>
            </div>
          </div>
        </Link>

        {/* Navigation Items */}
        <nav className="space-y-1.5 pt-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 shadow-sm shadow-indigo-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      isActive
                        ? 'bg-indigo-500/20 text-indigo-300'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Quick Action: Register Cross-Training */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setIsCrossModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 hover:border-amber-400/50 shadow-sm shadow-amber-500/10 transition-all duration-200"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            <span>+ Registrar Atividade</span>
          </button>
        </div>
      </div>

      {/* Footer Profile Shortcut */}
      <div className="pt-4 border-t border-slate-800/80">
        <Link
          href="/settings"
          className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-800/60 transition-colors border border-slate-800/60"
        >
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-xs font-bold text-indigo-300">
            AT
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-200 truncate">Atleta</p>
            <p className="text-[10px] text-slate-400 truncate">Configurações & Strava</p>
          </div>
        </Link>
      </div>

      <CrossTrainingModal
        isOpen={isCrossModalOpen}
        onClose={() => setIsCrossModalOpen(false)}
      />
    </aside>
  );
}
