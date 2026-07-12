'use client';

import {
  LineChart,
  Line,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  RadarChart,
} from 'recharts';
import { Log, Settings } from '@/app/hooks/useMetabolicData';

interface MetabolicChartsProps {
  logs: Log[];
  settings: Settings;
}

function average(values: number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function calculateEMA(values: Array<number | null>, period = 7): Array<number | null> {
  const alpha = 2 / (period + 1);
  const ema: Array<number | null> = [];
  let previous: number | null = null;

  for (const value of values) {
    if (value === null) {
      ema.push(previous);
      continue;
    }

    previous = previous === null ? value : previous + alpha * (value - previous);
    ema.push(parseFloat(previous.toFixed(2)));
  }

  return ema;
}

function parseDateToDays(date: string) {
  return Math.floor(new Date(`${date}T00:00:00`).getTime() / 86400000);
}

function calculateLinearSlope(points: Array<{ date: string; value: number }>) {
  if (points.length < 2) {
    return 0;
  }

  const xs = points.map((point) => parseDateToDays(point.date));
  const ys = points.map((point) => point.value);
  const xMean = average(xs);
  const yMean = average(ys);

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < xs.length; i++) {
    numerator += (xs[i] - xMean) * (ys[i] - yMean);
    denominator += (xs[i] - xMean) ** 2;
  }

  return denominator === 0 ? 0 : numerator / denominator;
}

export default function MetabolicCharts({ logs, settings }: MetabolicChartsProps) {
  const orderedLogs = [...logs].reverse();
  const recentLogs = orderedLogs.slice(-14);
  const weightValues = orderedLogs.map((log) => (typeof log.weight === 'number' ? log.weight : null));
  const emaSeries = calculateEMA(weightValues, 7);
  const weightPoints = orderedLogs
    .filter((log): log is Log & { weight: number } => typeof log.weight === 'number')
    .slice(-14)
    .map((log) => ({ date: log.date, value: log.weight }));
  const slopeKgPerDay = calculateLinearSlope(weightPoints);
  const lastLogWithWeight = weightPoints[weightPoints.length - 1];

  const predictiveData: Array<{
    data: string;
    'Peso Real': number | null;
    'Peso EWMA': number | null;
    'Projeção de Peso': number | null;
  }> = orderedLogs.map((log, index) => ({
    data: log.date.substring(5).replace('-', '/'),
    'Peso Real': log.weight,
    'Peso EWMA': emaSeries[index],
    'Projeção de Peso': null,
  }));

  if (lastLogWithWeight && slopeKgPerDay !== 0) {
    const projectionDays = 14;
    let lastProjected = emaSeries[weightValues.length - 1] ?? lastLogWithWeight.value;

    for (let day = 1; day <= projectionDays; day++) {
      lastProjected = parseFloat((lastProjected + slopeKgPerDay).toFixed(2));
      predictiveData.push({
        data: `+${day}d`,
        'Peso Real': null,
        'Peso EWMA': null,
        'Projeção de Peso': lastProjected,
      });
    }
  }

  let cumulativeDeficit = 0;
  const deficitData = recentLogs.map((log) => {
    const deficit = log.caloriesConsumed !== null ? settings.currentCalorieTarget - log.caloriesConsumed : 0;
    cumulativeDeficit += deficit;
    return {
      date: log.date.substring(5).replace('-', '/'),
      'Déficit Diário': deficit,
      'Acúmulo Termodinâmico': parseFloat(cumulativeDeficit.toFixed(0)),
    };
  });

  const recoveryWindow = orderedLogs.slice(-7);
  const sleepValues = recoveryWindow.map((log) => log.sleepHours).filter((value): value is number => value !== null);
  const waterValues = recoveryWindow.map((log) => log.waterIntake).filter((value): value is number => value !== null);
  const stressValues = recoveryWindow.map((log) => log.stressLevel).filter((value): value is number => value !== null);
  const caloriesValues = recoveryWindow.map((log) => log.caloriesConsumed).filter((value): value is number => value !== null);

  const avgSleep = average(sleepValues);
  const avgWater = average(waterValues);
  const avgStress = average(stressValues);
  const avgCalories = average(caloriesValues);

  const sleepScore = Math.min(100, Math.max(0, (avgSleep / 8) * 100));
  const waterScore = Math.min(100, Math.max(0, (avgWater / 3500) * 100));
  const stressScore = stressValues.length ? Math.max(0, Math.min(100, 100 - (avgStress - 1) * 20)) : 50;
  const adherenceScore = caloriesValues.length
    ? Math.max(0, Math.min(100, 100 - (Math.abs(avgCalories - settings.currentCalorieTarget) / settings.currentCalorieTarget) * 100))
    : 50;

  const recoveryScore = Math.round((sleepScore + waterScore + stressScore + adherenceScore) / 4);

  const radarData = [
    { subject: 'Sono', score: parseFloat(sleepScore.toFixed(0)) },
    { subject: 'Hidratação', score: parseFloat(waterScore.toFixed(0)) },
    { subject: 'Estresse', score: parseFloat(stressScore.toFixed(0)) },
    { subject: 'Aderência', score: parseFloat(adherenceScore.toFixed(0)) },
  ];

  const validWeights = orderedLogs.filter((log): log is Log & { weight: number } => typeof log.weight === 'number');
  const weightChange7d = validWeights.length >= 2
    ? parseFloat((validWeights[validWeights.length - 1].weight - validWeights[Math.max(0, validWeights.length - 2)].weight).toFixed(1))
    : null;

  const estimatedFatLossKg = parseFloat((cumulativeDeficit / 7700).toFixed(2));

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-5 shadow-sm">
          <p className="text-xs uppercase text-slate-400 tracking-wider">TDEE Empírico Atual</p>
          <p className="mt-3 text-3xl font-bold text-emerald-300">{settings.currentCalorieTarget} kcal</p>
          <p className="mt-2 text-sm text-slate-400">Meta adaptativa usada no motor metabólico.</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-5 shadow-sm">
          <p className="text-xs uppercase text-slate-400 tracking-wider">Variação de Peso (7 dias)</p>
          <p className="mt-3 text-3xl font-bold text-sky-300">{weightChange7d !== null ? `${weightChange7d} kg` : '—'}</p>
          <p className="mt-2 text-sm text-slate-400">Diferença entre as duas últimas pesagens.</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-5 shadow-sm">
          <p className="text-xs uppercase text-slate-400 tracking-wider">Gordura Estimada Oxidada</p>
          <p className="mt-3 text-3xl font-bold text-emerald-400">{estimatedFatLossKg >= 0 ? `${estimatedFatLossKg} kg` : `-${Math.abs(estimatedFatLossKg)} kg`}</p>
          <p className="mt-2 text-sm text-slate-400">Baseado no déficit acumulado dos últimos 14 dias.</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-5 shadow-sm">
          <p className="text-xs uppercase text-slate-400 tracking-wider">Recovery Score</p>
          <p className="mt-3 text-3xl font-bold text-cyan-300">{recoveryScore}%</p>
          <p className="mt-2 text-sm text-slate-400">Sono, água, estresse e adesão calórica.</p>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-3xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Tendência Preditiva de Peso (EWMA + Projeção)</h3>
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={predictiveData} margin={{ top: 15, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="data" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" domain={['dataMin - 2', 'dataMax + 2']} />
            <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#475569' }} />
            <Legend />
            <Line type="monotone" dataKey="Peso Real" stroke="#a5b4fc" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="Peso EWMA" stroke="#38bdf8" strokeWidth={3} dot={false} connectNulls />
            <Line type="monotone" dataKey="Projeção de Peso" stroke="#7dd3fc" strokeWidth={3} dot={false} strokeDasharray="5 5" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Balanço Energético Acumulado</h3>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={deficitData} margin={{ top: 15, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="thermoGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0.08} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#475569' }} />
              <Legend />
              <Bar dataKey="Déficit Diário" barSize={24} fill="#64748b" radius={[6, 6, 0, 0]} />
              <Area type="monotone" dataKey="Acúmulo Termodinâmico" fill="url(#thermoGradient)" stroke="#22c55e" strokeWidth={2} name="Acúmulo Termodinâmico" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Radar de Recuperação</h3>
          <ResponsiveContainer width="100%" height={320}>
            <RadarChart data={radarData} outerRadius="80%">
              <PolarGrid stroke="#334155" />
              <PolarAngleAxis dataKey="subject" stroke="#cbd5e1" />
              <PolarRadiusAxis angle={30} domain={[0, 100]} />
              <Radar dataKey="score" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.25} />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
