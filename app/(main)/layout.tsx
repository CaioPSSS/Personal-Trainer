import React, { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import DesktopSidebar from '../components/DesktopSidebar';
import BottomNav from '../components/BottomNav';

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Desktop Sidebar (>= 1024px) */}
      <DesktopSidebar />

      {/* Mobile Top Header (< 1024px) */}
      <header className="lg:hidden sticky top-0 z-40 h-14 bg-slate-950/85 backdrop-blur-xl border-b border-slate-800/80 px-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-700/60 bg-slate-900 flex items-center justify-center">
            <Image
              src="/personal_trainer.svg"
              alt="Personal Trainer"
              width={32}
              height={32}
              className="w-full h-full object-cover"
              priority
            />
          </div>
          <span className="font-extrabold text-sm tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-emerald-300 to-amber-300">
            Personal Trainer
          </span>
        </Link>
        <Link
          href="/settings"
          className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white"
        >
          Perfil
        </Link>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col">
        <main className="flex-1 pb-20 lg:pb-10 page-enter">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation (< 1024px) */}
      <BottomNav />
    </div>
  );
}
