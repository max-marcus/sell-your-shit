import { z } from 'zod';
import { chatMessageSchema, type AssistResponse, type ChatMessage } from '@sell/core';
import { LlmError, type LlmClient } from '../llm/types';
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
  // The client sends the reply back as chat history, so it must pass the request schema.
  const reply = chatMessageSchema.shape.content.safeParse(result.reply);
  if (!reply.success) throw new LlmError('The model returned an empty or too-long reply.');
  const suggestions = profile.normalizeSuggestions?.(result.suggestions) ?? result.suggestions;
  return { reply: reply.data, suggestions };
}
