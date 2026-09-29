import { KINDS, KIND_COLORS } from '../lib/kinds';

/**
 * Segmented control for the receipt kind (normal / unusual / mandatory).
 * `compact` renders a smaller variant for dense lists (bank import rows).
 */
export default function KindSelector({ value, onChange, t, compact = false }) {
  return (
    <div className={`kind-selector${compact ? ' kind-selector-compact' : ''}`} role="radiogroup">
      {KINDS.map(k => {
        const active = value === k;
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={active}
            className={`kind-option${active ? ' active' : ''}`}
            style={active ? { background: KIND_COLORS[k], borderColor: KIND_COLORS[k] } : undefined}
            onClick={() => onChange(k)}
            title={t('kindHints')[k]}
          >
            {t('kindLabels')[k]}
          </button>
        );
      })}
    </div>
  );
}
