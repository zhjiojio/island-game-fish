import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const file = (relativePath: string) => fileURLToPath(new URL(relativePath, import.meta.url))
const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

describe('approved Xiaoyu media integrity', () => {
  const pairs = [
    {
      legacy: file('../../assets/video/doorstep-return.mp4'),
      authoritative: file('../../assets/video/xiaoyu-ch01-r01.mp4'),
      packaged: file('./assets/video/xiaoyu-ch01-r01.mp4'),
    },
    {
      legacy: file('../../assets/video/warm-reaction.mp4'),
      authoritative: file('../../assets/video/xiaoyu-ch01-r03-warm-first-answer.mp4'),
      packaged: file('./assets/video/xiaoyu-ch01-r03-warm-first-answer.mp4'),
    },
  ]

  it.each(pairs)('ships a compressed version of the approved legacy media', ({ legacy, authoritative, packaged }) => {
    expect(statSync(legacy).size).toBeGreaterThan(1_000_000)
    expect(sha256(authoritative)).toBe(sha256(legacy))
    expect(statSync(packaged).size).toBeGreaterThan(250_000)
    expect(statSync(packaged).size).toBeLessThan(statSync(authoritative).size)
  })

  it('ships node-specific static frames instead of cloning one anchor', () => {
    const portraitDir = file('./assets/portrait/')
    const files = readdirSync(portraitDir).filter((name) => name.endsWith('.jpg'))
    const byRoute = new Map<string, string[]>()
    for (const name of files) {
      const routeId = name.split('-ch01-')[0]
      byRoute.set(routeId, [...(byRoute.get(routeId) ?? []), name])
    }

    for (const [routeId, routeFiles] of byRoute) {
      const hashes = new Set(routeFiles.map((name) => sha256(`${portraitDir}${name}`)))
      expect(hashes.size, `${routeId} static frames must be node-specific`).toBe(routeFiles.length)
    }
  })
})
