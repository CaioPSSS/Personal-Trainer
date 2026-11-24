'use client';

import { useState, useEffect } from 'react';
import {
  Dumbbell,
  Calendar,
  Plus,
  Trash,
  Save,
  Sparkles,
  Smile,
  RefreshCw,
  CheckCircle2,
  Repeat,
  Volume2,
  VolumeX,
  Smartphone,
  TrendingUp,
  AlertTriangle,
  X,
} from 'lucide-react';
import { useFormDraft } from '@/app/hooks/useFormDraft';
import { useWakeLock } from '@/app/hooks/useWakeLock';
import { getLocalISODate } from '@/lib/dateUtils';
import { playRestFinishedAlert } from '@/lib/sound';
import { calculateEstimated1RM } from '@/lib/analytics/hypertrophy-analytics';
import PostWorkoutSummaryModal, { PostWorkoutSummaryModalProps } from './PostWorkoutSummaryModal';
import ExerciseHistoryModal from './ExerciseHistoryModal';
import { ExercisePreviousPerformanceData } from '@/lib/progression/load-calculator';
import { formatMovementPattern } from '@/lib/labels';

interface SwapSuggestionItem {
  title: string;
  reason: string;
  metadata?: {
    objective?: string;
    selectedCount?: number;
    lastSelectedAt?: string;
    isPermanent?: boolean;
    [key: string]: unknown;
  } | null;
}

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
  substitutionHints?: {
    objective?: string;
    originalExerciseName?: string;
    permanentReplacement?: {
      fromExercise: string;
      toExercise: string;
      objective: string;
      updatedAt: string;
    } | null;
    savedSuggestions?: SwapSuggestionItem[];
  } | null;
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

interface DraftState {
  templateId?: string;
  durationMinutes?: string;
  exercises: ExerciseInput[];
  sleepHours: string;
  fatigueLevel: string;
  sorenessLevel: string;
  energyLevel: string;
  stressLevel: string;
  bodyWeightKg: string;
  wellnessNotes: string;
  sessionRpe: string;
}

const getRpeLabel = (rpeVal: string | null | undefined) => {
  if (!rpeVal) return '';
  const val = parseFloat(rpeVal);
  if (isNaN(val)) return '';
  if (val === 10) return 'Falha Absoluta';
  if (val >= 9) return '1 rep sobrando';
  if (val >= 8) return '2 reps sobrando';
  if (val >= 7) return '3 reps sobrando';
  return 'Leve';
};

export default function HypertrophyDailyTracker({ onSaved }: HypertrophyDailyTrackerProps) {
  const [selectedDate, setSelectedDate] = useState(getLocalISODate());
  const [activeMesocycleId, setActiveMesocycleId] = useState<string | null>(null);
  const [activeMesocycleObjective, setActiveMesocycleObjective] = useState<string>('');
  const [templates, setTemplates] = useState<WorkoutDayTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<WorkoutDayTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Swap suggestions states
  const [swappingIndex, setSwappingIndex] = useState<number | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<SwapSuggestionItem[]>([]);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapFromCache, setSwapFromCache] = useState(false);
  const [swapSource, setSwapSource] = useState<'cache' | 'ai' | 'fallback' | null>(null);
  const [activeSwapSuggestionId, setActiveSwapSuggestionId] = useState<string | null>(null);
  const [applyingSwapTitle, setApplyingSwapTitle] = useState<string | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // Form states
  const [sleepHours, setSleepHours] = useState('');
  const [fatigueLevel, setFatigueLevel] = useState('3');
  const [sorenessLevel, setSorenessLevel] = useState('3');
  const [energyLevel, setEnergyLevel] = useState('3');
  const [stressLevel, setStressLevel] = useState('3');
  const [bodyWeightKg, setBodyWeightKg] = useState('');
  const [wellnessNotes, setWellnessNotes] = useState('');
  const [savingWellness, setSavingWellness] = useState(false);
  const [wellnessSynced, setWellnessSynced] = useState(false);
  const [exercises, setExercises] = useState<ExerciseInput[]>([]);
  const [restoredFromDraft, setRestoredFromDraft] = useState(false);
  const [hasExistingWorkout, setHasExistingWorkout] = useState(false);
  const [sessionRpe, setSessionRpe] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [readiness, setReadiness] = useState<{
    score: number;
    status: 'green' | 'yellow' | 'red';
    label: string;
    recommendation: string;
  } | null>(null);
  const [showExtraExerciseForm, setShowExtraExerciseForm] = useState(false);
  const [extraExerciseName, setExtraExerciseName] = useState('');
  const [extraMovementPattern, setExtraMovementPattern] = useState('horizontal_push');
  const [extraTargetSets, setExtraTargetSets] = useState('3');
  
  const [previousPerformances, setPreviousPerformances] = useState<Record<string, string>>({});
  const [progressionData, setProgressionData] = useState<Record<string, ExercisePreviousPerformanceData>>({});
  const [isDeload, setIsDeload] = useState(false);
  const [currentWeekNumber, setCurrentWeekNumber] = useState(1);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [summaryModalProps, setSummaryModalProps] = useState<PostWorkoutSummaryModalProps | null>(null);

  const { saveDraft, loadDraft, clearDraft } = useFormDraft<DraftState>('workout-draft');
  const { isLocked: isWakeLockActive } = useWakeLock(true);
  const [swapCooldownTimeLeft, setSwapCooldownTimeLeft] = useState(0);
  const [activeTimer, setActiveTimer] = useState<{
    exIdx: number;
    exerciseName: string;
    seconds: number;
    totalSeconds: number;
  } | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoStartRest, setAutoStartRest] = useState(true);
  const [historyExerciseName, setHistoryExerciseName] = useState<string | null>(null);

  useEffect(() => {
    if (swapCooldownTimeLeft <= 0) return;
    const interval = setInterval(() => {
      setSwapCooldownTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [swapCooldownTimeLeft]);

  useEffect(() => {
    if (!activeTimer || activeTimer.seconds <= 0) return;
    const interval = setInterval(() => {
      setActiveTimer((prev) => {
        if (!prev) return null;
        if (prev.seconds <= 1) {
          playRestFinishedAlert(soundEnabled);
          return null;
        }
        return { ...prev, seconds: prev.seconds - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTimer, soundEnabled]);

  useEffect(() => {
    if (swappingIndex === null) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSwappingIndex(null);
        setSuggestions([]);
        setSwapError(null);
        setSwapFromCache(false);
        setSwapSource(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [swappingIndex]);

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
          setHasExistingWorkout(false);
          setLoading(false);
          return;
        }

        setActiveMesocycleId(data.mesocyclePlanId);
        setActiveMesocycleObjective(data.mesocycleObjective || '');
        setTemplates(data.templates || []);
        setPreviousPerformances(data.previousPerformances || {});
        const progs: Record<string, ExercisePreviousPerformanceData> = data.progressionData || data.previousPerformance || {};
        setProgressionData(progs);
        setIsDeload(data.isDeload || false);
        setCurrentWeekNumber(data.currentWeekNumber || 1);
        setReadiness(data.readiness || null);

        // Prepopulate Wellness if exists, else reset to defaults
        if (data.existingWellness) {
          setSleepHours(data.existingWellness.sleepHours?.toString() || '');
          setFatigueLevel(data.existingWellness.fatigueLevel?.toString() || '3');
          setSorenessLevel(data.existingWellness.sorenessLevel?.toString() || '3');
          setEnergyLevel(data.existingWellness.energyLevel?.toString() || '3');
          setStressLevel(data.existingWellness.stressLevel?.toString() || '3');
          setBodyWeightKg(data.existingWellness.bodyWeightKg?.toString() || '');
          setWellnessNotes(data.existingWellness.notes || '');
          setWellnessSynced(
            data.existingWellness.bodyWeightKg != null ||
            data.existingWellness.sleepHours != null ||
            data.existingWellness.stressLevel != null ||
            data.existingWellness.caloriesConsumed != null
          );
        } else {
          setSleepHours('');
          setFatigueLevel('3');
          setSorenessLevel('3');
          setEnergyLevel('3');
          setStressLevel('3');
          setBodyWeightKg('');
          setWellnessNotes('');
          setWellnessSynced(false);
        }

        // Prepopulate Session RPE
        if (data.existingWorkout) {
          setSessionRpe(data.existingWorkout.sessionRpe?.toString() || '');
        } else {
          setSessionRpe('');
        }

        // Set Active Template (prefer saved workoutDayTemplateId on existingWorkout)
        let currentTemplate: WorkoutDayTemplate | null = null;
        if (data.existingWorkout?.workoutDayTemplateId) {
          currentTemplate =
            (data.templates || []).find(
              (t: WorkoutDayTemplate) => t.id === data.existingWorkout.workoutDayTemplateId
            ) || null;
        }
        if (!currentTemplate && data.existingWorkout && data.existingWorkout.exerciseExecutions?.length > 0) {
          // Fallback: identify the template from first exercise prescription
          const firstEx = data.existingWorkout.exerciseExecutions[0];
          const presId = firstEx.exercisePrescriptionId;
          currentTemplate = (data.templates || []).find((t: WorkoutDayTemplate) =>
            t.prescriptions.some((p) => p.id === presId)
          ) || data.workoutToday;
        } else if (!currentTemplate) {
          currentTemplate = data.workoutToday;
        }

        setSelectedTemplate(currentTemplate);
        setDurationMinutes(
          data.existingWorkout?.durationMinutes != null
            ? String(data.existingWorkout.durationMinutes)
            : currentTemplate?.estimatedDurationMin != null
              ? String(currentTemplate.estimatedDurationMin)
              : '60'
        );

        // Prepopulate Exercises
        if (data.existingWorkout && data.existingWorkout.exerciseExecutions?.length > 0) {
          setHasExistingWorkout(true);
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
            substitutedFrom?: string | null;
            sortOrder: number;
            notes?: string | null;
            setExecutions: SetExecutionJson[];
          }
          const mappedExs: ExerciseInput[] = data.existingWorkout.exerciseExecutions.map((ex: ExerciseExecutionJson) => ({
            exercisePrescriptionId: ex.exercisePrescriptionId || '',
            exerciseName: ex.exerciseName,
            movementPattern: ex.movementPattern || '',
            substitutedFrom: ex.substitutedFrom || undefined,
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
          setHasExistingWorkout(false);
          // Initialize empty sets based on prescription with suggested load prefilled
          const initializedExs: ExerciseInput[] = currentTemplate.prescriptions.map((p) => {
            const prog = progs[p.id];
            const prefillLoad = prog && prog.suggestedLoadKg > 0 ? prog.suggestedLoadKg.toString() : '';

            return {
              exercisePrescriptionId: p.id,
              exerciseName: p.exerciseName,
              movementPattern: p.movementPattern,
              sortOrder: p.sortOrder,
              notes: '',
              sets: Array.from({ length: p.targetSets }).map((_, i) => ({
                setNumber: i + 1,
                loadKg: prefillLoad,
                reps: '',
                rpe: '',
                isFailure: false,
              })),
            };
          });
          setExercises(initializedExs);
        }

        // Check for local drafts (only if there is no submitted workout and template matches)
        const draft = loadDraft(selectedDate);
        const draftTemplateMatches =
          !draft?.templateId || !currentTemplate || draft.templateId === currentTemplate.id;
        if (
          draft &&
          draftTemplateMatches &&
          (!data.existingWorkout || data.existingWorkout.exerciseExecutions?.length === 0)
        ) {
          setExercises(draft.exercises);
          setSleepHours(draft.sleepHours);
          setFatigueLevel(draft.fatigueLevel);
          setSorenessLevel(draft.sorenessLevel);
          setEnergyLevel(draft.energyLevel);
          setStressLevel(draft.stressLevel);
          setBodyWeightKg(draft.bodyWeightKg);
          setWellnessNotes(draft.wellnessNotes);
          setSessionRpe(draft.sessionRpe || '');
          if (draft.durationMinutes) {
            setDurationMinutes(draft.durationMinutes);
          }
          setRestoredFromDraft(true);
        } else {
          setRestoredFromDraft(false);
        }
      } catch (err) {
        console.error(err);
        setMessage({ type: 'error', text: 'Não foi possível buscar as informações do treino.' });
      } finally {
        setLoading(false);
      }
    };

    void loadDateData();
  }, [selectedDate, loadDraft, reloadTrigger]);

  // Auto-save form drafts to localStorage
  useEffect(() => {
    if (!activeMesocycleId || loading) return;
    saveDraft({
      templateId: selectedTemplate?.id,
      durationMinutes,
      exercises,
      sleepHours,
      fatigueLevel,
      sorenessLevel,
      energyLevel,
      stressLevel,
      bodyWeightKg,
      wellnessNotes,
      sessionRpe,
    }, selectedDate);
  }, [
    selectedTemplate?.id,
    durationMinutes,
    exercises,
    sleepHours,
    fatigueLevel,
    sorenessLevel,
    energyLevel,
    stressLevel,
    bodyWeightKg,
    wellnessNotes,
    sessionRpe,
    selectedDate,
    activeMesocycleId,
    loading,
    saveDraft
  ]);

  // When manually changing the template in dropdown
  const handleTemplateChange = async (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    setSelectedTemplate(template);
    setDurationMinutes(String(template.estimatedDurationMin || 60));
    setRestoredFromDraft(false);

    const initializedExs: ExerciseInput[] = template.prescriptions.map((p) => {
      const prog = progressionData[p.id];
      const prefillLoad = prog && prog.suggestedLoadKg > 0 ? prog.suggestedLoadKg.toString() : '';

      return {
        exercisePrescriptionId: p.id,
        exerciseName: p.exerciseName,
        movementPattern: p.movementPattern,
        sortOrder: p.sortOrder,
        notes: '',
        sets: Array.from({ length: p.targetSets }).map((_, i) => ({
          setNumber: i + 1,
          loadKg: prefillLoad,
          reps: '',
          rpe: '',
          isFailure: false,
        })),
      };
    });
    setExercises(initializedExs);
    setMessage({ type: 'info', text: `Atualizando calendário para: ${template.label}...` });

    try {
      const res = await fetch('/api/workout/select-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          templateId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessage({
          type: 'success',
          text: data.message || `Treino atualizado no calendário para "${template.label}" e semana reorganizada pela IA!`,
        });
        window.dispatchEvent(new CustomEvent('calendar-refresh'));
      } else {
        const errData = await res.json().catch(() => ({}));
        setMessage({
          type: 'info',
          text: `Treino alterado na ficha para "${template.label}". (${errData.error || 'Calendário mantido'})`,
        });
      }
    } catch (err) {
      console.error('Erro ao atualizar treino no calendário:', err);
    }
  };

  // Log inputs update
  const handleSetChange = (exIdx: number, setIdx: number, field: keyof SetInput, value: SetInput[keyof SetInput]) => {
    const updated = [...exercises];
    updated[exIdx].sets[setIdx] = {
      ...updated[exIdx].sets[setIdx],
      [field]: value,
    } as SetInput;
    setExercises(updated);
    
    if (field === 'isFailure' && value === true) {
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(40);
    }

    // Auto-start rest timer when RPE is selected or Failure is checked
    const isRpeTrigger = field === 'rpe' && String(value) !== '';
    const isFailureTrigger = field === 'isFailure' && value === true;

    if (autoStartRest && (isRpeTrigger || isFailureTrigger)) {
      const targetEx = updated[exIdx];
      const prescription = selectedTemplate?.prescriptions.find(
        (p) => p.id === targetEx.exercisePrescriptionId
      );
      const restSec = prescription?.restSeconds || 90;
      setActiveTimer({
        exIdx,
        exerciseName: targetEx.exerciseName,
        seconds: restSec,
        totalSeconds: restSec,
      });
    }
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

  const handleSwapExerciseClick = async (exIdx: number, forceRefresh = false) => {
    if (forceRefresh && swapCooldownTimeLeft > 0) return;
    const ex = exercises[exIdx];
    const targetExerciseName = ex.substitutedFrom || ex.exerciseName;

    setSwappingIndex(exIdx);
    setLoadingSuggestions(true);
    setSwapError(null);
    if (forceRefresh) {
      setSuggestions([]);
      setSwapFromCache(false);
      setSwapSource(null);
    }

    try {
      const response = await fetch('/api/coach/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'exercise_swap',
          payload: {
            exerciseName: targetExerciseName,
            movementPattern: ex.movementPattern,
            exercisePrescriptionId: ex.exercisePrescriptionId || undefined,
            objective: activeMesocycleObjective || undefined,
            forceRefresh,
          },
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(
          errJson.error || 'Falha ao obter alternativas de substituição do Assistant Coach.'
        );
      }

      const data = await response.json();
      if (data.success && Array.isArray(data.output?.recommendations)) {
        setSuggestions(data.output.recommendations);
        setSwapFromCache(Boolean(data.fromCache));
        setSwapSource(
          data.source || (data.usedFallback ? 'fallback' : data.fromCache ? 'cache' : 'ai')
        );
        setActiveSwapSuggestionId(data.swapSuggestionId || null);
        if (!data.fromCache) {
          setSwapCooldownTimeLeft(15);
        }
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

  const applyExerciseSwap = async (sug: SwapSuggestionItem, applyScope: 'today' | 'always') => {
    if (swappingIndex === null) return;
    const targetIdx = swappingIndex;
    const updated = [...exercises];
    const originalEx = { ...updated[targetIdx] };
    const canonicalOriginalName = originalEx.substitutedFrom || originalEx.exerciseName;

    setApplyingSwapTitle(sug.title);

    // Update current workout session state immediately & clear stale prefilled loadKg on unlogged sets
    originalEx.substitutedFrom = canonicalOriginalName;
    originalEx.exerciseName = sug.title;
    originalEx.sets = originalEx.sets.map((s) => ({
      ...s,
      loadKg: s.reps.trim() === '' ? '' : s.loadKg,
    }));
    updated[targetIdx] = originalEx;
    setExercises(updated);

    try {
      const res = await fetch('/api/coach/assistant', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          swapSuggestionId: activeSwapSuggestionId,
          exercisePrescriptionId: originalEx.exercisePrescriptionId || null,
          requestedExercise: canonicalOriginalName,
          selectedTitle: sug.title,
          selectedReason: sug.reason,
          movementPattern: originalEx.movementPattern,
          objective: activeMesocycleObjective || undefined,
          applyScope,
          recommendations: suggestions,
        }),
      });

      if (res.ok) {
        const patchData = await res.json();

        // Update progression badge & prefill load if historical performance exists for the replacement exercise
        if (originalEx.exercisePrescriptionId) {
          const rxId = originalEx.exercisePrescriptionId;
          if (patchData.replacementProgression) {
            setProgressionData((prev) => ({
              ...prev,
              [rxId]: patchData.replacementProgression,
            }));
            if (patchData.replacementPreviousPerformanceText) {
              setPreviousPerformances((prev) => ({
                ...prev,
                [rxId]: patchData.replacementPreviousPerformanceText,
              }));
            } else {
              setPreviousPerformances((prev) => {
                const next = { ...prev };
                delete next[rxId];
                return next;
              });
            }
            const suggestedKg = patchData.replacementProgression.suggestedLoadKg;
            if (suggestedKg > 0) {
              setExercises((prevExs) => {
                const nextExs = [...prevExs];
                const target = nextExs[targetIdx];
                if (target) {
                  nextExs[targetIdx] = {
                    ...target,
                    sets: target.sets.map((s) => ({
                      ...s,
                      loadKg: s.reps === '' ? String(suggestedKg) : s.loadKg,
                    })),
                  };
                }
                return nextExs;
              });
            }
          } else {
            // Replacement exercise has no historical records: reset badge/details cleanly
            setProgressionData((prev) => ({
              ...prev,
              [rxId]: {
                lastLoadKg: 0,
                suggestedLoadKg: 0,
                deltaKg: 0,
                lastReps: 0,
                lastRpe: null,
                action: 'maintain',
                reason: 'Primeira execução do exercício substituto. Defina a carga inicial.',
                progressionReason: 'Primeira execução do exercício substituto. Defina a carga inicial.',
              },
            }));
            setPreviousPerformances((prev) => {
              const next = { ...prev };
              delete next[rxId];
              return next;
            });
          }
        }

        // If permanent ('always'), update templates and selectedTemplate in state
        if (applyScope === 'always' && originalEx.exercisePrescriptionId) {
          const updatedIds: string[] = Array.isArray(patchData.updatedPrescriptionIds)
            ? patchData.updatedPrescriptionIds
            : [originalEx.exercisePrescriptionId];

          const updateTemplatePrescriptions = (tmpl: WorkoutDayTemplate): WorkoutDayTemplate => ({
            ...tmpl,
            prescriptions: tmpl.prescriptions.map((p) =>
              updatedIds.includes(p.id)
                ? {
                    ...p,
                    exerciseName: sug.title,
                    substitutionHints: {
                      ...(p.substitutionHints || {}),
                      objective: activeMesocycleObjective,
                      originalExerciseName:
                        p.substitutionHints?.originalExerciseName || canonicalOriginalName,
                      permanentReplacement: {
                        fromExercise:
                          p.substitutionHints?.originalExerciseName || canonicalOriginalName,
                        toExercise: sug.title,
                        objective: activeMesocycleObjective,
                        updatedAt: new Date().toISOString(),
                      },
                      savedSuggestions: patchData.recommendations || suggestions,
                    },
                  }
                : p
            ),
          });

          setTemplates((prev) => prev.map(updateTemplatePrescriptions));
          setSelectedTemplate((prev) => (prev ? updateTemplatePrescriptions(prev) : null));
        }
      }
    } catch (err) {
      console.warn('Não foi possível sincronizar preferência de substituição:', err);
    } finally {
      setApplyingSwapTitle(null);
      setSwappingIndex(null);
      setSuggestions([]);
      setSwapFromCache(false);
      setSwapSource(null);
      setMessage({
        type: 'success',
        text:
          applyScope === 'always'
            ? `Exercício substituído sempre por "${sug.title}"! Seu plano atual foi atualizado e a IA principal foi informada.`
            : `Exercício substituído hoje por "${sug.title}" (opções salvas para as próximas vezes)!`,
      });
    }
  };

  const handleSaveWellnessOnly = async () => {
    setSavingWellness(true);
    setMessage(null);
    try {
      const res = await fetch('/api/workout/today', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          mesocyclePlanId: activeMesocycleId,
          wellness: {
            sleepHours: sleepHours || null,
            fatigueLevel,
            sorenessLevel,
            energyLevel,
            stressLevel,
            bodyWeightKg: bodyWeightKg || null,
            notes: wellnessNotes,
          },
        }),
      });

      if (!res.ok) throw new Error('Falha ao salvar métricas de recuperação.');
      const data = await res.json();
      setWellnessSynced(true);
      setMessage({
        type: 'success',
        text: data.message || 'Métricas de recuperação salvas e sincronizadas com o Rastreador Metabólico com sucesso!',
      });
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([30, 40]);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Falha ao salvar métricas de recuperação.',
      });
    } finally {
      setSavingWellness(false);
    }
  };

  const handleAddExtraExercise = () => {
    const trimmed = extraExerciseName.trim();
    if (!trimmed) return;
    const targetSets = Math.min(8, Math.max(1, parseInt(extraTargetSets, 10) || 3));
    const newExercise: ExerciseInput = {
      exercisePrescriptionId: '',
      exerciseName: trimmed,
      movementPattern: extraMovementPattern,
      sortOrder: exercises.length + 1,
      notes: 'Exercício extra adicionado pelo atleta',
      sets: Array.from({ length: targetSets }).map((_, i) => ({
        setNumber: i + 1,
        loadKg: '',
        reps: '',
        rpe: '',
        isFailure: false,
      })),
    };
    setExercises((prev) => [...prev, newExercise]);
    setExtraExerciseName('');
    setExtraTargetSets('3');
    setShowExtraExerciseForm(false);
  };

  const handleRemoveExtraExercise = (exIdx: number) => {
    setExercises((prev) => prev.filter((_, idx) => idx !== exIdx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    const isValidSet = (s: SetInput) => {
      const parsed = Number(s.reps);
      return s.reps.trim() !== '' && Number.isFinite(parsed) && parsed > 0;
    };

    const exercisesWithValidSets = exercises
      .map((ex) => ({
        ...ex,
        validSets: ex.sets.filter(isValidSet),
      }))
      .filter((ex) => ex.validSets.length > 0);

    if (exercisesWithValidSets.length === 0) {
      setMessage({
        type: 'error',
        text: "Preencha as repetições (> 0) em pelo menos uma série antes de finalizar o treino. Para salvar apenas sono/peso/bem-estar, use o botão 'Salvar Métricas de Recuperação'.",
      });
      setSubmitting(false);
      return;
    }

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
            sessionRpe: sessionRpe ? parseFloat(sessionRpe) : null,
            durationMinutes:
              Number(durationMinutes) > 0
                ? Number(durationMinutes)
                : selectedTemplate.estimatedDurationMin,
            notes: '',
            exercises: exercisesWithValidSets.map((ex) => ({
              exercisePrescriptionId: ex.exercisePrescriptionId || null,
              exerciseName: ex.exerciseName,
              movementPattern: ex.movementPattern,
              sortOrder: ex.sortOrder,
              notes: ex.notes,
              substitutedFrom: ex.substitutedFrom || null,
              sets: ex.validSets.map((s) => ({
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
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Falha ao enviar registro de treino.');
      }

      const data = await response.json();

      setMessage({ type: 'success', text: 'Treino e Métricas de Bem-Estar gravados com sucesso no banco de dados!' });
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([30, 50, 30]);
      clearDraft(selectedDate);
      setRestoredFromDraft(false);

      if (data.summary) {
        setSummaryModalProps({
          isOpen: true,
          onClose: () => {
            setIsSummaryModalOpen(false);
            if (onSaved) onSaved();
          },
          workoutTitle: selectedTemplate?.label || 'Treino do Dia',
          durationMinutes: data.summary.durationMinutes ?? selectedTemplate?.estimatedDurationMin,
          sessionRpe: sessionRpe ? parseFloat(sessionRpe) : data.summary.averageRpe,
          averageRpe: data.summary.averageRpe,
          totalTonnage: data.summary.totalTonnage,
          totalTonnageKg: data.summary.totalTonnage,
          previousTonnage: data.summary.previousTonnage,
          previousTonnageKg: data.summary.previousTonnage,
          tonnageDeltaPercent: data.summary.tonnageDeltaPercent,
          validSetsCount: data.summary.validSetsCount,
          completedSetsCount: data.summary.completedSetsCount,
          personalRecords: data.summary.personalRecords,
          recovery: data.summary.recovery,
          recoveryGuidance: data.summary.recoveryGuidance,
          caloriesBurned: data.summary.caloriesBurned,
          calorieBreakdown: data.summary.calorieBreakdown,
        });
        setIsSummaryModalOpen(true);
      } else {
        if (onSaved) onSaved();
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Falha ao salvar registros diários.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        {/* Top selector skeleton */}
        <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-2xl flex justify-between items-center">
          <div className="h-10 bg-slate-700 rounded-xl w-40" />
          <div className="h-10 bg-slate-700 rounded-xl w-40" />
        </div>
        {/* Main layouts skeleton */}
        <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6">
          <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-2xl h-96 space-y-4">
            <div className="h-6 bg-slate-700 rounded w-1/2" />
            <div className="h-12 bg-slate-700 rounded w-full" />
            <div className="h-12 bg-slate-700 rounded w-full" />
            <div className="h-12 bg-slate-700 rounded w-full" />
          </div>
          <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-2xl h-96 space-y-4">
            <div className="h-6 bg-slate-700 rounded w-1/3" />
            <div className="h-20 bg-slate-700 rounded w-full" />
            <div className="h-20 bg-slate-700 rounded w-full" />
          </div>
        </div>
      </div>
    );
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
      {isDeload && (
        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl flex items-start gap-3 shadow-sm mb-6">
          <span className="text-amber-300 font-bold mt-0.5 text-lg">⚠️</span>
          <div>
            <p className="text-sm text-amber-300 font-bold uppercase tracking-wider">Semana de Deload Ativa (Semana {currentWeekNumber})</p>
            <p className="text-xs text-amber-200 mt-1">O objetivo hoje é recuperação ativa. Mantenha 1-2 repetições a mais na reserva (RPE Menor) e não tente quebrar recordes de carga.</p>
          </div>
        </div>
      )}

      {readiness?.status === 'red' && (
        <div className="bg-rose-500/10 border border-rose-500/35 p-4 rounded-2xl flex items-start gap-3 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-rose-300 font-bold uppercase tracking-wider">
              Prontidão Baixa Detectada ({readiness.score}/100 — {readiness.label})
            </p>
            <p className="text-xs text-rose-200/90 mt-1">{readiness.recommendation}</p>
          </div>
        </div>
      )}

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

      {restoredFromDraft && (
        <div className="bg-indigo-500/10 border border-indigo-500/30 p-3 rounded-xl flex items-center justify-between">
          <p className="text-sm text-indigo-300 font-medium">
            📝 Rascunho restaurado automaticamente. Seus dados da sessão não foram perdidos.
          </p>
          <button
            type="button"
            onClick={() => {
              clearDraft(selectedDate);
              setRestoredFromDraft(false);
              setReloadTrigger((n) => n + 1);
            }}
            className="text-xs text-slate-400 hover:text-rose-300 border border-slate-700 px-2.5 py-1 rounded-lg transition cursor-pointer"
          >
            Descartar
          </button>
        </div>
      )}

      {hasExistingWorkout && (
        <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl flex items-start gap-2.5">
          <span className="text-amber-300 font-bold mt-0.5">⚠️</span>
          <div>
            <p className="text-sm text-amber-300 font-semibold">Treino já registrado para {selectedDate}</p>
            <p className="text-xs text-amber-200/60">Salvar novamente irá substituir o registro anterior.</p>
          </div>
        </div>
      )}

      {/* Grid: Wellness on left/top, Workouts on right/bottom */}
      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6">
        {/* Left column: Wellness inputs */}
        <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-2xl shadow-sm space-y-5 h-fit">
          <div className="flex items-center justify-between border-b border-slate-700 pb-2">
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
              <Smile className="h-4 w-4 text-emerald-400" />
              <span>Métricas de Recuperação</span>
            </h3>
            {wellnessSynced ? (
              <span
                className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full"
                title="Integrado ao Meu Rastreador Metabólico"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                🔗 Rastreador
              </span>
            ) : (
              <span className="text-[11px] text-slate-400 font-medium">Check-in Diário</span>
            )}
          </div>

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

          <button
            type="button"
            onClick={handleSaveWellnessOnly}
            disabled={savingWellness}
            className="w-full py-2.5 px-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-60 shadow-sm"
          >
            {savingWellness ? (
              <>
                <span className="h-3.5 w-3.5 border-2 border-emerald-300 border-t-transparent rounded-full animate-spin" />
                <span>Sincronizando com Rastreador...</span>
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                <span>Salvar Check-in de Recuperação</span>
              </>
            )}
          </button>
        </div>

        {/* Right column: Target exercises tracking */}
        <div className="space-y-4">
          <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-2xl shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <Dumbbell className="h-4 w-4 text-indigo-400" />
                  <span>Planilha de Exercícios</span>
                </h3>
                {isWakeLockActive && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full"
                    title="Wake Lock ativo: a tela permanecerá ligada durante o treino"
                  >
                    <Smartphone className="h-2.5 w-2.5" />
                    <span>Tela ativa</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAutoStartRest((prev) => !prev)}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition cursor-pointer ${
                    autoStartRest
                      ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                      : 'bg-slate-900 text-slate-500 border-slate-700'
                  }`}
                  title="Iniciar cronômetro de descanso automaticamente ao preencher RPE ou Falha"
                >
                  ⏱️ Timer Automático: {autoStartRest ? 'Ativado' : 'Desativado'}
                </button>
                <button
                  type="button"
                  onClick={() => setSoundEnabled((prev) => !prev)}
                  className={`p-1 rounded-lg border transition cursor-pointer ${
                    soundEnabled
                      ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                      : 'bg-slate-900 text-slate-500 border-slate-700'
                  }`}
                  title={soundEnabled ? 'Alerta sonoro ativado' : 'Alerta sonoro silenciado'}
                >
                  {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                </button>
                {selectedTemplate && (
                  <span className="text-xs bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/20 font-mono">
                    {selectedTemplate.label}
                  </span>
                )}
              </div>
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
                            Padrão: {formatMovementPattern(ex.movementPattern)}
                          </span>
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            <button
                              type="button"
                              onClick={() => setHistoryExerciseName(ex.exerciseName)}
                              className="text-sm font-bold text-slate-100 hover:text-indigo-300 transition flex items-center gap-1.5 cursor-pointer group text-left"
                              title="Clique para abrir histórico de cargas e e1RM deste exercício"
                            >
                              <span className="underline decoration-slate-700 group-hover:decoration-indigo-400 underline-offset-4">
                                {ex.exerciseName}
                              </span>
                              <TrendingUp className="h-3.5 w-3.5 text-indigo-400 opacity-80 group-hover:opacity-100 shrink-0" />
                            </button>
                            {prescription && (() => {
                              const prog = progressionData[prescription.id];
                              if (!prog || prog.lastLoadKg === 0) {
                                return (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-indigo-300 font-semibold bg-indigo-500/15 border border-indigo-500/30 px-2.5 py-0.5 rounded-full">
                                    Primeira sessão
                                  </span>
                                );
                              }
                              if (prog.action === 'deload' || prog.deltaKg < 0) {
                                return (
                                  <span
                                    title={prog.reason || prog.progressionReason}
                                    className="inline-flex items-center gap-1 text-[11px] text-amber-300 font-semibold bg-amber-500/20 border border-amber-500/40 px-2.5 py-0.5 rounded-full"
                                  >
                                    Deload: {prog.suggestedLoadKg} kg ({prog.deltaKg} kg)
                                  </span>
                                );
                              }
                              if (prog.deltaKg > 0) {
                                return (
                                  <span
                                    title={prog.reason || prog.progressionReason}
                                    className="inline-flex items-center gap-1 text-[11px] text-emerald-300 font-semibold bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 rounded-full"
                                  >
                                    Último: {prog.lastLoadKg} kg (+{prog.deltaKg} kg sugerido)
                                  </span>
                                );
                              }
                              return (
                                <span
                                  title={prog.reason || prog.progressionReason}
                                  className="inline-flex items-center gap-1 text-[11px] text-slate-300 font-semibold bg-slate-800 border border-slate-700 px-2.5 py-0.5 rounded-full"
                                >
                                  Último: {prog.lastLoadKg} kg (manter carga)
                                </span>
                              );
                            })()}
                          </div>
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
                          {prescription && previousPerformances[prescription.id] && (
                            <span className="text-[11px] text-slate-400 block mt-1 font-mono text-[10px]">
                              Detalhes da última sessão: {previousPerformances[prescription.id]}
                            </span>
                          )}
                          {ex.substitutedFrom && ex.substitutedFrom !== ex.exerciseName && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-md mt-1.5 font-medium">
                              <Repeat className="h-2.5 w-2.5" />
                              <span>Substituindo hoje: {ex.substitutedFrom}</span>
                            </span>
                          )}
                          {(!ex.substitutedFrom || ex.substitutedFrom === ex.exerciseName) &&
                            prescription?.substitutionHints?.permanentReplacement && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md mt-1.5 font-medium">
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                <span>
                                  Substituto fixo (era {prescription.substitutionHints.permanentReplacement.fromExercise})
                                </span>
                              </span>
                            )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleSwapExerciseClick(exIdx, false)}
                            className="flex items-center gap-1 text-[10px] text-cyan-400 border border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/15 transition px-2.5 py-1.5 rounded-lg font-bold w-fit cursor-pointer"
                          >
                            <Sparkles className="h-3 w-3" />
                            <span>
                              {prescription?.substitutionHints?.savedSuggestions?.length
                                ? 'Substituir Exercício (Salvo)'
                                : 'Substituir Exercício'}
                            </span>
                          </button>
                          {!ex.exercisePrescriptionId && (
                            <button
                              type="button"
                              onClick={() => handleRemoveExtraExercise(exIdx)}
                              className="flex items-center gap-1 text-[10px] text-rose-400 border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/15 transition px-2 py-1.5 rounded-lg font-bold cursor-pointer"
                              title="Remover exercício extra"
                            >
                              <Trash className="h-3 w-3" />
                              <span>Remover</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Mobile layout: Card stack */}
                      <div className="sm:hidden space-y-3 mt-3">
                        {ex.sets.map((set, setIdx) => {
                          const isHardSet = set.isFailure || (set.rpe && parseFloat(set.rpe) >= 9);
                          return (
                          <div key={setIdx} className={`bg-slate-950 p-4 rounded-xl border ${isHardSet ? 'border-rose-500/50' : 'border-slate-800'} space-y-3 shadow-inner transition-colors duration-300`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-slate-400">Série {set.setNumber}</span>
                                {(() => {
                                  const live1RM = calculateEstimated1RM(
                                    parseFloat(set.loadKg),
                                    parseInt(set.reps, 10),
                                    set.rpe ? parseFloat(set.rpe) : null
                                  );
                                  return live1RM > 0 ? (
                                    <span className="text-[10px] font-mono font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/25 px-1.5 py-0.5 rounded">
                                      e1RM {live1RM}kg
                                    </span>
                                  ) : null;
                                })()}
                              </div>
                              <div className="flex items-center gap-3">
                                <label className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                                  <input
                                    type="checkbox"
                                    checked={set.isFailure}
                                    onChange={(e) => handleSetChange(exIdx, setIdx, 'isFailure', e.target.checked)}
                                    className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500 cursor-pointer"
                                  />
                                  <span>Falha</span>
                                </label>
                                {ex.sets.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeSet(exIdx, setIdx)}
                                    className="text-rose-400 hover:text-rose-300 transition cursor-pointer"
                                    title="Remover série"
                                  >
                                    <Trash className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-[10px] text-slate-500 block mb-1 font-bold">Carga (kg)</label>
                                <input
                                  type="number"
                                  step="0.5"
                                  placeholder="0"
                                  value={set.loadKg}
                                  onChange={(e) => handleSetChange(exIdx, setIdx, 'loadKg', e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-center text-sm font-semibold text-slate-200 outline-none focus:border-indigo-400"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-500 block mb-1 font-bold">Reps</label>
                                <input
                                  type="number"
                                  placeholder="0"
                                  value={set.reps}
                                  onChange={(e) => handleSetChange(exIdx, setIdx, 'reps', e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-center text-sm font-semibold text-slate-200 outline-none focus:border-indigo-400"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-500 flex justify-between items-center mb-1 font-bold">
                                  <span>RPE</span>
                                  <span className="text-indigo-400 text-[9px] ml-1">{getRpeLabel(set.rpe)}</span>
                                </label>
                                <select
                                  value={set.rpe}
                                  onChange={(e) => handleSetChange(exIdx, setIdx, 'rpe', e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-1 py-1.5 text-center text-sm font-semibold text-slate-200 outline-none focus:border-indigo-400 cursor-pointer"
                                >
                                  <option value="">—</option>
                                  <option value="10">10</option>
                                  <option value="9.5">9.5</option>
                                  <option value="9">9</option>
                                  <option value="8.5">8.5</option>
                                  <option value="8">8</option>
                                  <option value="7.5">7.5</option>
                                  <option value="7">7</option>
                                  <option value="6">6</option>
                                  <option value="5">5</option>
                                </select>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                const restSec = prescription?.restSeconds || 90;
                                setActiveTimer({
                                  exIdx,
                                  exerciseName: ex.exerciseName,
                                  seconds: restSec,
                                  totalSeconds: restSec,
                                });
                              }}
                              className="w-full text-center text-[10px] text-cyan-400 border border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10 px-2.5 py-1.5 rounded-lg transition font-bold"
                            >
                              ⏱️ {activeTimer?.exIdx === exIdx && activeTimer.seconds > 0
                                ? `Descanso: ${Math.floor(activeTimer.seconds / 60)}:${String(activeTimer.seconds % 60).padStart(2, '0')}`
                                : `Iniciar Descanso (${prescription?.restSeconds || 90}s)`
                              }
                            </button>
                          </div>
                          );
                        })}
                      </div>

                      {/* Desktop layout: Table */}
                      <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="text-slate-400 font-bold border-b border-slate-800">
                              <th className="py-2 pr-2 text-center w-12">Série</th>
                              <th className="py-2 px-2 text-center w-24">Carga (kg)</th>
                              <th className="py-2 px-2 text-center w-24">Repetições</th>
                              <th className="py-2 px-2 text-center w-24">RPE</th>
                              <th className="py-2 px-2 text-center w-16">Falha</th>
                              <th className="py-2 px-2 text-center w-36">Descanso</th>
                              <th className="py-2 pl-2 w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {ex.sets.map((set, setIdx) => {
                              const isHardSet = set.isFailure || (set.rpe && parseFloat(set.rpe) >= 9);
                              return (
                              <tr key={setIdx} className={`border-b border-slate-850 hover:bg-slate-800/10 ${isHardSet ? 'bg-rose-500/10' : ''} transition-colors duration-300`}>
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
                                  <div className="flex flex-col items-center">
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
                                    <span className="text-[9px] text-indigo-400 mt-0.5 min-h-[14px]">{getRpeLabel(set.rpe)}</span>
                                  </div>
                                </td>
                                <td className="py-2 px-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={set.isFailure}
                                    onChange={(e) => handleSetChange(exIdx, setIdx, 'isFailure', e.target.checked)}
                                    className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500 cursor-pointer"
                                  />
                                </td>
                                <td className="py-2 px-2 text-center">
                                  <div className="flex flex-col items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const restSec = prescription?.restSeconds || 90;
                                        setActiveTimer({
                                          exIdx,
                                          exerciseName: ex.exerciseName,
                                          seconds: restSec,
                                          totalSeconds: restSec,
                                        });
                                      }}
                                      className="text-[10px] text-cyan-400 border border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10 px-2.5 py-1.5 rounded-lg transition font-bold cursor-pointer"
                                    >
                                      ⏱️ {activeTimer?.exIdx === exIdx && activeTimer.seconds > 0
                                        ? `${Math.floor(activeTimer.seconds / 60)}:${String(activeTimer.seconds % 60).padStart(2, '0')}`
                                        : `Descanso (${prescription?.restSeconds || 90}s)`
                                      }
                                    </button>
                                    {(() => {
                                      const live1RM = calculateEstimated1RM(
                                        parseFloat(set.loadKg),
                                        parseInt(set.reps, 10),
                                        set.rpe ? parseFloat(set.rpe) : null
                                      );
                                      return live1RM > 0 ? (
                                        <span className="text-[9px] font-mono text-indigo-300">
                                          e1RM: <strong>{live1RM}kg</strong>
                                        </span>
                                      ) : null;
                                    })()}
                                  </div>
                                </td>
                                <td className="py-2 pl-2">
                                  {ex.sets.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => removeSet(exIdx, setIdx)}
                                      className="text-rose-400 hover:text-rose-350 transition cursor-pointer"
                                      title="Remover série"
                                    >
                                      <Trash className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                              );
                            })}
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

            {/* Add Extra Exercise Section */}
            <div className="mt-4 pt-4 border-t border-slate-700/70">
              {!showExtraExerciseForm ? (
                <button
                  type="button"
                  onClick={() => setShowExtraExerciseForm(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 px-3.5 py-2 rounded-xl transition cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>+ Adicionar Exercício Extra</span>
                </button>
              ) : (
                <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Novo Exercício Extra na Sessão
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowExtraExerciseForm(false)}
                      className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label htmlFor="extra-exercise-name" className="text-[11px] text-slate-400 block mb-1">
                        Nome do Exercício *
                      </label>
                      <input
                        id="extra-exercise-name"
                        type="text"
                        value={extraExerciseName}
                        onChange={(e) => setExtraExerciseName(e.target.value)}
                        placeholder="Ex: Elevação Lateral com Halteres"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100 outline-none focus:border-indigo-400"
                      />
                    </div>
                    <div>
                      <label htmlFor="extra-movement-pattern" className="text-[11px] text-slate-400 block mb-1">
                        Padrão de Movimento
                      </label>
                      <select
                        id="extra-movement-pattern"
                        value={extraMovementPattern}
                        onChange={(e) => setExtraMovementPattern(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100 outline-none focus:border-indigo-400 cursor-pointer"
                      >
                        {[
                          'horizontal_push',
                          'vertical_push',
                          'horizontal_pull',
                          'vertical_pull',
                          'squat',
                          'hinge',
                          'lunge',
                          'biceps_curl',
                          'triceps_extension',
                          'lateral_raise',
                          'calf',
                          'core',
                        ].map((pat) => (
                          <option key={pat} value={pat}>
                            {formatMovementPattern(pat)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="extra-target-sets" className="text-[11px] text-slate-400 block mb-1">
                        Séries Iniciais
                      </label>
                      <input
                        id="extra-target-sets"
                        type="number"
                        min="1"
                        max="8"
                        value={extraTargetSets}
                        onChange={(e) => setExtraTargetSets(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100 font-mono outline-none focus:border-indigo-400"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleAddExtraExercise}
                      disabled={!extraExerciseName.trim()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Adicionar Exercício</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Submit button bar */}
          <div className="bg-slate-800 border border-slate-700/80 p-4 rounded-2xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
              <div className="flex items-center gap-2.5">
                <label htmlFor="session-rpe" className="text-xs text-slate-400 font-bold whitespace-nowrap">RPE da Sessão</label>
                <select
                  id="session-rpe"
                  value={sessionRpe}
                  onChange={(e) => setSessionRpe(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-1.5 text-xs font-semibold focus:border-indigo-400 outline-none cursor-pointer"
                >
                  <option value="">—</option>
                  <option value="10">10 (Máximo)</option>
                  <option value="9">9 (Muito duro)</option>
                  <option value="8">8 (Duro)</option>
                  <option value="7">7 (Moderado)</option>
                  <option value="6">6 (Leve)</option>
                  <option value="5">5 (Fácil)</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="session-duration" className="text-xs text-slate-400 font-bold whitespace-nowrap">
                  Duração (min)
                </label>
                <input
                  id="session-duration"
                  type="number"
                  min="5"
                  max="240"
                  step="5"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  className="w-20 bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-2.5 py-1.5 text-xs font-mono font-semibold text-center focus:border-indigo-400 outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-slate-100 font-bold px-6 py-3 rounded-xl transition duration-200 shadow-md shadow-indigo-500/10 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8"
          onClick={() => {
            if (applyingSwapTitle) return;
            setSwappingIndex(null);
            setSuggestions([]);
            setSwapError(null);
            setSwapFromCache(false);
            setSwapSource(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="swap-modal-title"
            className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-cyan-400">
                  <Sparkles className="h-5 w-5 animate-pulse" />
                  <span className="text-xs uppercase tracking-[0.2em] font-bold">Assistant Coach AI</span>
                </div>
                <h3 id="swap-modal-title" className="text-lg font-bold text-slate-100 mt-2">
                  Substituir:{' '}
                  <span className="text-indigo-300">
                    &ldquo;{exercises[swappingIndex]?.substitutedFrom || exercises[swappingIndex]?.exerciseName}&rdquo;
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {activeMesocycleObjective
                    ? `Objetivo atual: ${activeMesocycleObjective}`
                    : 'Alternativas equivalentes de mesmo padrão biomecânico e setup rápido.'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {swapFromCache && !loadingSuggestions && (
                  <button
                    type="button"
                    disabled={swapCooldownTimeLeft > 0}
                    onClick={() => handleSwapExerciseClick(swappingIndex, true)}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 px-3 py-1.5 rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    title="Solicitar novas sugestões à IA"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>{swapCooldownTimeLeft > 0 ? `Aguarde ${swapCooldownTimeLeft}s` : 'Novas opções IA'}</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={Boolean(applyingSwapTitle)}
                  aria-label="Fechar modal de substituição"
                  onClick={() => {
                    setSwappingIndex(null);
                    setSuggestions([]);
                    setSwapError(null);
                    setSwapFromCache(false);
                    setSwapSource(null);
                  }}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {swapSource === 'fallback' && !loadingSuggestions && !swapError && (
              <div className="bg-amber-500/10 border border-amber-500/30 px-3.5 py-2.5 rounded-xl flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                <p className="text-xs text-amber-200 font-medium">
                  IA externa indisponível no momento — sugestões geradas pelo catálogo biomecânico offline compatível com seus equipamentos.
                </p>
              </div>
            )}

            {swapFromCache && !loadingSuggestions && !swapError && (
              <div className="bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-2">
                <p className="text-xs text-emerald-300 font-medium">
                  ⚡ Opções salvas carregadas instantaneamente para este exercício e objetivo.
                </p>
              </div>
            )}

            {loadingSuggestions ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-3">
                <span className="h-8 w-8 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-slate-400">Analisando padrão biomecânico e setups rápidos...</span>
              </div>
            ) : swapError ? (
              <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-xl text-rose-300 text-xs space-y-2">
                <p>{swapError}</p>
                <button
                  type="button"
                  onClick={() => handleSwapExerciseClick(swappingIndex, true)}
                  className="text-xs font-bold text-cyan-300 underline cursor-pointer"
                >
                  Tentar novamente
                </button>
              </div>
            ) : (
              <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                {suggestions.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">Nenhuma sugestão de substituto encontrada.</p>
                ) : (
                  suggestions.map((sug, idx) => {
                    const usedCount = typeof sug.metadata?.selectedCount === 'number' ? sug.metadata.selectedCount : 0;
                    const isPerm = Boolean(sug.metadata?.isPermanent);
                    const isApplyingThis = applyingSwapTitle === sug.title;

                    return (
                      <div
                        key={idx}
                        className={`w-full text-left bg-slate-950/60 border ${
                          isPerm
                            ? 'border-emerald-500/50'
                            : usedCount > 0
                              ? 'border-indigo-500/40'
                              : 'border-slate-800'
                        } p-4 rounded-2xl transition space-y-3`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-slate-100">
                              {sug.title}
                            </h4>
                            <div className="flex items-center gap-1.5">
                              {isPerm && (
                                <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                                  ⭐ Substituto Fixo
                                </span>
                              )}
                              {usedCount > 0 && (
                                <span className="text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                                  ✓ Escolhido {usedCount}x
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                            {sug.reason}
                          </p>
                        </div>

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-800/80">
                          <button
                            type="button"
                            disabled={Boolean(applyingSwapTitle)}
                            onClick={() => void applyExerciseSwap(sug, 'today')}
                            className="flex-1 py-2 px-3 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-200 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                          >
                            {isApplyingThis ? 'Aplicando...' : 'Substituir só hoje'}
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(applyingSwapTitle)}
                            onClick={() => void applyExerciseSwap(sug, 'always')}
                            className="flex-1 py-2 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                            title="Atualiza a ficha deste mesociclo e avisa o Master Coach para os próximos planos"
                          >
                            <Repeat className="h-3.5 w-3.5" />
                            <span>Substituir sempre</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <span className="text-[11px] text-slate-500">
                &ldquo;Substituir sempre&rdquo; atualiza sua ficha e ensina a IA principal.
              </span>
              <button
                type="button"
                disabled={Boolean(applyingSwapTitle)}
                onClick={() => {
                  setSwappingIndex(null);
                  setSuggestions([]);
                  setSwapError(null);
                  setSwapFromCache(false);
                  setSwapSource(null);
                }}
                className="bg-slate-950 text-slate-400 border border-slate-800 hover:bg-slate-900 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ⏱️ Barra Flutuante de Cronômetro de Descanso (#6) */}
      {activeTimer && activeTimer.seconds > 0 && (
        <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[92vw] max-w-md rounded-2xl border border-cyan-500/40 bg-slate-900/95 backdrop-blur-xl px-4 py-3 shadow-2xl shadow-cyan-500/15">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">
                ⏱️ Descanso em Andamento
              </span>
              <p className="text-xs font-semibold text-slate-200 truncate">
                {activeTimer.exerciseName}
              </p>
            </div>
            <div className="text-2xl font-black font-mono text-cyan-300 shrink-0">
              {Math.floor(activeTimer.seconds / 60)}:{String(activeTimer.seconds % 60).padStart(2, '0')}
            </div>
          </div>

          <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden mt-2 mb-2.5 border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-indigo-500 transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.max(0, (activeTimer.seconds / Math.max(1, activeTimer.totalSeconds)) * 100))}%`,
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setActiveTimer((prev) =>
                    prev ? { ...prev, seconds: Math.max(5, prev.seconds - 15) } : null
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold transition cursor-pointer"
              >
                -15s
              </button>
              <button
                type="button"
                onClick={() =>
                  setActiveTimer((prev) =>
                    prev
                      ? {
                          ...prev,
                          seconds: prev.seconds + 15,
                          totalSeconds: Math.max(prev.totalSeconds, prev.seconds + 15),
                        }
                      : null
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold transition cursor-pointer"
              >
                +15s
              </button>
              <button
                type="button"
                onClick={() => setSoundEnabled((prev) => !prev)}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition cursor-pointer"
                title={soundEnabled ? 'Som ativado' : 'Som silenciado'}
              >
                {soundEnabled ? '🔊' : '🔇'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setActiveTimer(null)}
              className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 text-[11px] font-bold transition cursor-pointer"
            >
              Pular Descanso
            </button>
          </div>
        </div>
      )}

      {/* 📈 Modal de Histórico por Exercício (#31) */}
      <ExerciseHistoryModal
        exerciseName={historyExerciseName}
        onClose={() => setHistoryExerciseName(null)}
      />

      {/* 🏆 Modal de Resumo Pós-Treino (Debrief Factual) */}
      {summaryModalProps && (
        <PostWorkoutSummaryModal
          {...summaryModalProps}
          isOpen={isSummaryModalOpen}
          onClose={() => {
            setIsSummaryModalOpen(false);
            if (onSaved) onSaved();
          }}
        />
      )}
    </form>
  );
}
