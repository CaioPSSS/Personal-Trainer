'use client';

import { Dispatch, FormEvent, SetStateAction } from 'react';
import { Dumbbell, Clock, ShieldAlert, CheckCircle2, Brain } from 'lucide-react';

export interface AthleteProfileFormState {
  displayName: string;
  trainingAgeYears: string;
  sessionDurationMin: string;
  athleteContext: string;
  availableEquipment: string[];
  movementRestrictions: string;
}

interface OnboardingFormProps {
  setupForm: AthleteProfileFormState;
  setSetupForm: Dispatch<SetStateAction<AthleteProfileFormState>>;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  isSubmitting?: boolean;
}

const EQUIPMENT_OPTIONS = [
  { id: 'barbell', label: 'Barra Livre' },
  { id: 'dumbbells', label: 'Halteres' },
  { id: 'cables', label: 'Polias / Cabos' },
  { id: 'machines', label: 'Máquinas' },
  { id: 'bodyweight', label: 'Peso Corporal' },
];

export default function OnboardingForm({ setupForm, setSetupForm, onSubmit, isSubmitting }: OnboardingFormProps) {
  const handleEquipmentToggle = (id: string) => {
    const current = setupForm.availableEquipment;
    const updated = current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id];
    setSetupForm({ ...setupForm, availableEquipment: updated });
  };

  return (
    <div className="max-w-xl mx-auto my-12 bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700 space-y-6">
      <div className="text-center">
        <div className="mx-auto w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-2xl border border-indigo-500/20 flex items-center justify-center mb-3">
          <Dumbbell className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold text-slate-100">Perfil do Atleta</h1>
        <p className="text-slate-400 text-sm mt-1">
          Calibre seu perfil de hipertrofia para que o Master Coach IA projete seu mesociclo sob medida.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label className="block text-xs uppercase text-slate-400 font-bold mb-1.5">
            <span>Nome do Atleta</span>
          </label>
          <input
            required
            type="text"
            placeholder="Ex: Caio"
            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-indigo-500 outline-none"
            value={setupForm.displayName}
            onChange={(e) => setSetupForm({ ...setupForm, displayName: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs uppercase text-slate-400 font-bold mb-1.5 flex items-center gap-1.5">
              <span>Experiência de Treino (Anos)</span>
            </label>
            <input
              required
              type="number"
              step="0.5"
              min="0"
              placeholder="Ex: 2.5"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-indigo-500 outline-none"
              value={setupForm.trainingAgeYears}
              onChange={(e) => setSetupForm({ ...setupForm, trainingAgeYears: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs uppercase text-slate-400 font-bold mb-1.5 flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              <span>Duração Desejada</span>
            </label>
            <select
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-indigo-500 outline-none cursor-pointer"
              value={setupForm.sessionDurationMin}
              onChange={(e) => setSetupForm({ ...setupForm, sessionDurationMin: e.target.value })}
            >
              <option value="45">45 minutos</option>
              <option value="60">60 minutos</option>
              <option value="75">75 minutos</option>
              <option value="90">90 minutos</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs uppercase text-slate-400 font-bold mb-1.5 flex items-center gap-1.5">
            <Brain className="h-3.5 w-3.5 text-indigo-400" />
            <span>Contexto de Vida e Objetivos (Opcional, mas recomendado)</span>
          </label>
          <textarea
            placeholder="Conte para a IA sobre sua rotina. Ex: Sou residente médico, tenho dias muito estressantes, durmo mal em plantões, gostaria de focar mais em hipertrofia de braços neste mês..."
            rows={4}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-indigo-500 outline-none resize-none"
            value={setupForm.athleteContext}
            onChange={(e) => setSetupForm({ ...setupForm, athleteContext: e.target.value })}
          />
        </div>

        <div>
          <span className="block text-xs uppercase text-slate-400 font-bold mb-2">Equipamentos Disponíveis</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {EQUIPMENT_OPTIONS.map((opt) => {
              const isChecked = setupForm.availableEquipment.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleEquipmentToggle(opt.id)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer text-left ${
                    isChecked
                      ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300'
                      : 'bg-slate-900/50 border-slate-750 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <CheckCircle2 className={`h-4 w-4 shrink-0 ${isChecked ? 'text-indigo-400' : 'text-slate-600'}`} />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs uppercase text-slate-400 font-bold mb-1.5 flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
            <span>Restrições de Movimento / Lesões</span>
          </label>
          <textarea
            placeholder="Ex: Lesão no ombro esquerdo (evitar desenvolvimento por trás), dores na patela..."
            rows={3}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-indigo-500 outline-none resize-none"
            value={setupForm.movementRestrictions}
            onChange={(e) => setSetupForm({ ...setupForm, movementRestrictions: e.target.value })}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-slate-100 font-bold p-4 rounded-xl transition duration-200 shadow-md shadow-indigo-500/10 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Salvando...' : 'Salvar Perfil e Acessar Ficha'}
        </button>
      </form>
    </div>
  );
}
