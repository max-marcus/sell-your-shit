import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { MAX_ASSIST_MESSAGE_LENGTH } from '@sell/core';
import { useAssistChat } from '../hooks/useAssistChat';

/** Props for `AssistChat`. */
export interface AssistChatProps<S> {
  /** Server assist profile name, as in `POST /api/assist/<profile>`. */
  profile: string;
  /** Returns the current page context, sent with each message. */
  getContext: () => unknown;
  /** Called with the suggestions from each reply. */
  onSuggestions: (suggestions: S) => void;
  /** Panel heading. */
  title?: string;
  /** Text shown before the first message. */
  intro?: string;
  /** Placeholder for the message input. */
  placeholder?: string;
}

/**
 * Reusable AI assist chat panel. It renders the conversation and the input box.
 * The page decides what to do with suggestions through `onSuggestions`.
 */
export function AssistChat<S>({
  profile,
  getContext,
  onSuggestions,
  title = 'AI assist',
  intro,
  placeholder = 'Type a message…',
}: AssistChatProps<S>) {
  const chat = useAssistChat<S>(profile);
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [chat.messages, chat.pending]);

  async function submit() {
    const text = draft.trim();
    if (!text || chat.pending) return;
    setDraft('');
    const suggestions = await chat.send(text, getContext());
    if (suggestions === null) {
      setDraft(text);
      return;
    }
    onSuggestions(suggestions);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="panel assist-chat">
      <div className="assist-bar">
        <h2>{title}</h2>
        {chat.messages.length > 0 && (
          <button className="btn small" onClick={chat.reset} disabled={chat.pending}>
            Start over
          </button>
        )}
      </div>

      {chat.configured === false ? (
        <div className="banner warn">
          AI assist is not configured. Set <code>OPENROUTER_API_KEY</code> in <code>.env</code> and
          restart the server.
        </div>
      ) : (
        <>
          <div className="assist-log" ref={logRef}>
            {chat.messages.length === 0 && intro && <p className="hint">{intro}</p>}
            {chat.messages.map((m, i) => (
              <div key={i} className={`assist-msg ${m.role}`}>
                {m.content}
              </div>
            ))}
            {chat.pending && (
              <div className="assist-msg assistant">
                <span className="spinner" /> Thinking…
              </div>
            )}
          </div>
          <textarea
            className="assist-input"
            value={draft}
            maxLength={MAX_ASSIST_MESSAGE_LENGTH}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={chat.configured === null}
          />
          <div className="assist-bar">
            <span className="hint">Enter to send · Shift+Enter for a new line</span>
            <button
              className="btn primary small"
              onClick={() => void submit()}
              disabled={chat.pending || !draft.trim() || chat.configured === null}
            >
              Send
            </button>
          </div>
          {chat.error && <p className="error-text">{chat.error}</p>}
        </>
      )}
    </div>
  );
}
