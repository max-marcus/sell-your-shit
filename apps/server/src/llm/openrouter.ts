import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { z } from 'zod';
import { LlmError, type LlmClient, type LlmMessage } from './types';

const MODEL = 'openai/gpt-oss-120b';
/** OpenRouter-only fields. Spread into the request; the SDK sends them in the body as-is. */
const EXTRA_BODY = { provider: { order: ['cerebras'] } };
/** Per-attempt limit. Normal replies take about 1 second; the SDK default is 10 minutes. */
const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 1;

/**
 * Creates an `LlmClient` that calls `gpt-oss-120b` through OpenRouter, with
 * Cerebras as the inference provider and strict Structured Outputs.
 */
export function createOpenRouterClient(apiKey: string): LlmClient {
  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    timeout: TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
  });

  return {
    async complete<T>(messages: LlmMessage[], schema: z.ZodType<T>, schemaName: string): Promise<T> {
      let message;
      try {
        const response = await client.chat.completions.parse({
          model: MODEL,
          messages,
          response_format: zodResponseFormat(schema, schemaName),
          reasoning_effort: 'medium',
          ...EXTRA_BODY,
        });
        message = response.choices[0]?.message;
      } catch (err) {
        throw new LlmError(`LLM request failed: ${(err as Error).message}`);
      }

      if (message?.refusal) throw new LlmError(`The model refused: ${message.refusal}`);
      const result = schema.safeParse(message?.parsed);
      if (!result.success) throw new LlmError('The model returned a response in an unexpected format.');
      return result.data;
    },
  };
}

/** Returns an OpenRouter client when `OPENROUTER_API_KEY` is set, otherwise null. */
export function createLlmClientFromEnv(): LlmClient | null {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  return apiKey ? createOpenRouterClient(apiKey) : null;
}
