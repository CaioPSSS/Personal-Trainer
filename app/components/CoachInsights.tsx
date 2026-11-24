'use client';

import { useState, useEffect } from 'react';
import {
  Brain,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Star,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import HealthDisclaimer from '@/app/components/HealthDisclaimer';
import { formatMovementPattern } from '@/lib/labels';

interface PerformanceDelta {
  exerciseName: string;
  movementPattern: string;
  observedProgression: 'improved' | 'stagnant' | 'regressed' | 'insufficient_data';
  loadTrendKgPerWeek: number | null;
  repTrendPerWeek: number | null;
  rpeAccuracyRate: number | null;
  fatigueImpact: 'low' | 'moderate' | 'high' | 'unknown';
  notes: string;
}

interface CoachInsightsData {
  active: boolean;
  message?: string;
  mesocycle?: {
    id: string;
    title: string;
    objective: string;
    split: string;
    durationWeeks: number;
  };
  coachBrain?: {
    hypotheses: string[];
    rationale: string[];
    nextCycleWatchouts: string[];
    retrospective: {
      whatWorked: string[];
      whatFailed: string[];
      confidenceScore: number;
      correctionActions: string[];
    } | null;
  } | null;
  analystReport?: {
    executiveSummary: string;
    exercisePerformance: PerformanceDelta[];
    progressionSignals: {
      progressionCompliance: 'high' | 'moderate' | 'low';
      keyBottlenecks: string[];
      recoveryConstraints: string[];
    };
    recommendationsForMaster: string[];
  } | null;
}

interface AssistantAlertItem {
  id: string;
  date: string;
  alertType: string;
  severity: string;
  message: string;
  metadata?: {
    action?: string;
    source?: string;
    score?: number;
    readinessScore?: number;
    recommendations?: Array<{ title?: string; reason?: string }>;
  } | null;
}

export default function CoachInsights() {
  const [data, setData] = useState<CoachInsightsData | null>(null);
  const [alerts, setAlerts] = useState<AssistantAlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [evaluatingFatigue, setEvaluatingFatigue] = useState(false);
  const [resolvingAlertId, setResolvingAlertId] = useState<string | null>(null);
  const [fatigueStatusMsg, setFatigueStatusMsg] = useState<{ text: string; isFallback?: boolean } | null>(null);

  useEffect(() => {
    const fetchInsightsAndAlerts = async () => {
      try {
        const [insightsRes, alertsRes] = await Promise.allSettled([
          fetch('/api/coach/insights'),
          fetch('/api/coach/assistant'),
        ]);

        if (insightsRes.status === 'fulfilled' && insightsRes.value.ok) {
          const json = await insightsRes.value.json();
          setData(json);
        } else if (insightsRes.status === 'fulfilled') {
          throw new Error('Falha ao carregar insights do treinador.');
        }

        if (alertsRes.status === 'fulfilled' && alertsRes.value.ok) {
          const alertsJson = await alertsRes.value.json();
          if (Array.isArray(alertsJson?.alerts)) {
            setAlerts(alertsJson.alerts);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido');
      } finally {
        setLoading(false);
      }
    };
    void fetchInsightsAndAlerts();
  }, []);

  const handleDismissAlert = async (alertId: string) => {
    setResolvingAlertId(alertId);
    try {
      const res = await fetch('/api/coach/assistant', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve_alert', alertId }),
      });
      if (res.ok) {
        setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      }
    } catch (err) {
      console.error('[CoachInsights] Erro ao dispensar alerta:', err);
    } finally {
      setResolvingAlertId(null);
    }
  };

  const handleEvaluateFatigue = async () => {
    setEvaluatingFatigue(true);
    setFatigueStatusMsg(null);
    try {
      const res = await fetch('/api/coach/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'fatigue_alert', payload: {} }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        if (json.alertRecord) {
          setAlerts((prev) => [json.alertRecord, ...prev.filter((a) => a.id !== json.alertRecord.id)]);
        }
        const usedFallback = Boolean(json.usedFallback || json.source === 'fallback');
        setFatigueStatusMsg({
          text: usedFallback
            ? 'Avaliação concluída em modo heurístico offline (sem IA externa).'
            : 'Avaliação de prontidão e fadiga atualizada pela IA.',
          isFallback: usedFallback,
        });
      } else {
        setFatigueStatusMsg({ text: json.error || 'Não foi possível avaliar a fadiga agora.' });
      }
    } catch {
      setFatigueStatusMsg({ text: 'Erro de rede ao avaliar fadiga com a IA.' });
    } finally {
      setEvaluatingFatigue(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-4 animate-pulse">
        <div className="flex justify-between items-center">
          <div className="h-6 bg-slate-700 rounded w-1/3" />
          <div className="h-6 bg-slate-700 rounded w-8" />
        </div>
        <div className="h-4 bg-slate-700 rounded w-2/3" />
      </div>
    );
  }

  if ((error || !data || !data.active) && alerts.length === 0) {
    return null; // Don't show anything if no active mesocycle/alerts or error
  }

  const mesocycle = data?.mesocycle;
  const coachBrain = data?.coachBrain;
  const analystReport = data?.analystReport;

  const progressionBadgeColor = (status: string) => {
    switch (status) {
      case 'improved': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'stagnant': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'regressed': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const complianceBadgeColor = (status: string) => {
    switch (status) {
      case 'high': return 'text-emerald-400';
      case 'moderate': return 'text-amber-400';
      default: return 'text-rose-400';
    }
  };

  return (
    <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700/80 rounded-2xl shadow-xl overflow-hidden">
      {alerts.length > 0 && (
        <div className="border-b border-amber-500/20 bg-amber-500/5 p-4 space-y-2.5">
          {alerts.map((alert) => {
            const isHigh = alert.severity === 'high';
            return (
              <div
                key={alert.id}
                className={`rounded-xl border p-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
                  isHigh
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-100'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-100'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                    <AlertTriangle className={`h-4 w-4 shrink-0 ${isHigh ? 'text-rose-400' : 'text-amber-400'}`} />
                    <span>Alerta de Prontidão & Fadiga ({alert.date})</span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">{alert.message}</p>
                  {alert.metadata?.action && (
                    <p className="text-[11px] text-slate-300 font-medium">
                      Sugestão prática: {alert.metadata.action}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDismissAlert(alert.id)}
                  disabled={resolvingAlertId === alert.id}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900/70 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{resolvingAlertId === alert.id ? 'Dispensando...' : 'Dispensar'}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {data?.active ? (
        <>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="w-full flex items-center justify-between p-6 hover:bg-slate-800/50 transition duration-200 cursor-pointer"
          >
            <div className="flex items-center gap-3 text-left">
              <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Brain className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100">🧠 Diário do Coach & Anotações de IA</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Raciocínio metodológico do bloco ativo: <span className="text-indigo-300 font-semibold">{mesocycle?.title}</span> ({mesocycle?.split})
                </p>
              </div>
            </div>
            <div>
              {isOpen ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
            </div>
          </button>

          {isOpen && (
            <div className="border-t border-slate-700/80 p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-700/50">
                <p className="text-xs text-slate-400">
                  Verifique sinais de acúmulo de fadiga cruzando força, corrida e CrossFit em tempo real.
                </p>
                <button
                  type="button"
                  onClick={handleEvaluateFatigue}
                  disabled={evaluatingFatigue}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${evaluatingFatigue ? 'animate-spin' : ''}`} />
                  <span>{evaluatingFatigue ? 'Avaliando Fadiga...' : 'Avaliar Fadiga com IA'}</span>
                </button>
              </div>

              {fatigueStatusMsg && (
                <div
                  className={`text-xs px-3 py-2 rounded-xl border ${
                    fatigueStatusMsg.isFallback
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                      : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200'
                  }`}
                >
                  {fatigueStatusMsg.text}
                </div>
              )}

              {/* Section A: Master Coach Brain */}
              {coachBrain && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm border-b border-slate-700/50 pb-2">
                    <span>🎯 Hipóteses de Treinamento & Racional</span>
                  </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Hipóteses de Adaptação</h4>
                  <ul className="list-disc pl-4 text-sm text-slate-300 space-y-1">
                    {coachBrain.hypotheses.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </div>
                <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Justificativa Científica (Rationale)</h4>
                  <ul className="list-disc pl-4 text-sm text-slate-300 space-y-1">
                    {coachBrain.rationale.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {coachBrain.retrospective && (
                <div className="bg-indigo-950/20 border border-indigo-500/10 p-4 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Retrospectiva do Ciclo Anterior</h4>
                    <div className="flex items-center gap-1 text-amber-400 text-xs font-semibold">
                      <Star className="h-3.5 w-3.5 fill-current" />
                      <span>Confiança do Bloco: {Math.round(coachBrain.retrospective.confidenceScore * 100)}%</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-xs font-medium text-emerald-400 block mb-1">O que funcionou:</span>
                      <ul className="list-disc pl-4 text-slate-300 space-y-0.5">
                        {coachBrain.retrospective.whatWorked.map((item, i) => <li key={i}>{item}</li>)}
                      </ul>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-rose-400 block mb-1">O que falhou / Ajustar:</span>
                      <ul className="list-disc pl-4 text-slate-300 space-y-0.5">
                        {coachBrain.retrospective.whatFailed.map((item, i) => <li key={i}>{item}</li>)}
                      </ul>
                    </div>
                  </div>
                  <div className="border-t border-indigo-500/10 pt-2 text-xs">
                    <span className="font-semibold text-indigo-300">Ações Corretivas Aplicadas Neste Bloco:</span>
                    <p className="text-slate-300 mt-1 italic">
                      {coachBrain.retrospective.correctionActions.join('; ')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section B: Data Analyst Diagnostico */}
          {analystReport && (
            <div className="space-y-4 pt-4 border-t border-slate-700/50">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm border-b border-slate-700/50 pb-2">
                <TrendingUp className="h-4 w-4" />
                <span>📊 Análise de Carga e Recuperação (Últimos 56 dias)</span>
              </div>

              <div className="bg-slate-950/30 p-4 rounded-xl border border-slate-850">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Sumário Executivo do Analista</h4>
                <p className="text-sm text-slate-300 leading-relaxed">{analystReport.executiveSummary}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                  <span className="text-xs text-slate-400 block">Adesão ao Plano de Progressão</span>
                  <span className={`text-lg font-bold uppercase ${complianceBadgeColor(analystReport.progressionSignals.progressionCompliance)}`}>
                    {analystReport.progressionSignals.progressionCompliance === 'high' ? 'Alta' : analystReport.progressionSignals.progressionCompliance === 'moderate' ? 'Média' : 'Baixa'}
                  </span>
                </div>
                <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                  <span className="text-xs text-slate-400 block">Gargalos Físicos Detectados</span>
                  <ul className="text-xs text-slate-300 mt-1 list-disc pl-3">
                    {analystReport.progressionSignals.keyBottlenecks.slice(0, 2).map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                </div>
                <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                  <span className="text-xs text-slate-400 block">Limitações de Recuperação</span>
                  <ul className="text-xs text-slate-300 mt-1 list-disc pl-3">
                    {analystReport.progressionSignals.recoveryConstraints.slice(0, 2).map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Evolução por Exercício</h4>
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950/60 text-slate-400 font-bold border-b border-slate-800">
                        <th className="p-3">Exercício</th>
                        <th className="p-3">Progresso</th>
                        <th className="p-3 text-center">Carga/Semana</th>
                        <th className="p-3 text-center">Reps/Semana</th>
                        <th className="p-3">Análise de IA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 bg-slate-900/20">
                      {analystReport.exercisePerformance.map((ex, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/30">
                          <td className="p-3 font-semibold text-slate-200">
                            {ex.exerciseName}
                            <span className="block text-[10px] text-slate-500 font-normal">
                              {formatMovementPattern(ex.movementPattern)}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] uppercase font-bold ${progressionBadgeColor(ex.observedProgression)}`}>
                              {ex.observedProgression === 'improved' ? 'Melhorou' : ex.observedProgression === 'stagnant' ? 'Estagnado' : ex.observedProgression === 'regressed' ? 'Regrediu' : 'Sem Dados'}
                            </span>
                          </td>
                          <td className="p-3 text-center text-slate-300 font-mono">
                            {ex.loadTrendKgPerWeek !== null ? (ex.loadTrendKgPerWeek >= 0 ? `+${ex.loadTrendKgPerWeek}kg` : `${ex.loadTrendKgPerWeek}kg`) : '—'}
                          </td>
                          <td className="p-3 text-center text-slate-300 font-mono">
                            {ex.repTrendPerWeek !== null ? (ex.repTrendPerWeek >= 0 ? `+${ex.repTrendPerWeek}` : ex.repTrendPerWeek) : '—'}
                          </td>
                          <td className="p-3 text-slate-400 italic max-w-xs truncate" title={ex.notes}>
                            {ex.notes}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <HealthDisclaimer compact />
        </div>
      )}
        </>
      ) : (
        <div className="p-4">
          <HealthDisclaimer compact />
        </div>
      )}
    </section>
  );
}
