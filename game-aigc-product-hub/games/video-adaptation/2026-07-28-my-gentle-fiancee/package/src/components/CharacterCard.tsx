import { portraitByCharacter } from '../generated/roster-imports'
import { HeartMeter } from './HeartMeter'

interface Props {
  id: string
  name: string
  promise: string
  affinity: number
  completed: boolean
  locked: boolean
  wave: number
  onSelect?: () => void
}

export function CharacterCard({ id, name, promise, affinity, completed, locked, wave, onSelect }: Props) {
  return (
    <button className={`character-card ${locked ? 'is-locked' : ''}`} disabled={locked} onClick={onSelect} aria-label={`${name}${locked ? '，尚未解锁' : '，进入章节'}`}>
      <img src={portraitByCharacter[id as keyof typeof portraitByCharacter]} alt="" />
      <span className="dossier-index">契约 {String(wave).padStart(2, '0')} · {completed ? '心意已记录' : locked ? '尚未解封' : '等待回应'}</span>
      <strong>{name}</strong>
      <small>{promise}</small>
      <HeartMeter affinity={affinity} />
      {locked ? <span className="seal"><b>LOCK</b>第 {wave} 组</span> : null}
    </button>
  )
}
