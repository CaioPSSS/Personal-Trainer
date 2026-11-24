'use client';

import React, { FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Lock, ArrowRight, AlertCircle, Sparkles } from 'lucide-react';

function sanitizeNextPath(rawNext: string | null): string {
  if (!rawNext || !rawNext.startsWith('/') || rawNext.startsWith('//')) {
    return '/';
  }
  return rawNext;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!password.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage(data.error || 'Falha ao autenticar. Verifique sua senha.');
        return;
      }

      const nextPath = sanitizeNextPath(searchParams.get('next'));
      window.location.assign(nextPath);
    } catch {
      setErrorMessage('Erro de conexão com o servidor. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md glass-card p-6 sm:p-8 space-y-6 border border-slate-800/90 shadow-2xl">
        <div className="space-y-2 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Lock className="w-6 h-6" />
          </div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Multi-Sport AI</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-100 tracking-tight">
            Personal Trainer — Acesso Restrito
          </h1>
          <p className="text-xs text-slate-400">
            Informe sua senha de acesso para desbloquear seu painel de treinos e biometria.
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="access-password" className="block text-xs font-semibold text-slate-300">
              Senha de Acesso
            </label>
            <input
              id="access-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite sua senha"
              className="w-full rounded-xl bg-slate-900 border border-slate-700 focus:border-indigo-500 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !password.trim()}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold text-sm py-3 px-4 shadow-lg shadow-indigo-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <span>{isSubmitting ? 'Verificando...' : 'Entrar no Painel'}</span>
            {!isSubmitting && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-card p-8 h-64 animate-pulse" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
