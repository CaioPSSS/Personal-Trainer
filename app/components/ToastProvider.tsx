'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  duration?: number;
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string, title?: string, duration?: number) => void;
  success: (message: string, title?: string, duration?: number) => void;
  error: (message: string, title?: string, duration?: number) => void;
  info: (message: string, title?: string, duration?: number) => void;
  warning: (message: string, title?: string, duration?: number) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string, title?: string, duration = 4000) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setToasts((prev) => [...prev, { id, type, message, title, duration }]);
    },
    []
  );

  const success = useCallback(
    (message: string, title?: string, duration?: number) => showToast('success', message, title, duration),
    [showToast]
  );
  const error = useCallback(
    (message: string, title?: string, duration?: number) => showToast('error', message, title, duration),
    [showToast]
  );
  const info = useCallback(
    (message: string, title?: string, duration?: number) => showToast('info', message, title, duration),
    [showToast]
  );
  const warning = useCallback(
    (message: string, title?: string, duration?: number) => showToast('warning', message, title, duration),
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, success, error, info, warning, dismissToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => dismissToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    const duration = toast.duration ?? 4000;
    if (duration <= 0) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, duration);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const typeStyles: Record<
    ToastType,
    { border: string; bg: string; text: string; icon: React.ReactNode; barBg: string }
  > = {
    success: {
      border: 'border-emerald-500/40',
      bg: 'bg-slate-900/95',
      text: 'text-emerald-300',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />,
      barBg: 'bg-emerald-500',
    },
    error: {
      border: 'border-rose-500/40',
      bg: 'bg-slate-900/95',
      text: 'text-rose-300',
      icon: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />,
      barBg: 'bg-rose-500',
    },
    warning: {
      border: 'border-amber-500/40',
      bg: 'bg-slate-900/95',
      text: 'text-amber-300',
      icon: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />,
      barBg: 'bg-amber-500',
    },
    info: {
      border: 'border-indigo-500/40',
      bg: 'bg-slate-900/95',
      text: 'text-indigo-300',
      icon: <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />,
      barBg: 'bg-indigo-500',
    },
  };

  const style = typeStyles[toast.type];

  return (
    <div
      role="alert"
      className={`pointer-events-auto overflow-hidden rounded-xl border ${style.border} ${style.bg} backdrop-blur-xl p-3.5 shadow-xl transition-all duration-300 animate-in fade-in slide-in-from-top-2`}
    >
      <div className="flex items-start gap-3">
        {style.icon}
        <div className="flex-1 min-w-0">
          {toast.title && <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">{toast.title}</h4>}
          <p className="text-xs text-slate-300 leading-relaxed break-words">{toast.message}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-800/80 shrink-0"
          aria-label="Fechar notificação"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
