'use client';

import { FormEvent, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Dumbbell, Sparkles } from 'lucide-react';
import OnboardingForm, { AthleteProfileFormState } from './OnboardingForm';
import CoachInsights from './CoachInsights';
import HypertrophyDailyTracker from './HypertrophyDailyTracker';
import { ErrorBoundary } from './ErrorBoundary';

import { AthleteProfile as PrismaAthleteProfile, MesocyclePlan } from '@prisma/client';

type AthleteProfile = PrismaAthleteProfile & {
  mesocycles?: MesocyclePlan[];
};

interface DashboardClientProps {
  initialAthleteProfile: AthleteProfile | null;
}

export default function DashboardClient({ initialAthleteProfile }: DashboardClientProps) {
  const router = useRouter();
  const [athleteProfile, setAthleteProfile] = useState<AthleteProfile | null>(initialAthleteProfile);
  const hasActiveMesocycle = (athleteProfile?.mesocycles?.length ?? 0) > 0;
  
  const [setupForm, setSetupForm] = useState<AthleteProfileFormState>({
    displayName: initialAthleteProfile?.displayName || '',
    trainingAgeYears: initialAthleteProfile?.trainingAgeYears?.toString() || '',
    sessionDurationMin: initialAthleteProfile?.sessionDurationMin?.toString() || '60',
    athleteContext: (initialAthleteProfile?.athleteContext as string) || '',
    availableEquipment: Array.isArray(initialAthleteProfile?.availableEquipment) 
      ? (initialAthleteProfile.availableEquipment as string[]) 
      : ['barbell', 'dumbbells', 'cables'],
    movementRestrictions: (initialAthleteProfile?.movementRestrictions as string) || '',
  });

  const [clientMessage, setClientMessage] = useState({ type: '', text: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [coachRunState, setCoachRunState] = useState<'idle' | 'running' | 'validated' | 'failed'>('idle');
  const [coachRunMessage, setCoachRunMessage] = useState('');
  const [cooldownTimeLeft, setCooldownTimeLeft] = useState(0);

  useEffect(() => {
    if (cooldownTimeLeft <= 0) return;
    const interval = setInterval(() => {
      setCooldownTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownTimeLeft]);

  const handleSetupSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setClientMessage({ type: '', text: '' });
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setupForm),
      });

      if (!response.ok) {
        throw new Error('Falha ao configurar perfil.');
      }

      const newProfile = await response.json();
      setAthleteProfile(newProfile);
      setClientMessage({ type: 'success', text: 'Perfil configurado com sucesso!' });
      router.refresh();
    } catch (err) {
      console.error(err);
      setClientMessage({ type: 'error', text: 'Não foi possível configurar seu perfil.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForceGeneration = async () => {
    if (coachRunState === 'running' || cooldownTimeLeft > 0) {
      return;
    }

    setCoachRunState('running');
    setCoachRunMessage('Gerando novo mesociclo com validação de contrato...');

    try {
      const response = await fetch('/api/coach/master/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': process.env.NEXT_PUBLIC_INTERNAL_SECRET || '',
        },
      });

      if (!response.ok) {
        throw new Error('Falha ao gerar plano de treino.');
      }

      const data = await response.json();
      setCoachRunState('validated');
      setCoachRunMessage(`Novo bloco gerado com sucesso (tentativas: ${data.attempts ?? 1}).`);
      setCooldownTimeLeft(30);
      setTimeout(() => {
        router.refresh();
      }, 1550);
    } catch (error) {
      console.error('Falha ao forçar geração do mesociclo.', error);
      setCoachRunState('failed');
      setCoachRunMessage('A IA falhou na geração. Use ajuste manual do treino e tente novamente.');
      setCooldownTimeLeft(30);
    }
  };

  const handleManualAdjust = () => {
    setCoachRunMessage('Modo manual ativado: ajuste os dados do treino diretamente no formulário abaixo.');
    setClientMessage({ type: 'info', text: 'Override manual ativo. Faça os ajustes e salve normalmente.' });
  };

  if (!athleteProfile) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        {clientMessage.text && (
          <div className={`w-full max-w-xl p-4 mb-4 rounded-xl border text-sm ${
            clientMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
          }`}>
            {clientMessage.text}
          </div>
        )}
        <OnboardingForm 
          setupForm={setupForm} 
          setSetupForm={setSetupForm} 
          onSubmit={handleSetupSubmit} 
          isSubmitting={isSubmitting} 
        />
      </div>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-4 sm:p-8 space-y-8">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-emerald-400">
            Olá, {athleteProfile.displayName || 'Atleta'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">Sua central inteligente de periodização e registro.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualAdjust}
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20"
            >
              Ajustar/Editar Treino
            </button>
            <button
              type="button"
              onClick={handleForceGeneration}
              disabled={coachRunState === 'running' || cooldownTimeLeft > 0}
              className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {coachRunState === 'running' ? 'Gerando...' : cooldownTimeLeft > 0 ? `Aguarde ${cooldownTimeLeft}s` : 'Forçar Nova Geração'}
            </button>
          </div>
        </div>
      </div>

      {coachRunMessage ? (
        <section
          className={`rounded-xl border p-3 text-sm ${
            coachRunState === 'failed'
              ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
              : coachRunState === 'validated'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-slate-700 bg-slate-900/50 text-slate-300'
          }`}
        >
          {coachRunMessage}
        </section>
      ) : null}

      {/* 🧠 Coach Insights Panel */}
      {hasActiveMesocycle && (
        <ErrorBoundary fallback={<div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 text-rose-300 text-sm">⚠️ Erro ao carregar insights do treinador.</div>}>
          <CoachInsights key={coachRunState} />
        </ErrorBoundary>
      )}

      {/* 🏋️ Daily Hypertrophy Workout Tracker or Active Block CTA */}
      {hasActiveMesocycle ? (
        <section className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-100 mb-4 flex items-center gap-2">
            <Dumbbell className="h-5 w-5 text-indigo-400" />
            <span>Ficha de Treino & Registro Diário</span>
          </h2>
          <ErrorBoundary fallback={<div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 text-rose-300 text-sm">⚠️ Erro crítico ao carregar a ficha de treino.</div>}>
            <HypertrophyDailyTracker onSaved={() => router.refresh()} />
          </ErrorBoundary>
        </section>
      ) : (
        <section className="bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center space-y-6 max-w-2xl mx-auto shadow-xl">
          <div className="mx-auto w-16 h-16 bg-indigo-500/10 text-indigo-400 rounded-2xl border border-indigo-500/20 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-indigo-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-100">Criar Seu Novo Mesociclo de Hipertrofia</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Você ainda não tem um bloco de treino ativo. O Master Coach IA (NVIDIA Nemotron 3 Ultra) e o Data Analyst IA (gpt-oss-120b) analisarão seu perfil de atleta e histórico para planejar uma periodização estratégica de 4 a 6 semanas.
            </p>
          </div>
          <button
            type="button"
            onClick={handleForceGeneration}
            disabled={coachRunState === 'running' || cooldownTimeLeft > 0}
            className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-slate-100 font-bold px-8 py-4 rounded-xl transition duration-200 shadow-lg shadow-indigo-500/20 disabled:opacity-65 disabled:cursor-not-allowed cursor-pointer text-sm"
          >
            {coachRunState === 'running' ? (
              <>
                <span className="h-4 w-4 border-2 border-slate-200 border-t-transparent rounded-full animate-spin" />
                <span>Analisando Histórico & Projetando Bloco...</span>
              </>
            ) : cooldownTimeLeft > 0 ? (
              <span>Aguarde {cooldownTimeLeft}s para tentar novamente</span>
            ) : (
              <>
                <Dumbbell className="h-4 w-4" />
                <span>Gerar Meu Novo Bloco de Treino</span>
              </>
            )}
          </button>
        </section>
      )}
    </main>
  );
}
