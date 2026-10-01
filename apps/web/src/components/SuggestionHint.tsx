import type { ReactNode } from 'react';

/** Props for `SuggestionHint`. */
export interface SuggestionHintProps {
  /** The suggested value, formatted for display. */
  children: ReactNode;
  /** Called when the user applies the suggestion to the field. */
  onApply: () => void;
  /** Called when the user rejects the suggestion. */
  onDismiss: () => void;
}

/** Shows one suggested field value with Apply and Dismiss actions. */
export function SuggestionHint({ children, onApply, onDismiss }: SuggestionHintProps) {
  return (
    <div className="suggestion">
      <span className="hint">Suggested</span>
      <div className="value">{children}</div>
      <div className="actions">
        <button type="button" className="btn primary small" onClick={onApply}>
          Apply
        </button>
        <button type="button" className="btn small" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
