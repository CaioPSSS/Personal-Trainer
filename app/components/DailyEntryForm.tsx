'use client';

import { FormEvent } from 'react';
import { LogFormState } from '@/app/hooks/useMetabolicData';

interface DailyEntryFormProps {
  logForm: LogFormState;
  setLogForm: (value: LogFormState) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
  isEditing: boolean;
  clientMessage: { type: string; text: string };
  alerts: string[];
}

export default function DailyEntryForm({
  logForm,
  setLogForm,
  onSubmit,
  onReset,
  isEditing,
  clientMessage,
  alerts,
}: DailyEntryFormProps) {
  return (
    <section className="bg-slate-800 border border-slate-700 p-6 rounded-2xl shadow-sm h-fit">
      <h2 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">📝 Log Diário</h2>

      {clientMessage.text && (
        <div className={`p-3 rounded-lg text-sm mb-4 font-medium ${clientMessage.type === 'error' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
          {clientMessage.text}
        </div>
      )}

      {alerts.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-sm font-semibold text-amber-300 mb-2">Alertas ativos</p>
          <ul className="space-y-1 text-sm text-amber-100/90">
            {alerts.map((alert, index) => (
              <li key={index}>• {alert}</li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-xs uppercase text-slate-400 mb-1">Data de Referência</label>
          <input
            type="date"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
            value={logForm.date}
            onChange={(e) => setLogForm({ ...logForm, date: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs uppercase text-slate-400 mb-1">Peso (kg) <span className="text-slate-500 font-normal">(deixar vazio se esqueceu)</span></label>
          <input
            type="number"
            step="0.1"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
            value={logForm.weight}
            onChange={(e) => setLogForm({ ...logForm, weight: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs uppercase text-slate-400 mb-1">Ingestão Calórica (kcal) <span className="text-slate-500 font-normal">(vazio se esqueceu)</span></label>
          <input
            type="number"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
            value={logForm.caloriesConsumed}
            onChange={(e) => setLogForm({ ...logForm, caloriesConsumed: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs uppercase text-slate-400 mb-1">Proteína (g) <span className="text-slate-500 font-normal">(opcional)</span></label>
          <input
            type="number"
            min="0"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
            value={logForm.proteinConsumed}
            onChange={(e) => setLogForm({ ...logForm, proteinConsumed: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs uppercase text-slate-400 mb-1">Cintura (cm) <span className="text-slate-500 font-normal">(opcional)</span></label>
          <input
            type="number"
            step="0.1"
            min="0"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
            value={logForm.waistCircumference}
            onChange={(e) => setLogForm({ ...logForm, waistCircumference: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs uppercase text-slate-400 mb-1">Gasto de Exercício Ativo (kcal)</label>
          <input
            type="number"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
            value={logForm.caloriesBurned}
            onChange={(e) => setLogForm({ ...logForm, caloriesBurned: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs uppercase text-slate-400 mb-1">Natureza do Dia</label>
          <select
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
            value={logForm.trainingType}
            onChange={(e) => setLogForm({ ...logForm, trainingType: e.target.value })}
          >
            <option value="Descanso">Descanso / Repouso</option>
            <option value="Musculação">Treino de Musculação / Força</option>
            <option value="Corrida">Sessão de Corrida / Cardio</option>
            <option value="Híbrido">Dia Híbrido (Força + Cardio)</option>
            <option value="Livre">Dia Livre (Refeição Fora/Off)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase text-slate-400 mb-1">Sono (horas)</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="24"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
            value={logForm.sleepHours}
            onChange={(e) => setLogForm({ ...logForm, sleepHours: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs uppercase text-slate-400 mb-1">Hidratação (ml)</label>
          <input
            type="number"
            min="0"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
            value={logForm.waterIntake}
            onChange={(e) => setLogForm({ ...logForm, waterIntake: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs uppercase text-slate-400 mb-1">Estresse</label>
          <select
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
            value={logForm.stressLevel}
            onChange={(e) => setLogForm({ ...logForm, stressLevel: e.target.value })}
          >
            <option value="1">1 — Muito baixo</option>
            <option value="2">2 — Baixo</option>
            <option value="3">3 — Moderado</option>
            <option value="4">4 — Alto</option>
            <option value="5">5 — Muito alto</option>
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase text-slate-400 mb-1">Humor</label>
          <select
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
            value={logForm.mood}
            onChange={(e) => setLogForm({ ...logForm, mood: e.target.value })}
          >
            <option value="Ótimo">Ótimo</option>
            <option value="Bom">Bom</option>
            <option value="Regular">Regular</option>
            <option value="Ruim">Ruim</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold p-3 rounded-lg transition-colors shadow-lg">
            {isEditing ? 'Atualizar Registro' : 'Salvar Dados'}
          </button>
          <button type="button" onClick={onReset} className="px-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-colors">
            Novo
          </button>
        </div>
      </form>
    </section>
  );
}
