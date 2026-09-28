import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@sell/core';
import { api } from '../api';

/** State and actions of one AI assist chat. */
export interface AssistChatState<S> {
  messages: ChatMessage[];
  /** True while a reply is in progress. */
  pending: boolean;
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
 * Owns the message list, loading state, errors, and API calls for an AI assist
 * chat. It knows nothing about any page; the profile decides the behavior.
 */
export function useAssistChat<S>(profile: string): AssistChatState<S> {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

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

  const send = useCallback(
    async (text: string, context: unknown): Promise<S | null> => {
      const content = text.trim();
      if (!content) return null;
      const previous = messagesRef.current;
      const next: ChatMessage[] = [...previous, { role: 'user', content }];
      setMessages(next);
      setPending(true);
      setError(null);
      try {
        const res = await api.assist<S>(profile, next, context);
        setMessages([...next, { role: 'assistant', content: res.reply }]);
        return res.suggestions;
      } catch (err) {
        setMessages(previous);
        setError((err as Error).message);
        return null;
      } finally {
        setPending(false);
      }
    },
    [profile],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, pending, error, configured, send, reset };
}
