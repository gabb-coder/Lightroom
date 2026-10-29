import { useState, type KeyboardEvent } from 'react';
import { formatSliderValue, isDefaultValue, parseSliderValue, type SliderDef } from '../model/sliders';
import styles from './SliderRow.module.css';

interface ValueFieldProps {
  def: SliderDef;
  value: number;
  disabled: boolean;
  onCommit: (value: number) => void;
}

/**
 * A slider's value text. Click it to type an exact number: Enter (or leaving
 * the field) commits, Escape cancels. Invalid text is ignored.
 */
export function ValueField({ def, value, disabled, onCommit }: ValueFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = formatSliderValue(def, value);
  const edited = !isDefaultValue(def, value);

  const commit = () => {
    if (draft === null) return;
    const parsed = parseSliderValue(def, draft);
    setDraft(null);
    if (parsed !== null) onCommit(parsed);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') setDraft(null);
  };

  if (draft !== null) {
    return (
      <input
        className={`num ${styles.valueInput}`}
        type="text"
        inputMode="decimal"
        aria-label={`${def.ariaLabel ?? def.label} value`}
        value={draft}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
      />
    );
  }

  return (
    <button
      type="button"
      className={`num ${styles.value}`}
      data-edited={edited}
      disabled={disabled}
      aria-label={`${def.ariaLabel ?? def.label} value ${text}, click to type`}
      data-testid={`value-${def.id}`}
      onClick={() => setDraft(text)}
    >
      {text}
    </button>
  );
}
