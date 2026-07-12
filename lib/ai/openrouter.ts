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
  error?: { message?: string } | string;
}

interface GenerateStructuredOptions {
  schemaId: string;
  schema: object;
  systemPrompt: string;
  userPrompt: string;
  primaryModel: string;
  fallbackModel?: string;
  maxRetries?: number;
  temperature?: number;
  metadata?: Record<string, string>;
}

interface GenerateStructuredResult<T> {
  data: T;
  modelUsed: string;
  attempts: number;
  latencyMs: number;
  rawContent: string;
}

function safeParseJson(candidate: string): unknown {
  const trimmed = candidate.trim();

  if (trimmed.startsWith('```')) {
    const withoutFence = trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    return JSON.parse(withoutFence);
  }

  return JSON.parse(trimmed);
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
    primaryModel,
    fallbackModel,
    maxRetries = 2,
    temperature = 0.2,
  } = options;

  const tryModels = [primaryModel, fallbackModel].filter((m): m is string => Boolean(m));
  let lastError: Error | null = null;
  const start = Date.now();

  for (const model of tryModels) {
    let messages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
      try {
        const result = await callOpenRouter(messages, model, temperature);
        const rawContent = result.choices?.[0]?.message?.content?.trim();

        if (!rawContent) {
          throw new Error('Model returned empty content.');
        }

        const parsed = safeParseJson(rawContent);
        const validation = validateSchema<T>(schemaId, schema, parsed);

        if (validation.ok) {
          return {
            data: validation.data,
            modelUsed: result.model ?? model,
            attempts: attempt,
            latencyMs: Date.now() - start,
            rawContent,
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

        if (attempt > maxRetries) {
          break;
        }

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

  throw lastError ?? new Error('Structured generation failed with unknown error.');
}
