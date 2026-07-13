'use client';

import { useState, useEffect } from 'react';
import { Dumbbell, Calendar, Plus, Trash, Save, Sparkles, Smile } from 'lucide-react';

interface Prescription {
  id: string;
  exerciseKey: string;
  exerciseName: string;
  movementPattern: string;
  sortOrder: number;
  targetSets: number;
  targetRepMin: number;
  targetRepMax: number;
  targetRpeMin: number | null;
  targetRpeMax: number | null;
  restSeconds: number | null;
  advancedTechnique: string | null;
}

interface WorkoutDayTemplate {
  id: string;
  dayOrder: number;
  label: string;
  estimatedDurationMin: number;
  prescriptions: Prescription[];
}

interface SetInput {
  setNumber: number;
  loadKg: string;
  reps: string;
  rpe: string;
  isFailure: boolean;
}

interface ExerciseInput {
  exercisePrescriptionId: string;
  exerciseName: string;
  movementPattern: string;
  sortOrder: number;
  notes: string;
  substitutedFrom?: string;
  sets: SetInput[];
}

interface HypertrophyDailyTrackerProps {
  onSaved?: () => void;
}

function getTodayLocalISODate() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().split('T')[0];
}

export default function HypertrophyDailyTracker({ onSaved }: HypertrophyDailyTrackerProps) {
  const [selectedDate, setSelectedDate] = useState(getTodayLocalISODate());
  const [activeMesocycleId, setActiveMesocycleId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<WorkoutDayTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<WorkoutDayTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Swap suggestions states
  const [swappingIndex, setSwappingIndex] = useState<number | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ title: string; reason: string }>>([]);
  const [swapError, setSwapError] = useState<string | null>(null);

  // Form states
  const [sleepHours, setSleepHours] = useState('');
  const [fatigueLevel, setFatigueLevel] = useState('3');
  const [sorenessLevel, setSorenessLevel] = useState('3');
  const [energyLevel, setEnergyLevel] = useState('3');
  const [stressLevel, setStressLevel] = useState('3');
  const [bodyWeightKg, setBodyWeightKg] = useState('');
  const [wellnessNotes, setWellnessNotes] = useState('');
  const [exercises, setExercises] = useState<ExerciseInput[]>([]);

  // Load workout template and existing logs for selected date
  useEffect(() => {
    const loadDateData = async () => {
      setLoading(true);
      setMessage(null);
      try {
        const response = await fetch(`/api/workout/today?date=${selectedDate}`);
        if (!response.ok) {
          throw new Error('Falha ao carregar treino do dia.');
        }
        const data = await response.json();

        if (!data.active) {
          setActiveMesocycleId(null);
          setTemplates([]);
          setSelectedTemplate(null);
          setLoading(false);
          return;
        }

        setActiveMesocycleId(data.mesocyclePlanId);
        setTemplates(data.templates || []);

        // Prepopulate Wellness if exists, else reset to defaults
        if (data.existingWellness) {
          setSleepHours(data.existingWellness.sleepHours?.toString() || '');
          setFatigueLevel(data.existingWellness.fatigueLevel?.toString() || '3');
          setSorenessLevel(data.existingWellness.sorenessLevel?.toString() || '3');
          setEnergyLevel(data.existingWellness.energyLevel?.toString() || '3');
          setStressLevel(data.existingWellness.stressLevel?.toString() || '3');
          setBodyWeightKg(data.existingWellness.bodyWeightKg?.toString() || '');
          setWellnessNotes(data.existingWellness.notes || '');
        } else {
          setSleepHours('');
          setFatigueLevel('3');
          setSorenessLevel('3');
          setEnergyLevel('3');
          setStressLevel('3');
          setBodyWeightKg('');
          setWellnessNotes('');
        }

        // Set Active Template
        let currentTemplate: WorkoutDayTemplate | null = null;
        if (data.existingWorkout && data.existingWorkout.exerciseExecutions?.length > 0) {
          // If already logged, identify the template from prescription
          const firstEx = data.existingWorkout.exerciseExecutions[0];
          const presId = firstEx.exercisePrescriptionId;
          currentTemplate = data.templates.find((t: WorkoutDayTemplate) =>
            t.prescriptions.some((p) => p.id === presId)
          ) || data.workoutToday;
        } else {
          currentTemplate = data.workoutToday;
        }

        setSelectedTemplate(currentTemplate);

        // Prepopulate Exercises
        if (data.existingWorkout && data.existingWorkout.exerciseExecutions?.length > 0) {
          interface SetExecutionJson {
            setNumber: number;
            loadKg?: number | null;
            reps: number;
            rpe?: number | null;
            isFailure: boolean;
          }
          interface ExerciseExecutionJson {
            exercisePrescriptionId?: string | null;
            exerciseName: string;
            movementPattern?: string | null;
            sortOrder: number;
            notes?: string | null;
            setExecutions: SetExecutionJson[];
          }
          const mappedExs: ExerciseInput[] = data.existingWorkout.exerciseExecutions.map((ex: ExerciseExecutionJson) => ({
            exercisePrescriptionId: ex.exercisePrescriptionId || '',
            exerciseName: ex.exerciseName,
            movementPattern: ex.movementPattern || '',
            sortOrder: ex.sortOrder,
            notes: ex.notes || '',
            sets: ex.setExecutions.map((s: SetExecutionJson) => ({
              setNumber: s.setNumber,
              loadKg: s.loadKg?.toString() || '',
              reps: s.reps?.toString() || '',
              rpe: s.rpe?.toString() || '',
              isFailure: !!s.isFailure,
            })),
          }));
          setExercises(mappedExs);
        } else if (currentTemplate) {
          // Initialize empty sets based on prescription
          const initializedExs: ExerciseInput[] = currentTemplate.prescriptions.map((p) => ({
            exercisePrescriptionId: p.id,
            exerciseName: p.exerciseName,
            movementPattern: p.movementPattern,
            sortOrder: p.sortOrder,
            notes: '',
            sets: Array.from({ length: p.targetSets }).map((_, i) => ({
              setNumber: i + 1,
              loadKg: '',
              reps: '',
              rpe: '',
              isFailure: false,
            })),
          }));
          setExercises(initializedExs);
        }
      } catch (err) {
        console.error(err);
        setMessage({ type: 'error', text: 'Não foi possível buscar as informações do treino.' });
      } finally {
        setLoading(false);
      }
    };

    void loadDateData();
  }, [selectedDate]);

  // When manually changing the template template in dropdown
  const handleTemplateChange = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    setSelectedTemplate(template);

    const initializedExs: ExerciseInput[] = template.prescriptions.map((p) => ({
      exercisePrescriptionId: p.id,
      exerciseName: p.exerciseName,
      movementPattern: p.movementPattern,
      sortOrder: p.sortOrder,
      notes: '',
      sets: Array.from({ length: p.targetSets }).map((_, i) => ({
        setNumber: i + 1,
        loadKg: '',
        reps: '',
        rpe: '',
        isFailure: false,
      })),
    }));
    setExercises(initializedExs);
    setMessage({ type: 'info', text: `Treino alterado manualmente para: ${template.label}` });
  };

  // Log inputs update
  const handleSetChange = (exIdx: number, setIdx: number, field: keyof SetInput, value: SetInput[keyof SetInput]) => {
    const updated = [...exercises];
    updated[exIdx].sets[setIdx] = {
      ...updated[exIdx].sets[setIdx],
      [field]: value,
    } as SetInput;
    setExercises(updated);
  };

  const addSet = (exIdx: number) => {
    const updated = [...exercises];
    const newSetNumber = updated[exIdx].sets.length + 1;
    updated[exIdx].sets.push({
      setNumber: newSetNumber,
      loadKg: '',
      reps: '',
      rpe: '',
      isFailure: false,
    });
    setExercises(updated);
  };

  const removeSet = (exIdx: number, setIdx: number) => {
    const updated = [...exercises];
    updated[exIdx].sets.splice(setIdx, 1);
    // Renumber remaining sets
    updated[exIdx].sets = updated[exIdx].sets.map((set, idx) => ({
      ...set,
      setNumber: idx + 1,
    }));
    setExercises(updated);
  };

  const handleSwapExerciseClick = async (exIdx: number) => {
    const ex = exercises[exIdx];
    setSwappingIndex(exIdx);
    setLoadingSuggestions(true);
    setSwapError(null);
    setSuggestions([]);

    try {
      const response = await fetch('/api/coach/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'exercise_swap',
          payload: {
            exerciseName: ex.exerciseName,
            movementPattern: ex.movementPattern,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Falha ao obter alternativas de substituição do Assistant Coach.');
      }

      const data = await response.json();
      if (data.success && data.output?.recommendations) {
        setSuggestions(data.output.recommendations);
      } else {
        throw new Error('Ocorreu um erro ou o formato retornado é inválido.');
      }
    } catch (err) {
      console.error(err);
      setSwapError(err instanceof Error ? err.message : 'Erro ao processar substituição.');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const applyExerciseSwap = (suggestedName: string) => {
    if (swappingIndex === null) return;
    const updated = [...exercises];
    const originalEx = updated[swappingIndex];

    originalEx.substitutedFrom = originalEx.substitutedFrom || originalEx.exerciseName;
    originalEx.exerciseName = suggestedName;

    setExercises(updated);
    setSwappingIndex(null);
    setSuggestions([]);
    setMessage({
      type: 'success',
      text: `Exercício substituído por "${suggestedName}" para o treino de hoje!`,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    // Payload construction
    const payload = {
      date: selectedDate,
      mesocyclePlanId: activeMesocycleId,
      wellness: {
        sleepHours,
        fatigueLevel,
        sorenessLevel,
        energyLevel,
        stressLevel,
        bodyWeightKg,
        notes: wellnessNotes,
      },
      workout: selectedTemplate
        ? {
            workoutDayTemplateId: selectedTemplate.id,
            sessionRpe: null, // Optional overall rating
            durationMinutes: selectedTemplate.estimatedDurationMin,
            notes: '',
            exercises: exercises
              .filter((ex) => ex.sets.some((s) => s.reps !== '' || s.loadKg !== '')) // Only send exercises that have logs
              .map((ex) => ({
                exercisePrescriptionId: ex.exercisePrescriptionId,
                exerciseName: ex.exerciseName,
                movementPattern: ex.movementPattern,
                sortOrder: ex.sortOrder,
                notes: ex.notes,
                substitutedFrom: ex.substitutedFrom || null,
                sets: ex.sets
                  .filter((s) => s.reps !== '')
                  .map((s) => ({
                    setNumber: s.setNumber,
                    loadKg: s.loadKg || null,
                    reps: s.reps,
                    rpe: s.rpe || null,
                    isFailure: s.isFailure,
                  })),
              })),
          }
        : null,
    };

    try {
      const response = await fetch('/api/workout/today', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Falha ao enviar registro de treino.');
      }

      setMessage({ type: 'success', text: 'Treino e Métricas de Bem-Estar gravados com sucesso no banco de dados!' });
      if (onSaved) onSaved();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Falha ao salvar registros diários.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-center p-8 text-slate-400">Buscando informações diárias de treino...</div>;
  }

  if (!activeMesocycleId) {
    return (
      <div className="bg-slate-800 border border-slate-700/60 rounded-2xl p-6 text-center text-slate-300">
        <Dumbbell className="h-10 w-10 text-slate-500 mx-auto mb-3" />
        <p className="text-lg font-bold">Nenhum Mesociclo Ativo</p>
        <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
          Para registrar seus treinos diários, você precisa primeiro forçar a geração de um novo mesociclo de hipertrofia através do botão superior.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Date and Selector Card */}
      <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <label htmlFor="workout-date" className="text-xs uppercase text-slate-400 font-bold block">Selecione o Dia</label>
            <input
              id="workout-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-slate-100 rounded-lg px-2 py-1 text-sm font-semibold focus:border-indigo-400 outline-none mt-0.5 cursor-pointer"
            />
          </div>
        </div>

        {selectedTemplate && (
          <div className="flex flex-col md:items-end">
            <label htmlFor="workout-select" className="text-xs uppercase text-slate-400 font-bold block mb-1">Mudar Treino de Hoje</label>
            <select
              id="workout-select"
              value={selectedTemplate.id}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-1.5 text-xs font-semibold focus:border-indigo-400 outline-none cursor-pointer"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} (~{t.estimatedDurationMin} min)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-start gap-2.5 ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : message.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300'
          }`}
        >
          <div className="mt-0.5 font-bold">ℹ️</div>
          <p>{message.text}</p>
        </div>
      )}

      {/* Grid: Wellness on left/top, Workouts on right/bottom */}
      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6">
        {/* Left column: Wellness inputs */}
        <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-2xl shadow-sm space-y-5 h-fit">
          <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider border-b border-slate-700 pb-2 flex items-center gap-2">
            <Smile className="h-4 w-4 text-emerald-400" />
            <span>Métricas de Recuperação</span>
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="sleep-hours" className="text-xs text-slate-400 font-bold block mb-1">Sono (Horas)</label>
              <input
                id="sleep-hours"
                type="number"
                step="0.5"
                placeholder="Ex: 8.5"
                value={sleepHours}
                onChange={(e) => setSleepHours(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label htmlFor="body-weight" className="text-xs text-slate-400 font-bold block mb-1">Peso Corporal (kg)</label>
              <input
                id="body-weight"
                type="number"
                step="0.1"
                placeholder="Ex: 78.4"
                value={bodyWeightKg}
                onChange={(e) => setBodyWeightKg(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-400"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-400 mb-1">
                <label htmlFor="fatigue-level">Nível de Fadiga</label>
                <span className="text-indigo-400">{fatigueLevel}/5</span>
              </div>
              <input
                id="fatigue-level"
                type="range"
                min="1"
                max="5"
                value={fatigueLevel}
                onChange={(e) => setFatigueLevel(e.target.value)}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold text-slate-400 mb-1">
                <label htmlFor="soreness-level">Dores Musculares</label>
                <span className="text-indigo-400">{sorenessLevel}/5</span>
              </div>
              <input
                id="soreness-level"
                type="range"
                min="1"
                max="5"
                value={sorenessLevel}
                onChange={(e) => setSorenessLevel(e.target.value)}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold text-slate-400 mb-1">
                <label htmlFor="energy-level">Energia/Disposição</label>
                <span className="text-indigo-400">{energyLevel}/5</span>
              </div>
              <input
                id="energy-level"
                type="range"
                min="1"
                max="5"
                value={energyLevel}
                onChange={(e) => setEnergyLevel(e.target.value)}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold text-slate-400 mb-1">
                <label htmlFor="stress-level">Nível de Estresse</label>
                <span className="text-indigo-400">{stressLevel}/5</span>
              </div>
              <input
                id="stress-level"
                type="range"
                min="1"
                max="5"
                value={stressLevel}
                onChange={(e) => setStressLevel(e.target.value)}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="wellness-notes" className="text-xs text-slate-400 font-bold block mb-1">Anotações do Dia</label>
            <textarea
              id="wellness-notes"
              rows={2}
              placeholder="Treino rendeu bem, sono de qualidade..."
              value={wellnessNotes}
              onChange={(e) => setWellnessNotes(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-400 resize-none"
            />
          </div>
        </div>

        {/* Right column: Target exercises tracking */}
        <div className="space-y-4">
          <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                <Dumbbell className="h-4 w-4 text-indigo-400" />
                <span>Planilha de Exercícios</span>
              </h3>
              {selectedTemplate && (
                <span className="text-xs bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/20 font-mono">
                  {selectedTemplate.label}
                </span>
              )}
            </div>

            {exercises.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-sm">Nenhum exercício prescrito para hoje.</div>
            ) : (
              <div className="space-y-6">
                {exercises.map((ex, exIdx) => {
                  const prescription = selectedTemplate?.prescriptions.find(
                    (p) => p.id === ex.exercisePrescriptionId
                  );
                  return (
                    <div key={ex.exercisePrescriptionId || exIdx} className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                      {/* Exercise Header */}
                      <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-2 mb-3">
                        <div>
                          <span className="text-xs text-slate-400 block uppercase font-mono tracking-wider">
                            Padrão: {ex.movementPattern}
                          </span>
                          <h4 className="text-sm font-bold text-slate-100 mt-0.5">
                            {ex.exerciseName}
                          </h4>
                          {prescription && (
                            <span className="text-[11px] text-indigo-300 block mt-0.5">
                              Meta IA: <span className="font-semibold">{prescription.targetSets} séries</span> x{' '}
                              <span className="font-semibold">
                                {prescription.targetRepMin}-{prescription.targetRepMax} reps
                              </span>{' '}
                              {prescription.targetRpeMin && (
                                <>
                                  | RPE{' '}
                                  <span className="font-semibold">
                                    {prescription.targetRpeMin}-{prescription.targetRpeMax}
                                  </span>
                                </>
                              )}
                              {prescription.advancedTechnique && (
                                <span className="ml-1.5 inline-block bg-amber-500/15 text-amber-300 px-1.5 py-0.2 rounded font-mono text-[9px] uppercase">
                                  {prescription.advancedTechnique}
                                </span>
                              )}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSwapExerciseClick(exIdx)}
                          className="flex items-center gap-1 text-[10px] text-cyan-400 border border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/15 transition px-2.5 py-1.5 rounded-lg font-bold w-fit cursor-pointer"
                        >
                          <Sparkles className="h-3 w-3" />
                          <span>Substituir Exercício</span>
                        </button>
                      </div>

                      {/* Sets list */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="text-slate-400 font-bold border-b border-slate-800">
                              <th className="py-2 pr-2 text-center w-12">Série</th>
                              <th className="py-2 px-2 text-center w-24">Carga (kg)</th>
                              <th className="py-2 px-2 text-center w-24">Repetições</th>
                              <th className="py-2 px-2 text-center w-24">RPE</th>
                              <th className="py-2 px-2 text-center w-16">Falha</th>
                              <th className="py-2 pl-2 w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {ex.sets.map((set, setIdx) => (
                              <tr key={setIdx} className="border-b border-slate-850 hover:bg-slate-800/10">
                                <td className="py-2 pr-2 text-center font-bold text-slate-400">
                                  {set.setNumber}
                                </td>
                                <td className="py-2 px-2">
                                  <input
                                    type="number"
                                    step="0.5"
                                    placeholder="0"
                                    value={set.loadKg}
                                    onChange={(e) => handleSetChange(exIdx, setIdx, 'loadKg', e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-center font-semibold text-slate-200 outline-none focus:border-indigo-400"
                                  />
                                </td>
                                <td className="py-2 px-2">
                                  <input
                                    type="number"
                                    placeholder="0"
                                    value={set.reps}
                                    onChange={(e) => handleSetChange(exIdx, setIdx, 'reps', e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-center font-semibold text-slate-200 outline-none focus:border-indigo-400"
                                  />
                                </td>
                                <td className="py-2 px-2">
                                  <select
                                    value={set.rpe}
                                    onChange={(e) => handleSetChange(exIdx, setIdx, 'rpe', e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-center font-semibold text-slate-200 outline-none focus:border-indigo-400 cursor-pointer"
                                  >
                                    <option value="">—</option>
                                    <option value="10">10 (Falha)</option>
                                    <option value="9.5">9.5</option>
                                    <option value="9">9 (1 RIR)</option>
                                    <option value="8.5">8.5</option>
                                    <option value="8">8 (2 RIR)</option>
                                    <option value="7.5">7.5</option>
                                    <option value="7">7 (3 RIR)</option>
                                    <option value="6">6</option>
                                    <option value="5">5</option>
                                  </select>
                                </td>
                                <td className="py-2 px-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={set.isFailure}
                                    onChange={(e) => handleSetChange(exIdx, setIdx, 'isFailure', e.target.checked)}
                                    className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500 cursor-pointer"
                                  />
                                </td>
                                <td className="py-2 pl-2">
                                  {ex.sets.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => removeSet(exIdx, setIdx)}
                                      className="text-rose-400 hover:text-rose-300 transition cursor-pointer"
                                      title="Remover série"
                                    >
                                      <Trash className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Add set button */}
                      <button
                        type="button"
                        onClick={() => addSet(exIdx)}
                        className="mt-2 flex items-center gap-1 text-[10px] text-slate-400 hover:text-indigo-400 transition cursor-pointer font-bold"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Adicionar Série</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Submit button bar */}
          <div className="bg-slate-800 border border-slate-700/80 p-4 rounded-2xl shadow-sm flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-slate-100 font-bold px-6 py-3 rounded-xl transition duration-200 shadow-md shadow-indigo-500/10 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {submitting ? (
                <>
                  <span className="h-4 w-4 border-2 border-slate-200 border-t-transparent rounded-full animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Salvar Treino & Bem-Estar</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      {/* 🔄 Modal de Substituição de Exercício (Assistant AI) */}
      {swappingIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8">
          <div className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div>
              <div className="flex items-center gap-2 text-cyan-400">
                <Sparkles className="h-5 w-5 animate-pulse" />
                <span className="text-xs uppercase tracking-[0.2em] font-bold">Assistant Coach AI</span>
              </div>
              <h3 className="text-lg font-bold text-slate-100 mt-2">
                Substituir: <span className="text-indigo-300">&ldquo;{exercises[swappingIndex]?.exerciseName}&rdquo;</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Buscando alternativas rápidas de mesmo padrão biomecânico para respeitar a duração de 1 hora de treino.
              </p>
            </div>

            {loadingSuggestions ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-3">
                <span className="h-8 w-8 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-slate-400">Analisando padrão biomecânico e setups rápidos...</span>
              </div>
            ) : swapError ? (
              <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-xl text-rose-350 text-xs">
                {swapError}
              </div>
            ) : (
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                {suggestions.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">Nenhuma sugestão de substituto encontrada.</p>
                ) : (
                  suggestions.map((sug, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => applyExerciseSwap(sug.title)}
                      className="w-full text-left bg-slate-950/45 border border-slate-800 hover:border-indigo-500/50 p-4 rounded-xl transition cursor-pointer hover:bg-slate-900/50 group"
                    >
                      <h4 className="text-sm font-bold text-slate-200 group-hover:text-indigo-300 transition">
                        {sug.title}
                      </h4>
                      <p className="text-xs text-slate-450 mt-1.5 leading-relaxed">
                        {sug.reason}
                      </p>
                    </button>
                  ))
                )}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setSwappingIndex(null);
                  setSuggestions([]);
                  setSwapError(null);
                }}
                className="bg-slate-950 text-slate-400 border border-slate-800 hover:bg-slate-900 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
