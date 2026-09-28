import { z } from 'zod';
import type { AssistResponse, ChatMessage } from '@sell/core';
import type { LlmClient } from '../llm/types';
import type { AnyAssistProfile } from './types';

/**
 * Runs one assist chat turn: builds the prompt from the profile, calls the LLM,
 * and returns the validated reply and suggestions.
 *
 * @param context Context that the profile's `contextSchema` has already validated.
 * @throws LlmError when the LLM call fails or returns invalid data.
 */
export async function runAssistTurn(
  llm: LlmClient,
  profile: AnyAssistProfile,
  messages: ChatMessage[],
  context: unknown,
): Promise<AssistResponse<unknown>> {
  const responseSchema = z.object({
    reply: z.string(),
    suggestions: profile.suggestionsSchema,
  });
  const result = await llm.complete(
    [{ role: 'system', content: profile.buildSystemPrompt(context) }, ...messages],
    responseSchema,
    `${profile.name.replace(/\W/g, '_')}_assist`,
  );
  const suggestions = profile.normalizeSuggestions?.(result.suggestions) ?? result.suggestions;
  return { reply: result.reply, suggestions };
}
