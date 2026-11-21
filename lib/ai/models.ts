/**
 * Centralized OpenRouter model cascades and latency budgets for Personal Trainer AI roles.
 *
 * Defaults are calibrated using Artificial Analysis Health Intelligence rankings:
 * - Flagship monthly plan generation (Master Coach & Running Coach):
 *   1. openai/gpt-6-sol             (#1 Health Intelligence)
 *   2. openai/gpt-6.1-terra         (#2 Health Intelligence)
 *   3. deepseek/deepseek-v4.1-flash-1017 (fast #1 Health usage fallback)
 * - Quantitative cycle review (Data Analyst):
 *   1. deepseek/deepseek-v4.1-flash-1017
 *   2. anthropic/claude-haiku-5.5
 * - Low-latency tactical tasks (Assistant Coach, Weekly Review, WOD Parser):
 *   1. anthropic/claude-haiku-5.5
 *   2. deepseek/deepseek-v4.1-flash-1017
 *
 * Every cascade remains overridable via Vercel environment variables.
 */

export const MASTER_COACH_DEFAULT_CASCADE = [
  'openai/gpt-6-sol',
  'openai/gpt-6.1-terra',
  'deepseek/deepseek-v4.1-flash-1017',
] as const;

export const RUNNING_COACH_DEFAULT_CASCADE = [
  'openai/gpt-6-sol',
  'openai/gpt-6.1-terra',
  'deepseek/deepseek-v4.1-flash-1017',
] as const;

export const DATA_ANALYST_DEFAULT_CASCADE = [
  'deepseek/deepseek-v4.1-flash-1017',
  'anthropic/claude-haiku-5.5',
] as const;

export const ASSISTANT_COACH_DEFAULT_CASCADE = [
  'anthropic/claude-haiku-5.5',
  'deepseek/deepseek-v4.1-flash-1017',
] as const;

export function resolveModelCascade(
  envValue: string | undefined,
  defaults: readonly string[]
): string[] {
  const fromEnv = (envValue ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  const list = fromEnv.length > 0 ? fromEnv : [...defaults];
  return Array.from(new Set(list));
}
