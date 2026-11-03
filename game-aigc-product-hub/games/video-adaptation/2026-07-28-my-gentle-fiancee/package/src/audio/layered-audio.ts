type AudioFactory = (src: string) => HTMLAudioElement

export type MusicTransition =
  | { kind: 'started' | 'continued'; durationMs: 0 }
  | { kind: 'crossfade'; durationMs: 1200; curve: 'equal-power' }

const MUSIC_VOLUME = 0.32
const FOLEY_VOLUME = 0.08

export class LayeredAudioController {
  readonly crossfadeMs = 1200
  readonly videoDuckMs = 300
  private music?: { key: string; audio: HTMLAudioElement }
  private previousMusic?: HTMLAudioElement
  private foley?: HTMLAudioElement
  private playedFoleyEntries = new Set<string>()
  private videoActive = false
  private transitionVersion = 0

  constructor(private readonly createAudio: AudioFactory = (src) => new Audio(src)) {}

  private safePlay(audio: HTMLAudioElement) {
    const result = audio.play()
    if (result?.catch) void result.catch(() => undefined)
  }

  private fade(from: HTMLAudioElement | undefined, to: HTMLAudioElement | undefined, durationMs: number, releaseFrom = true) {
    const version = ++this.transitionVersion
    const start = typeof performance === 'undefined' ? 0 : performance.now()
    const frame = (now: number) => {
      if (version !== this.transitionVersion) return
      const progress = Math.min(1, Math.max(0, (now - start) / durationMs))
      if (from) from.volume = Math.cos(progress * Math.PI / 2) * MUSIC_VOLUME
      if (to) to.volume = Math.sin(progress * Math.PI / 2) * MUSIC_VOLUME
      if (progress < 1 && typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame)
      else if (from && releaseFrom) {
        from.pause()
        from.currentTime = 0
      }
    }
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame)
    else {
      if (from) from.volume = 0
      if (to) to.volume = MUSIC_VOLUME
    }
  }

  enterStatic({ musicKey, musicSrc }: { musicKey: string; musicSrc: string }): MusicTransition {
    const resumesFromVideo = this.videoActive
    this.videoActive = false
    if (this.music?.key === musicKey) {
      this.transitionVersion += 1
      this.music.audio.muted = false
      this.music.audio.volume = MUSIC_VOLUME
      if (resumesFromVideo) this.safePlay(this.music.audio)
      return { kind: 'continued', durationMs: 0 }
    }
    const next = this.createAudio(musicSrc)
    next.preload = 'auto'
    next.loop = true
    next.volume = this.music ? 0 : MUSIC_VOLUME
    this.safePlay(next)
    if (!this.music) {
      this.music = { key: musicKey, audio: next }
      return { kind: 'started', durationMs: 0 }
    }
    this.previousMusic = this.music.audio
    this.music = { key: musicKey, audio: next }
    this.fade(this.previousMusic, next, this.crossfadeMs)
    return { kind: 'crossfade', durationMs: 1200, curve: 'equal-power' }
  }

  enterVideo() {
    this.videoActive = true
    if (this.music) this.fade(this.music.audio, undefined, this.videoDuckMs, false)
    this.stopFoley()
    return { kind: 'duck' as const, durationMs: 300 as const, preservesPosition: true as const }
  }

  unlock() {
    if (this.music && !this.videoActive) this.safePlay(this.music.audio)
  }

  playFoley(entryToken: string, src?: string) {
    if (this.videoActive || !src || this.playedFoleyEntries.has(entryToken)) return false
    this.playedFoleyEntries.add(entryToken)
    this.stopFoley()
    const audio = this.createAudio(src)
    audio.preload = 'auto'
    audio.volume = FOLEY_VOLUME
    this.foley = audio
    this.safePlay(audio)
    return true
  }

  private stopFoley() {
    if (!this.foley) return
    this.foley.pause()
    this.foley.currentTime = 0
    this.foley = undefined
  }

  dispose() {
    this.stopFoley()
    for (const audio of [this.music?.audio, this.previousMusic]) {
      if (!audio) continue
      audio.pause()
      audio.currentTime = 0
    }
    this.music = undefined
    this.previousMusic = undefined
  }
}
