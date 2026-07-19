'use client';

import { useCallback, useEffect, useRef } from 'react';

interface DraftEntry<T> {
  data: T;
  savedAt: number;
}

const EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Persists form state in localStorage automatically.
 * - Saves automatically whenever state updates (debounced)
 * - Restores on mount if a valid draft exists (< 24 hours old)
 * - Clears draft upon successful submission
 */
export function useFormDraft<T>(key: string) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getStorageKey = useCallback(
    (dateKey?: string) => (dateKey ? `${key}:${dateKey}` : key),
    [key],
  );

  const saveDraft = useCallback(
    (data: T, dateKey?: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        try {
          const entry: DraftEntry<T> = { data, savedAt: Date.now() };
          localStorage.setItem(getStorageKey(dateKey), JSON.stringify(entry));
        } catch (error) {
          console.warn('LocalStorage draft save failed', error);
        }
      }, 500);
    },
    [getStorageKey],
  );

  const loadDraft = useCallback(
    (dateKey?: string): T | null => {
      try {
        const raw = localStorage.getItem(getStorageKey(dateKey));
        if (!raw) return null;
        const entry: DraftEntry<T> = JSON.parse(raw);
        if (Date.now() - entry.savedAt > EXPIRATION_MS) {
          localStorage.removeItem(getStorageKey(dateKey));
          return null;
        }
        return entry.data;
      } catch {
        return null;
      }
    },
    [getStorageKey],
  );

  const clearDraft = useCallback(
    (dateKey?: string) => {
      try {
        localStorage.removeItem(getStorageKey(dateKey));
      } catch {
        // ignore
      }
    },
    [getStorageKey],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { saveDraft, loadDraft, clearDraft };
}
