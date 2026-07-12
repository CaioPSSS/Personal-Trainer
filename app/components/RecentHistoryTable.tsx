'use client';

import { Log } from '@/app/hooks/useMetabolicData';

interface RecentHistoryTableProps {
  logs: Log[];
  onEditLog: (log: Log) => void;
}

export default function RecentHistoryTable({ logs, onEditLog }: RecentHistoryTableProps) {
  return (
    <section className="bg-slate-800 border border-slate-700 rounded-2xl p-6 overflow-hidden shadow-sm">
      <h3 className="text-lg font-bold text-slate-200 mb-4">Histórico Recente (Últimos Registros)</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="text-xs uppercase bg-slate-900/50 text-slate-400 border-b border-slate-700">
            <tr>
              <th className="p-3">Data</th>
              <th className="p-3">Peso</th>
              <th className="p-3">Consumo</th>
              <th className="p-3">Proteína</th>
              <th className="p-3">Cintura</th>
              <th className="p-3">Gasto Exercício</th>
              <th className="p-3">Sono</th>
              <th className="p-3">Água</th>
              <th className="p-3">Estresse</th>
              <th className="p-3">Humor</th>
              <th className="p-3">Tipo de Rotina</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/60">
            {logs.map((log) => (
              <tr key={log.date} className="hover:bg-slate-700/30 transition-colors">
                <td className="p-3 font-medium text-slate-400">{log.date}</td>
                <td className="p-3 text-white">{log.weight ? `${log.weight} kg` : <span className="text-slate-600">—</span>}</td>
                <td className="p-3 text-white">{log.caloriesConsumed ? `${log.caloriesConsumed} kcal` : <span className="text-slate-600">—</span>}</td>
                <td className="p-3 text-white">{log.proteinConsumed ? `${log.proteinConsumed} g` : <span className="text-slate-600">—</span>}</td>
                <td className="p-3 text-white">{log.waistCircumference ? `${log.waistCircumference.toFixed(1)} cm` : <span className="text-slate-600">—</span>}</td>
                <td className="p-3 text-amber-400">{log.caloriesBurned ? `+${log.caloriesBurned} kcal` : '0 kcal'}</td>
                <td className="p-3 text-white">{log.sleepHours ? `${log.sleepHours}h` : <span className="text-slate-600">—</span>}</td>
                <td className="p-3 text-white">{log.waterIntake ? `${log.waterIntake} ml` : <span className="text-slate-600">—</span>}</td>
                <td className="p-3 text-white">{log.stressLevel ?? <span className="text-slate-600">—</span>}</td>
                <td className="p-3 text-white">{log.mood || <span className="text-slate-600">—</span>}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                      log.trainingType === 'Híbrido' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                      log.trainingType === 'Musculação' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                      log.trainingType === 'Corrida' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                      log.trainingType === 'Livre' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                      'bg-slate-600/10 text-slate-400 border border-slate-600/20'
                    }`}>
                      {log.trainingType}
                    </span>
                    <button type="button" onClick={() => onEditLog(log)} className="text-xs text-indigo-300 hover:text-indigo-200">
                      Editar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
