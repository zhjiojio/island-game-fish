export const SOUND_CUES = {
  choice: { frequency: 392, duration: 0.09, gain: 0.035, wave: 'sine' },
  continue: { frequency: 523.25, duration: 0.12, gain: 0.028, wave: 'triangle' },
  complete: { frequency: 783.99, duration: 0.24, gain: 0.035, wave: 'sine' },
} as const

export type SoundCue = keyof typeof SOUND_CUES

export function playUiSound(cue: SoundCue) {
  if (typeof window === 'undefined') return
  const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return
  const context = new AudioContextClass()
  const definition = SOUND_CUES[cue]
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const start = context.currentTime
  oscillator.type = definition.wave
  oscillator.frequency.setValueAtTime(definition.frequency, start)
  if (cue === 'complete') oscillator.frequency.exponentialRampToValueAtTime(definition.frequency * 1.25, start + definition.duration)
  gain.gain.setValueAtTime(definition.gain, start)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + definition.duration)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start(start)
  oscillator.stop(start + definition.duration)
  oscillator.addEventListener('ended', () => void context.close(), { once: true })
}
