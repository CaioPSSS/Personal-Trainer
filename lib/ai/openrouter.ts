import { formatAjvErrors, validateSchema } from '@/lib/ai/validation';

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterChoice {
  message?: { content?: string; reasoning?: string };
  finish_reason?: string;
}

interface OpenRouterResponse {
  id?: string;
  model?: string;
  choices?: OpenRouterChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string; code?: number } | string;
}

export type ReasoningEffortLevel = 'low' | 'medium' | 'high';

export interface GenerateStructuredOptions<T = unknown> {
  schemaId: string;
  schema: object;
  systemPrompt: string;
  userPrompt: string;
  modelCascade?: string[];
  primaryModel?: string;
  fallbackModel?: string;
  /** Number of schema/parse repair retries on the same model (default: 1). */
  maxRetries?: number;
  temperature?: number;
  /** Optional OpenRouter reasoning effort hint (`low` | `medium` | `high`). */
  reasoningEffort?: ReasoningEffortLevel;
  /** Max output tokens for the response (prevents runaway reasoning/truncation). */
  maxTokens?: number;
  /** Default timeout in ms per model call (overridden by `perModelTimeoutsMs` if provided). */
  timeoutMs?: number;
  /** Optional per-cascade-position timeout array in ms (e.g. [180_000, 65_000, 30_000]). */
  perModelTimeoutsMs?: number[];
  /** Total wall-clock budget in ms across all models to stay safely under Vercel maxDuration. */
  totalBudgetMs?: number;
  /** Whether to send `response_format: { type: 'json_object' }` (auto-falls back if provider rejects 400). */
  useJsonResponseFormat?: boolean;
  /** Optional semantic validation errors returned after JSON Schema passes. */
  semanticValidator?: (data: T) => string[];
  metadata?: Record<string, string>;
}

export interface GenerateStructuredResult<T> {
  data: T;
  modelUsed: string;
  attempts: number;
  latencyMs: number;
  rawContent: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

class OpenRouterRequestError extends Error {
  status?: number;
  isTimeout: boolean;
  shouldSkipModel: boolean;

  constructor(
    message: string,
    opts?: { status?: number; isTimeout?: boolean; shouldSkipModel?: boolean }
  ) {
    super(message);
    this.name = 'OpenRouterRequestError';
    this.status = opts?.status;
    this.isTimeout = Boolean(opts?.isTimeout);
    this.shouldSkipModel = Boolean(opts?.shouldSkipModel);
  }
}

function fixMojibake(text: string): string {
  return text
    .replace(/Ã¡/g, 'á')
    .replace(/Ã§/g, 'ç')
    .replace(/Ã£/g, 'ã')
    .replace(/Ã©/g, 'é')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã\s/g, 'à');
}

function parseJsonFromMarkdown(candidate: string): unknown {
  const sanitized = fixMojibake(candidate.trim());

  // 1. Tenta extrair bloco fenced ```json ... ```
  const jsonBlockMatch = sanitized.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonBlockMatch?.[1]) {
    return JSON.parse(jsonBlockMatch[1].trim());
  }

  // 2. Tenta encontrar delimitadores de objeto ou array JSON ({ ... } ou [ ... ])
  const firstBrace = sanitized.indexOf('{');
  const lastBrace = sanitized.lastIndexOf('}');
  const firstBracket = sanitized.indexOf('[');
  const lastBracket = sanitized.lastIndexOf(']');

  let jsonCandidate = sanitized;

  if (firstBrace !== -1 && lastBrace > firstBrace && (firstBracket === -1 || firstBrace < firstBracket)) {
    jsonCandidate = sanitized.substring(firstBrace, lastBrace + 1);
  } else if (firstBracket !== -1 && lastBracket > firstBracket) {
    jsonCandidate = sanitized.substring(firstBracket, lastBracket + 1);
  }

  return JSON.parse(jsonCandidate);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOpenRouter(params: {
  messages: OpenRouterMessage[];
  model: string;
  temperature: number;
  timeoutMs: number;
  reasoningEffort?: ReasoningEffortLevel;
  maxTokens?: number;
  useJsonResponseFormat: boolean;
}): Promise<OpenRouterResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterRequestError('Missing OPENROUTER_API_KEY', { shouldSkipModel: true });
  }

  const executeFetch = async (
    includeResponseFormat: boolean,
    includeReasoningEffort: boolean,
    overrideEffort?: ReasoningEffortLevel,
    overrideMaxTokens?: number
  ): Promise<Response> => {
    const payload: Record<string, unknown> = {
      model: params.model,
      temperature: params.temperature,
      messages: params.messages,
    };

    const effectiveMaxTokens = overrideMaxTokens ?? params.maxTokens;
    const effectiveEffort = overrideEffort ?? params.reasoningEffort;

    if (effectiveMaxTokens && effectiveMaxTokens > 0) {
      payload.max_tokens = effectiveMaxTokens;
    }
    if (includeResponseFormat) {
      payload.response_format = { type: 'json_object' };
    }
    if (includeReasoningEffort && effectiveEffort) {
      payload.reasoning = { effort: effectiveEffort };
    }

    try {
      return await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.OPENROUTER_REFERER ?? 'https://personal-trainer.local',
          'X-Title': process.env.OPENROUTER_APP_TITLE ?? 'Personal Trainer AI',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(Math.max(5_000, params.timeoutMs)),
      });
    } catch (err) {
      const errName = err instanceof Error ? err.name : '';
      const isTimeout = errName === 'TimeoutError' || errName === 'AbortError';
      throw new OpenRouterRequestError(
        isTimeout
          ? `Model ${params.model} timed out after ${Math.round(params.timeoutMs / 1000)}s`
          : `Network error calling ${params.model}: ${err instanceof Error ? err.message : String(err)}`,
        { isTimeout, shouldSkipModel: true }
      );
    }
  };

  let usedResponseFormat = params.useJsonResponseFormat;
  let usedReasoningEffort = Boolean(params.reasoningEffort);
  let response = await executeFetch(usedResponseFormat, usedReasoningEffort);

  // If provider rejects optional response_format or reasoning parameters with HTTP 400, retry cleanly without them
  if (response.status === 400 && (usedResponseFormat || usedReasoningEffort)) {
    const errText = await response.text().catch(() => '');
    const lower = errText.toLowerCase();
    const isParamRejection =
      lower.includes('response_format') ||
      lower.includes('reasoning') ||
      lower.includes('effort') ||
      lower.includes('unsupported');

    if (isParamRejection) {
      usedResponseFormat = false;
      usedReasoningEffort = false;
      response = await executeFetch(false, false);
    } else {
      throw new OpenRouterRequestError(
        `OpenRouter request failed (400) for ${params.model}: ${errText}`,
        { status: 400, shouldSkipModel: true }
      );
    }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    // Skip broken/unavailable/rate-limited/5xx models immediately so cascade falls back fast
    throw new OpenRouterRequestError(
      `OpenRouter request failed (${response.status}) for ${params.model}: ${text}`,
      { status: response.status, shouldSkipModel: true }
    );
  }

  let parsed = (await response.json()) as OpenRouterResponse;
  if (parsed.error) {
    const message = typeof parsed.error === 'string' ? parsed.error : parsed.error.message;
    throw new OpenRouterRequestError(
      `OpenRouter response error for ${params.model}: ${message ?? 'unknown error'}`,
      { shouldSkipModel: true }
    );
  }

  // If reasoning tokens consumed the entire max_tokens budget before emitting JSON content,
  // retry once with lower reasoning effort and an expanded max_tokens ceiling.
  const firstChoice = parsed.choices?.[0];
  const emptyContentDueToLength =
    !firstChoice?.message?.content?.trim() && firstChoice?.finish_reason === 'length';

  if (emptyContentDueToLength) {
    const expandedMaxTokens = Math.min(32_000, Math.max(12_000, (params.maxTokens ?? 8_000) * 2));
    console.warn(
      `[OpenRouter] ${params.model} hit finish_reason=length with empty content; retrying once with effort=low and max_tokens=${expandedMaxTokens}.`
    );
    const retryResponse = await executeFetch(
      usedResponseFormat,
      usedReasoningEffort,
      'low',
      expandedMaxTokens
    );
    if (retryResponse.ok) {
      const retryParsed = (await retryResponse.json()) as OpenRouterResponse;
      if (!retryParsed.error) {
        parsed = retryParsed;
      }
    }
  }

  return parsed;
}

export async function generateStructuredOutput<T>(
  options: GenerateStructuredOptions<T>
): Promise<GenerateStructuredResult<T>> {
  const {
    schemaId,
    schema,
    systemPrompt,
    userPrompt,
    modelCascade,
    primaryModel,
    fallbackModel,
    maxRetries = 1,
    temperature = 0.2,
    reasoningEffort,
    maxTokens,
    timeoutMs = 90_000,
    perModelTimeoutsMs,
    totalBudgetMs = 265_000,
    useJsonResponseFormat = true,
    semanticValidator,
  } = options;

  // Constrói a lista de modelos a tentar em cascata
  const tryModels = (
    modelCascade && modelCascade.length > 0
      ? modelCascade
      : [primaryModel, fallbackModel]
  ).filter((m): m is string => Boolean(m));

  if (tryModels.length === 0) {
    throw new Error('No models specified for structured generation.');
  }

  let lastError: Error | null = null;
  const start = Date.now();
  let totalAttemptsCount = 0;

  for (let modelIdx = 0; modelIdx < tryModels.length; modelIdx += 1) {
    const model = tryModels[modelIdx];
    const elapsed = Date.now() - start;
    const remainingBudget = totalBudgetMs - elapsed;

    if (remainingBudget < 8_000) {
      break;
    }

    const configuredModelTimeout =
      perModelTimeoutsMs?.[modelIdx] ??
      perModelTimeoutsMs?.[perModelTimeoutsMs.length - 1] ??
      timeoutMs;

    let messages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `${userPrompt}\n\n--- JSON SCHEMA CONTRACT ---\nYou MUST return ONLY a valid JSON object that strictly adheres to the following JSON Schema. Do NOT wrap it in markdown block quotes. Do NOT add any extra text:\n${JSON.stringify(schema, null, 2)}`,
      },
    ];

    for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
      const currentRemaining = totalBudgetMs - (Date.now() - start);
      if (currentRemaining < 6_000) {
        break;
      }

      // Reserve enough time for subsequent models on the first attempt if multiple models remain
      const effectiveTimeoutMs = Math.min(configuredModelTimeout, currentRemaining - 1_500);
      totalAttemptsCount += 1;

      try {
        const result = await callOpenRouter({
          messages,
          model,
          temperature,
          timeoutMs: effectiveTimeoutMs,
          reasoningEffort,
          maxTokens,
          useJsonResponseFormat,
        });

        const rawContent = result.choices?.[0]?.message?.content?.trim();

        if (!rawContent) {
          throw new OpenRouterRequestError(
            `Model ${model} returned empty content (finish_reason: ${result.choices?.[0]?.finish_reason ?? 'unknown'}).`,
            { shouldSkipModel: true }
          );
        }

        const parsed = parseJsonFromMarkdown(rawContent);
        const validation = validateSchema<T>(schemaId, schema, parsed);

        if (validation.ok) {
          const semanticErrors = semanticValidator ? semanticValidator(validation.data) : [];
          if (semanticErrors.length === 0) {
            return {
              data: validation.data,
              modelUsed: result.model ?? model,
              attempts: totalAttemptsCount,
              latencyMs: Date.now() - start,
              rawContent,
              usage: result.usage
                ? {
                    promptTokens: result.usage.prompt_tokens ?? 0,
                    completionTokens: result.usage.completion_tokens ?? 0,
                    totalTokens: result.usage.total_tokens ?? 0,
                  }
                : undefined,
            };
          }

          // Semantic validation failure -> ask same model to repair JSON
          const semanticErrorText = semanticErrors.join('; ');
          lastError = new Error(`Semantic validation failed (${model}): ${semanticErrorText}`);
          if (attempt <= maxRetries) {
            messages = [
              ...messages,
              { role: 'assistant', content: rawContent },
              {
                role: 'user',
                content: `Your JSON matched the syntax schema but failed domain rules: ${semanticErrorText}. Return ONLY the corrected JSON object.`,
              },
            ];
            continue;
          }
          break;
        }

        const errorText = formatAjvErrors(validation.errors);
        lastError = new Error(`Schema validation failed (${model}): ${errorText}`);
        if (attempt <= maxRetries) {
          messages = [
            ...messages,
            { role: 'assistant', content: rawContent },
            {
              role: 'user',
              content: `Your previous response failed schema validation: ${errorText}. Return only a corrected JSON object that strictly follows the schema.`,
            },
          ];
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Fail fast to next cascade model on timeouts, HTTP errors, or empty reasoning stalls
        if (error instanceof OpenRouterRequestError && error.shouldSkipModel) {
          console.warn(`[OpenRouter] Skipping ${model} -> falling back: ${error.message}`);
          break;
        }

        // JSON syntax parse error: allow repair retry on same model
        if (attempt <= maxRetries) {
          const backoffMs = 200 * attempt;
          await sleep(backoffMs);
          messages = [
            ...messages,
            {
              role: 'user',
              content: `Your previous output could not be parsed as valid JSON (${lastError.message}). Return ONLY raw valid JSON matching the schema with no markdown or extra text.`,
            },
          ];
        }
      }
    }
  }

  throw lastError ?? new Error('Structured generation failed across all cascade models.');
}
