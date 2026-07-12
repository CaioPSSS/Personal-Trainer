'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import OnboardingForm from './OnboardingForm';
import DailyEntryForm from './DailyEntryForm';
import MetabolicCharts from './MetabolicCharts';
import RecentHistoryTable from './RecentHistoryTable';
import { useMetabolicData, Log, Settings, LogFormState, SetupFormState } from '@/app/hooks/useMetabolicData';
import { getYesterdayLocalISODate } from '@/lib/dateUtils';

interface DashboardClientProps {
  initialSettings: Settings | null;
  initialLogs: Log[];
  initialInsights: string[];
}

const initialSetupForm: SetupFormState = {
  age: '',
  height: '',
  weight: '',
  gender: 'M',
  activityLevel: '1.375',
  goal: 'loss',
  weeklyRate: '-0.5',
};

const initialLogForm: LogFormState = {
  date: getYesterdayLocalISODate(),
  weight: '',
  caloriesConsumed: '',
  caloriesBurned: '',
  trainingType: 'Descanso',
  sleepHours: '',
  waterIntake: '',
  stressLevel: '3',
  mood: 'Regular',
  proteinConsumed: '',
  waistCircumference: '',
};

interface AiReportSummary {
  id: string;
  createdAt: string;
  content: string;
  isRead: boolean;
}

function average(values: number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export default function DashboardClient({ initialSettings, initialLogs, initialInsights }: DashboardClientProps) {
  const { settings, logs, insights, loading, error, refresh, addLog } = useMetabolicData(
    initialSettings,
    initialLogs,
    initialInsights,
  );

  const [setupForm, setSetupForm] = useState<SetupFormState>(initialSetupForm);
  const [logForm, setLogForm] = useState(initialLogForm);
  const [clientMessage, setClientMessage] = useState({ type: '', text: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [unreadReport, setUnreadReport] = useState<AiReportSummary | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadUnreadReport = async () => {
      try {
        const response = await fetch('/api/reports/unread');
        if (!response.ok) {
          return;
        }

        const data = await response.json();
        setUnreadReport(data.report ?? null);
      } catch (error) {
        console.error('Falha ao buscar relatório não lido.', error);
      }
    };

    void loadUnreadReport();
  }, []);

  const recentLogs = logs.slice(0, 7);
  const recentWeights = recentLogs.map((log) => log.weight).filter((w): w is number => w !== null);
  const recentCalories = recentLogs.map((log) => log.caloriesConsumed).filter((c): c is number => c !== null);
  const recentSleep = recentLogs.map((log) => log.sleepHours).filter((s): s is number => s !== null);
  const recentWater = recentLogs.map((log) => log.waterIntake).filter((w): w is number => w !== null);
  const recentStress = recentLogs.map((log) => log.stressLevel).filter((s): s is number => s !== null);

  const alerts: string[] = [];

  if (settings && recentCalories.length >= 3) {
    const averageCalories = average(recentCalories);
    if (averageCalories > settings.currentCalorieTarget + 150) {
      alerts.push('A ingestão média está acima da meta. Revisite o planejamento das refeições.');
    } else if (averageCalories < settings.currentCalorieTarget - 150) {
      alerts.push('A ingestão média está abaixo do alvo. Revise a consistência e a recuperação.');
    }
  }

  if (recentSleep.length >= 3 && average(recentSleep) < 7) {
    alerts.push('O sono da semana está abaixo de 7 horas. Isso pode prejudicar a recuperação.');
  }

  if (recentWater.length >= 3 && average(recentWater) < 2000) {
    alerts.push('A hidratação média está baixa. Um ajuste de água pode melhorar o desempenho.');
  }

  if (recentStress.length >= 3 && average(recentStress) >= 4) {
    alerts.push('O estresse da semana está alto. Uma rotina mais leve pode ajudar.');
  }

  if (recentWeights.length === 0) {
    alerts.push('Ainda não há pesos recentes para avaliar a tendência.');
  }

  const handleSetupSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setClientMessage({ type: '', text: '' });

    await fetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(setupForm),
    });

    await refresh();
  };

  const resetLogForm = () => {
    setLogForm({ ...initialLogForm, date: getYesterdayLocalISODate() });
    setIsEditing(false);
    setClientMessage({ type: '', text: '' });
  };

  const handleEditLog = (log: Log) => {
    setLogForm({
      date: log.date,
      weight: log.weight?.toString() || '',
      caloriesConsumed: log.caloriesConsumed?.toString() || '',
      caloriesBurned: log.caloriesBurned?.toString() || '',
      trainingType: log.trainingType,
      sleepHours: log.sleepHours?.toString() || '',
      waterIntake: log.waterIntake?.toString() || '',
      stressLevel: log.stressLevel?.toString() || '3',
      mood: log.mood || 'Regular',
      proteinConsumed: log.proteinConsumed?.toString() || '',
      waistCircumference: log.waistCircumference?.toString() || '',
    });
    setIsEditing(true);
    setClientMessage({ type: 'info', text: `Modo de edição ativado para ${log.date}.` });
  };

  const handleLogSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setClientMessage({ type: '', text: '' });

    if (logForm.trainingType === 'Livre') {
      const last7DaysLogs = logs.slice(0, 7);
      const freeDaysCount = last7DaysLogs.filter((l) => l.trainingType === 'Livre' && l.date !== logForm.date).length;
      if (freeDaysCount >= 1) {
        setClientMessage({ type: 'error', text: 'Atenção: Você já utilizou um Dia Livre nos últimos 7 dias. Foque na constância!' });
        return;
      }
    }

    try {
      await addLog(logForm);
      setClientMessage({ type: 'success', text: isEditing ? 'Registro atualizado com sucesso.' : 'Dados computados com sucesso! O algoritmo recalculou seu progresso.' });
      resetLogForm();
    } catch {
      setClientMessage({ type: 'error', text: 'Falha ao salvar o registro. Verifique a conexão e tente novamente.' });
    }
  };

  const handleCloseReport = async () => {
    if (!unreadReport || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      await fetch(`/api/reports/${unreadReport.id}/read`, { method: 'POST' });
    } catch (error) {
      console.error('Falha ao marcar relatório como lido.', error);
    } finally {
      setShowModal(false);
      setUnreadReport(null);
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-xl">Carregando dados metabólicos...</div>;
  }

  if (error) {
    return <div className="flex items-center justify-center min-h-screen text-xl text-rose-400">{error}</div>;
  }

  if (!settings) {
    return <OnboardingForm setupForm={setupForm} setSetupForm={setSetupForm} onSubmit={handleSetupSubmit} />;
  }

  return (
    <main className="max-w-6xl mx-auto p-4 sm:p-8 space-y-8">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-emerald-400">Metabolic Tracker</h1>
          <p className="text-slate-400 text-sm mt-1">Sincronização cross-device ativada na infraestrutura Vercel.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => unreadReport !== null && setShowModal(true)}
            className="relative rounded-full border border-slate-700/70 bg-slate-900/70 p-3 text-slate-200 transition hover:border-cyan-400 hover:text-cyan-300"
            aria-label="Abrir relatório clínico"
          >
            <Bell className={`h-5 w-5 ${unreadReport ? 'animate-pulse' : ''}`} />
            {unreadReport ? <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-rose-500" /> : null}
          </button>
          <div className="bg-slate-900/60 border border-slate-700/50 px-5 py-3 rounded-xl text-center">
            <span className="text-xs uppercase text-slate-400 block tracking-wider">Meta Calórica Atual</span>
            <span className="text-2xl font-black text-emerald-400">{settings.currentCalorieTarget} kcal</span>
          </div>
        </div>
      </div>

      {showModal && unreadReport !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8">
          <div className="w-full max-w-3xl rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Análise Clínica Semanal</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-100">Relatório de recuperação e performance</h2>
              </div>
              <button
                type="button"
                onClick={handleCloseReport}
                disabled={isSubmitting}
                className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Ciente. Fechar e Arquivar.
              </button>
            </div>
            <div className="mt-5 max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
              <div className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-300">
                {unreadReport.content}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <section className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-200 mb-4">💡 Insights Automáticos</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
            <p className="text-xs uppercase text-slate-400">Média de calorias</p>
            <p className="text-xl font-semibold text-emerald-400">{recentCalories.length > 0 ? `${Math.round(average(recentCalories))} kcal` : '—'}</p>
          </div>
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
            <p className="text-xs uppercase text-slate-400">Sono médio</p>
            <p className="text-xl font-semibold text-sky-400">{recentSleep.length > 0 ? `${average(recentSleep).toFixed(1)}h` : '—'}</p>
          </div>
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
            <p className="text-xs uppercase text-slate-400">Água média</p>
            <p className="text-xl font-semibold text-cyan-400">{recentWater.length > 0 ? `${Math.round(average(recentWater))} ml` : '—'}</p>
          </div>
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
            <p className="text-xs uppercase text-slate-400">Tendência de peso</p>
            <p className="text-xl font-semibold text-amber-400">{recentWeights.length >= 2 ? `${(recentWeights[recentWeights.length - 1] - recentWeights[0]).toFixed(1)} kg` : '—'}</p>
          </div>
        </div>
        <div className="space-y-3">
          {insights.length > 0 ? (
            insights.map((insight, index) => (
              <p key={index} className="text-slate-300 text-sm leading-6">• {insight}</p>
            ))
          ) : (
            <p className="text-slate-500 text-sm">Ainda não há insights suficientes. Registre mais dias para receber recomendações.</p>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-8">
        <DailyEntryForm
          logForm={logForm}
          setLogForm={setLogForm}
          onSubmit={handleLogSubmit}
          onReset={resetLogForm}
          isEditing={isEditing}
          clientMessage={clientMessage}
          alerts={alerts}
        />

        <MetabolicCharts logs={logs} settings={settings} />
      </div>

      <RecentHistoryTable logs={logs} onEditLog={handleEditLog} />
    </main>
  );
}
