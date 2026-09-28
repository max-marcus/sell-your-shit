import type { z } from 'zod';

/** One message sent to an LLM. */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Minimal LLM contract that business logic depends on. Implementations must
 * return data that the given schema has validated, or throw `LlmError`.
 */
export interface LlmClient {
  /**
   * Sends the messages and returns a structured response.
   * @param schemaName Short snake_case name for the response format.
   */
  complete<T>(messages: LlmMessage[], schema: z.ZodType<T>, schemaName: string): Promise<T>;
}

/** The LLM call failed, refused, or returned data that does not match the schema. */
export class LlmError extends Error {
  override name = 'LlmError';
}
