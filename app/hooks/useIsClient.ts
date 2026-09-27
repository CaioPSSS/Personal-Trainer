import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

/**
 * Returns true only when rendered on the client (after hydration).
 * Uses useSyncExternalStore to safely detect client-side rendering
 * without triggering the react-hooks/set-state-in-effect ESLint rule.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}
