export function ClueProgress({ completed, clues }: { completed: number; clues: number }) {
  return (
    <div className="clue-progress" aria-label={`已完成 ${completed}/9，线索 ${clues}/9`}>
      <span>会面记录 <b>{completed}/9</b></span>
      <span>遗嘱证据 <b>{clues}/9</b></span>
    </div>
  )
}

