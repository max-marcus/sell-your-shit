import { useEffect, useState } from 'react';
import { MAX_ASSIST_MESSAGES, type ChatMessage } from '@sell/core';
import { api } from '../api';

/** State and actions of one AI assist chat. */
export interface AssistChatState<S> {
  /** The full conversation shown to the user, oldest first. */
  messages: ChatMessage[];
  /** True while a reply is in progress. */
  pending: boolean;
  /** Message of the last failed request, or null. */
  error: string | null;
  /** Whether the server has AI assist configured. Null until known. */
  configured: boolean | null;
  /**
   * Sends a user message with the current page context.
   * Resolves to the suggestions, or null when the request fails. On failure
   * the message is removed from the list, so the user can send it again.
   */
  send(text: string, context: unknown): Promise<S | null>;
  /** Clears the conversation. */
  reset(): void;
}

/**
 * Returns the newest messages that fit in one request, starting with a user
 * message. The page context carries the facts from older turns.
 */
function recentHistory(messages: ChatMessage[]): ChatMessage[] {
  const recent = messages.slice(-MAX_ASSIST_MESSAGES);
  const firstUser = recent.findIndex((m) => m.role === 'user');
  return firstUser > 0 ? recent.slice(firstUser) : recent;
}

/**
 * Owns the message list, loading state, errors, and API calls for an AI assist
 * chat. It knows nothing about any page; the profile decides the behavior.
 */
export function useAssistChat<S>(profile: string): AssistChatState<S> {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getAssistStatus()
      .then((s) => active && setConfigured(s.configured))
      .catch(() => active && setConfigured(false));
    return () => {
      active = false;
    };
  }, []);

  async function send(text: string, context: unknown): Promise<S | null> {
    const content = text.trim();
    if (!content) return null;
    const previous = messages;
    const next: ChatMessage[] = [...previous, { role: 'user', content }];
    setMessages(next);
    setPending(true);
    setError(null);
    try {
      const res = await api.assist<S>(profile, recentHistory(next), context);
      setMessages([...next, { role: 'assistant', content: res.reply }]);
      return res.suggestions;
    } catch (err) {
      setMessages(previous);
      setError((err as Error).message);
      return null;
    } finally {
      setPending(false);
    }
  }

  function reset() {
    setMessages([]);
    setError(null);
  }

  return { messages, pending, error, configured, send, reset };
}
