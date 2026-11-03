import type { StoryChoice } from '../story/types'

export function ChoicePanel({ choices, onChoose }: { choices: StoryChoice[]; onChoose: (choice: StoryChoice) => void }) {
  return (
    <section className="choice-panel" aria-label="选择回应">
      <p>你的回应会被记入关系与遗嘱调查。</p>
      {choices.map((choice, index) => (
        <button key={choice.id} onClick={() => onChoose(choice)}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <strong>{choice.label}</strong>
        </button>
      ))}
    </section>
  )
}

