import { describe, expect, it, vi } from 'vitest'
import { LayeredAudioController } from './layered-audio'

const fakeAudio = () => ({
  currentTime: 7,
  loop: false,
  muted: false,
  preload: '',
  volume: 1,
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
})

describe('layered story audio', () => {
  it('keeps the same music player and position for the same character mood key', () => {
    const created: ReturnType<typeof fakeAudio>[] = []
    const controller = new LayeredAudioController((() => {
      const audio = fakeAudio()
      created.push(audio)
      return audio
    }) as never)

    controller.enterStatic({ musicKey: 'xiaoyu:warm', musicSrc: '/warm.wav' })
    controller.enterStatic({ musicKey: 'xiaoyu:warm', musicSrc: '/warm.wav' })

    expect(created).toHaveLength(1)
    expect(created[0].play).toHaveBeenCalledOnce()
    expect(created[0].currentTime).toBe(7)
  })

  it('uses a 1.2 second equal-power crossfade when the music key changes', () => {
    const controller = new LayeredAudioController((() => fakeAudio()) as never)
    controller.enterStatic({ musicKey: 'xiaoyu:warm', musicSrc: '/warm.wav' })
    const transition = controller.enterStatic({ musicKey: 'xiaoyu:suspicion', musicSrc: '/suspicion.wav' })
    expect(transition).toMatchObject({ kind: 'crossfade', durationMs: 1200, curve: 'equal-power' })
  })

  it('ducks music for video and suppresses foley while video is active', () => {
    const foley = fakeAudio()
    const controller = new LayeredAudioController(((src: string) => src.includes('foley') ? foley : fakeAudio()) as never)
    controller.enterStatic({ musicKey: 'xiaoyu:warm', musicSrc: '/warm.wav' })
    const duck = controller.enterVideo()
    expect(duck).toEqual({ kind: 'duck', durationMs: 300, preservesPosition: true })
    expect(controller.videoDuckMs).toBe(300)
    expect(controller.playFoley('entry-1', '/foley.wav')).toBe(false)
    expect(foley.play).not.toHaveBeenCalled()
  })

  it('restores the same music player after video without resetting its position', () => {
    const music = fakeAudio()
    const controller = new LayeredAudioController((() => music) as never)
    controller.enterStatic({ musicKey: 'xiaoyu:warm', musicSrc: '/warm.wav' })
    controller.enterVideo()
    controller.enterStatic({ musicKey: 'xiaoyu:warm', musicSrc: '/warm.wav' })
    expect(music.currentTime).toBe(7)
    expect(music.pause).not.toHaveBeenCalled()
    expect(music.play).toHaveBeenCalledTimes(2)
  })

  it('plays one foley event once per node entry token', () => {
    const foley = fakeAudio()
    const controller = new LayeredAudioController((() => foley) as never)
    expect(controller.playFoley('entry-1', '/foley.wav')).toBe(true)
    expect(controller.playFoley('entry-1', '/foley.wav')).toBe(false)
    expect(controller.playFoley('entry-2', '/foley.wav')).toBe(true)
    expect(foley.play).toHaveBeenCalledTimes(2)
  })
})
