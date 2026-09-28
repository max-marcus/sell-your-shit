import { z } from 'zod';

/**
 * Generic contract for AI assist chats. It works for any page. Each assist
 * profile adds its own context and suggestions schemas.
 */

/** One turn in an assist chat. The server keeps no chat state. */
export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4000),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

/**
 * Body of `POST /api/assist/:profile`. The profile name is in the URL.
 * The profile's own context schema validates `context`.
 */
export const assistRequestSchema = z.object({
  messages: z
    .array(chatMessageSchema)
    .min(1)
    .max(40)
    .refine((m) => m[m.length - 1]?.role === 'user', 'The last message must be from the user'),
  context: z.unknown(),
});
export type AssistRequest = z.infer<typeof assistRequestSchema>;

/** Response of `POST /api/assist/:profile`. Each profile defines `T`. */
export interface AssistResponse<T> {
  /** Plain-text reply to show in the chat. */
  reply: string;
  /** Field values the user can apply. */
  suggestions: T;
}

/** Response of `GET /api/assist/status`. */
export interface AssistStatusResponse {
  /** True when the server has an LLM API key. */
  configured: boolean;
}
