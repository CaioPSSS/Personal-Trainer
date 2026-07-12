'use client';

import { Dispatch, FormEvent, SetStateAction } from 'react';
import { SetupFormState } from '@/app/hooks/useMetabolicData';

interface OnboardingFormProps {
  setupForm: SetupFormState;
  setSetupForm: Dispatch<SetStateAction<SetupFormState>>;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}

export default function OnboardingForm({ setupForm, setSetupForm, onSubmit }: OnboardingFormProps) {
  return (
    <div className="max-w-md mx-auto my-12 bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700">
      <h1 className="text-2xl font-bold mb-2 text-indigo-400">Configuração Inicial</h1>
      <p className="text-slate-400 text-sm mb-6">Insira seus dados para calibrar o ponto de partida ideal da sua taxa de TDEE.</p>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-xs uppercase text-slate-400 mb-1">Idade</label>
          <input
            required
            type="number"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
            value={setupForm.age}
            onChange={(e) => setSetupForm({ ...setupForm, age: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs uppercase text-slate-400 mb-1">Altura (cm)</label>
          <input
            required
            type="number"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
            value={setupForm.height}
            onChange={(e) => setSetupForm({ ...setupForm, height: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs uppercase text-slate-400 mb-1">Peso Atual (kg)</label>
          <input
            required
            type="number"
            step="0.1"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
            value={setupForm.weight}
            onChange={(e) => setSetupForm({ ...setupForm, weight: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs uppercase text-slate-400 mb-1">Sexo Biológico</label>
          <select
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
            value={setupForm.gender}
            onChange={(e) => setSetupForm({ ...setupForm, gender: e.target.value })}
          >
            <option value="M">Masculino</option>
            <option value="F">Feminino</option>
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase text-slate-400 mb-1">Fator de Atividade</label>
          <select
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
            value={setupForm.activityLevel}
            onChange={(e) => setSetupForm({ ...setupForm, activityLevel: e.target.value })}
          >
            <option value="1.2">Sedentário (Pouco ou nenhum exercício)</option>
            <option value="1.375">Levemente Ativo (Exercício leve 1-3 dias/sem)</option>
            <option value="1.55">Moderadamente Ativo (Exercício moderado 3-5 dias/sem)</option>
            <option value="1.725">Altamente Ativo (Treino pesado diário ou híbrido constante)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase text-slate-400 mb-1">Objetivo Primário</label>
          <select
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
            value={setupForm.goal}
            onChange={(e) => setSetupForm({ ...setupForm, goal: e.target.value })}
          >
            <option value="loss">Definição / Perda de Peso (Déficit)</option>
            <option value="maintenance">Manutenção Metabólica (Homeostase)</option>
            <option value="gain">Hipertrofia / Ganho de Massa (Superávit)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase text-slate-400 mb-1">Ritmo Semanal Esperado (kg)</label>
          <input
            required
            type="number"
            step="0.05"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
            value={setupForm.weeklyRate}
            onChange={(e) => setSetupForm({ ...setupForm, weeklyRate: e.target.value })}
          />
        </div>
        <button
          type="submit"
          className="w-full bg-indigo-600 hover:bg-indigo-700 font-semibold p-3 rounded-lg transition-colors mt-2"
        >
          Calcular Meu Ponto de Partida
        </button>
      </form>
    </div>
  );
}
