'use client';

import { useEffect, useState } from 'react';

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: string, listener: () => void) => void;
}

export function useWakeLock(enabled = true) {
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('wakeLock' in navigator)) {
      return;
    }

    let sentinel: WakeLockSentinelLike | null = null;
    let isMounted = true;

    const requestLock = async () => {
      try {
        const nav = navigator as unknown as {
          wakeLock: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
        };
        sentinel = await nav.wakeLock.request('screen');
        if (isMounted) setIsLocked(true);
        sentinel.addEventListener('release', () => {
          if (isMounted) setIsLocked(false);
        });
      } catch {
        if (isMounted) setIsLocked(false);
      }
    };

    void requestLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) {
        void requestLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (sentinel && !sentinel.released) {
        void sentinel.release().catch(() => {});
      }
    };
  }, [enabled]);

  return { isLocked };
}
