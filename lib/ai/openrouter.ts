import { formatAjvErrors, validateSchema } from '@/lib/ai/validation';

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterChoice {
  message?: { content?: string };
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
  error?: { message?: string } | string;
}

export interface GenerateStructuredOptions {
  schemaId: string;
  schema: object;
  systemPrompt: string;
  userPrompt: string;
  modelCascade?: string[];
  primaryModel?: string;
  fallbackModel?: string;
  maxRetries?: number;
  temperature?: number;
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

async function callOpenRouter(messages: OpenRouterMessage[], model: string, temperature: number): Promise<OpenRouterResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENROUTER_API_KEY');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_REFERER ?? 'https://personal-trainer.local',
      'X-Title': process.env.OPENROUTER_APP_TITLE ?? 'Personal Trainer AI',
    },
    body: JSON.stringify({
      model,
      temperature,
      messages,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter request failed (${response.status}): ${text}`);
  }

  const parsed = (await response.json()) as OpenRouterResponse;
  if (parsed.error) {
    const message = typeof parsed.error === 'string' ? parsed.error : parsed.error.message;
    throw new Error(`OpenRouter response error: ${message ?? 'unknown error'}`);
  }

  return parsed;
}

export async function generateStructuredOutput<T>(options: GenerateStructuredOptions): Promise<GenerateStructuredResult<T>> {
  const {
    schemaId,
    schema,
    systemPrompt,
    userPrompt,
    modelCascade,
    primaryModel,
    fallbackModel,
    maxRetries = 2,
    temperature = 0.2,
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

  for (const model of tryModels) {
    let messages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      { 
        role: 'user', 
        content: `${userPrompt}\n\n--- JSON SCHEMA CONTRACT ---\nYou MUST return ONLY a valid JSON object that strictly adheres to the following JSON Schema. Do NOT wrap it in markdown block quotes. Do NOT add any extra text:\n${JSON.stringify(schema, null, 2)}` 
      },
    ];

    for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
      totalAttemptsCount += 1;
      try {
        const result = await callOpenRouter(messages, model, temperature);
        const rawContent = result.choices?.[0]?.message?.content?.trim();

        if (!rawContent) {
          throw new Error(`Model ${model} returned empty content.`);
        }

        const parsed = parseJsonFromMarkdown(rawContent);
        const validation = validateSchema<T>(schemaId, schema, parsed);

        if (validation.ok) {
          return {
            data: validation.data,
            modelUsed: result.model ?? model,
            attempts: totalAttemptsCount,
            latencyMs: Date.now() - start,
            rawContent,
            usage: result.usage ? {
              promptTokens: result.usage.prompt_tokens ?? 0,
              completionTokens: result.usage.completion_tokens ?? 0,
              totalTokens: result.usage.total_tokens ?? 0,
            } : undefined,
          };
        }

        const errorText = formatAjvErrors(validation.errors);
        messages = [
          ...messages,
          {
            role: 'assistant',
            content: rawContent,
          },
          {
            role: 'user',
            content: `Your previous response failed schema validation: ${errorText}. Return only a corrected JSON object that strictly follows the schema.`,
          },
        ];
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt <= maxRetries) {
          // Exponential Backoff: 150ms * 2^(attempt-1) (150ms, 300ms, 600ms...)
          const backoffMs = 150 * Math.pow(2, attempt - 1);
          await sleep(backoffMs);

          messages = [
            ...messages,
            {
              role: 'user',
              content: `Previous attempt failed due to runtime error (${lastError.message}). Return only valid JSON matching the schema.`,
            },
          ];
        }
      }
    }
  }

  throw lastError ?? new Error('Structured generation failed across all cascade models.');
}
