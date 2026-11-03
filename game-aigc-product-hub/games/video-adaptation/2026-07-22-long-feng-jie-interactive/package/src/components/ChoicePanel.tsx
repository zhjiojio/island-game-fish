import type { EvaluatedChoice } from '../story/types'

interface ChoicePanelProps {
  choices: EvaluatedChoice[]
  onSelect: (choice: EvaluatedChoice) => void
}

export function ChoicePanel({ choices, onSelect }: ChoicePanelProps) {
  return (
    <section className="decision-sheet" aria-labelledby="decision-title">
      <div className="decision-sheet__eyebrow">
        <span>命运岔路</span>
        <i aria-hidden="true" />
      </div>
      <h2 id="decision-title">此刻，由你决定</h2>
      <div className="choice-list">
        {choices.map((choice, index) => (
          <div className="choice-wrap" key={choice.id}>
            <button
              className="choice-card"
              type="button"
              disabled={choice.blocked}
              onClick={() => onSelect(choice)}
            >
              <span className="choice-card__index">{String(index + 1).padStart(2, '0')}</span>
              <span className="choice-card__copy">
                <strong>{choice.label}</strong>
                <small>{choice.hint}</small>
              </span>
              <span className="choice-card__arrow" aria-hidden="true">→</span>
            </button>
            {choice.blocked && choice.blockedHint ? (
              <p className="blocked-hint">{choice.blockedHint}</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}
