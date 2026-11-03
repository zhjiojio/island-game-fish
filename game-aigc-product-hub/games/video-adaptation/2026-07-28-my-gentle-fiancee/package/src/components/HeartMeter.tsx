export function HeartMeter({ affinity }: { affinity: number }) {
  const filled = Math.max(0, Math.min(5, Math.floor(affinity / 20)))
  return <span className="heart-meter" aria-label={`好感度 ${filled}/5`}>{[0, 1, 2, 3, 4].map((index) => <i key={index} className={index < filled ? 'filled' : ''}>♥</i>)}</span>
}
