'use client';

import { useEffect, useState } from 'react';

export interface Log {
  date: string;
  weight: number | null;
  caloriesConsumed: number | null;
  caloriesBurned: number | null;
  trainingType: string;
  sleepHours: number | null;
  waterIntake: number | null;
  stressLevel: number | null;
  mood: string | null;
  proteinConsumed: number | null;
  waistCircumference: number | null;
}

export interface Settings {
  currentCalorieTarget: number;
  age: number;
  height: number;
  goal: string;
  weeklyRate: number;
}

export interface SetupFormState {
  age: string;
  height: string;
  weight: string;
  gender: string;
  activityLevel: string;
  goal: string;
  weeklyRate: string;
}

export interface LogFormState {
  date: string;
  weight: string;
  caloriesConsumed: string;
  caloriesBurned: string;
  trainingType: string;
  sleepHours: string;
  waterIntake: string;
  stressLevel: string;
  mood: string;
  proteinConsumed: string;
  waistCircumference: string;
}

export function useMetabolicData(
  initialSettings: Settings | null = null,
  initialLogs: Log[] = [],
  initialInsights: string[] = [],
) {
  const [settings, setSettings] = useState<Settings | null>(initialSettings);
  const [logs, setLogs] = useState<Log[]>(initialLogs);
  const [insights, setInsights] = useState<string[]>(initialInsights);
  const [loading, setLoading] = useState(initialSettings === null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [resSetup, resLogs] = await Promise.all([
        fetch('/api/setup'),
        fetch('/api/logs'),
      ]);

      if (!resSetup.ok || !resLogs.ok) {
        throw new Error('Falha ao carregar os dados.');
      }

      const setupData = await resSetup.json();
      const dataLogs = await resLogs.json();

      setSettings(setupData);
      setLogs(dataLogs.logs || []);
      setInsights(dataLogs.insights || []);
      setError(null);
    } catch (cause) {
      console.error(cause);
      setError('Erro ao sincronizar os dados.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialSettings === null) {
      const fetchData = async () => {
        await refresh();
      };

      void fetchData();
    }
  }, [initialSettings]);

  async function addLog(logForm: LogFormState) {
    const optimisticLog: Log = {
      date: logForm.date,
      weight: logForm.weight ? Number(logForm.weight) : null,
      caloriesConsumed: logForm.caloriesConsumed ? Number(logForm.caloriesConsumed) : null,
      caloriesBurned: logForm.caloriesBurned ? Number(logForm.caloriesBurned) : null,
      trainingType: logForm.trainingType,
      sleepHours: logForm.sleepHours ? Number(logForm.sleepHours) : null,
      waterIntake: logForm.waterIntake ? Number(logForm.waterIntake) : null,
      stressLevel: logForm.stressLevel ? Number(logForm.stressLevel) : null,
      mood: logForm.mood || null,
      proteinConsumed: logForm.proteinConsumed ? Number(logForm.proteinConsumed) : null,
      waistCircumference: logForm.waistCircumference ? Number(logForm.waistCircumference) : null,
    };

    const backupLogs = logs;
    setLogs((currentLogs) => {
      const filteredLogs = currentLogs.filter((entry) => entry.date !== optimisticLog.date);
      return [optimisticLog, ...filteredLogs];
    });

    try {
      const response = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logForm),
      });

      if (!response.ok) {
        throw new Error('Falha ao salvar o registro.');
      }

      await refresh();
    } catch (cause) {
      console.error(cause);
      setLogs(backupLogs);
      throw cause;
    }
  }

  return {
    settings,
    logs,
    insights,
    loading,
    error,
    refresh,
    setError,
    addLog,
  };
}
