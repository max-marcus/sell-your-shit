import type { z } from 'zod';

/**
 * Page-specific behavior for an AI assist chat. The generic route and service
 * know nothing about any page; a profile supplies everything they need.
 *
 * @typeParam C Context the page sends with each message.
 * @typeParam S Suggestions the model returns for the page to apply.
 */
export interface AssistProfile<C, S> {
  /** URL name, as in `POST /api/assist/<name>`. Use lowercase kebab-case. */
  name: string;
  /** Validates the `context` field of each request. */
  contextSchema: z.ZodType<C>;
  /** Shape of `suggestions` in each response. Use `.nullable()`, not `.optional()`. */
  suggestionsSchema: z.ZodType<S>;
  /** Builds the system prompt from the validated context. */
  buildSystemPrompt(context: C): string;
  /** Optional. Enforces rules on the model's suggestions that a prompt cannot guarantee. */
  normalizeSuggestions?(suggestions: S): S;
}

/** Any registered profile, with its context and suggestion types erased. */
export type AnyAssistProfile = AssistProfile<unknown, unknown>;
