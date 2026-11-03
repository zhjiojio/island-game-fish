import { describe, expect, it } from 'vitest'
import { cgByNode } from '../generated/cg-imports'
import { mediaByNode } from '../generated/media-imports'
import { portraitByNode } from '../generated/portrait-imports'
import { selectResult, validateGraph } from '../story/engine'
import { graphForRoute, routeIds } from './content'

describe('campaign content media contract', () => {
  it('preserves generated node ids and conditional video variants', () => {
    const xiaoyu = graphForRoute('xiaoyu')
    expect(xiaoyu.nodes['xiaoyu-ch01-r01'].media.nodeId).toBe('xiaoyu-ch01-r01')
    expect(xiaoyu.nodes['xiaoyu-ch01-r03'].media.variants?.map((item) => item.mediaVariantId)).toEqual([
      'xiaoyu-ch01-r03-warm-first-answer',
      'xiaoyu-ch01-r03-neutral-first-answer',
      'xiaoyu-ch01-r03-cold-first-answer',
    ])
  })

  it('preserves generated CG presentation contracts', () => {
    const linshu = graphForRoute('linshu')
    expect(linshu.nodes['linshu-ch01-r07'].media).toMatchObject({
      type: 'cg',
      nodeId: 'linshu-ch01-r07',
    })
  })

  it('ships nine traversable route graphs with a selectable default result', () => {
    expect(routeIds).toEqual(['xiaoyu', 'linshu', 'wanwan', 'tangtang', 'yuwan', 'xinqing', 'yeye', 'liuli', 'yaoji'])
    for (const routeId of routeIds) {
      const graph = graphForRoute(routeId)
      expect(validateGraph(graph), routeId).toEqual([])
      const resultNode = Object.values(graph.nodes).find((node) => node.resultVariants)
      expect(resultNode, routeId).toBeDefined()
      expect(selectResult(resultNode!, { affinity: -999, flags: [], clues: [] }), routeId).toBeDefined()
    }
  })

  it('resolves every declared video, portrait, and CG node to a built import', () => {
    const videos = mediaByNode as Record<string, unknown>
    const portraits = portraitByNode as Record<string, unknown>
    const cgs = cgByNode as Record<string, unknown>
    for (const routeId of routeIds) {
      for (const node of Object.values(graphForRoute(routeId).nodes)) {
        if (node.media.type === 'video') {
          const ids = node.media.variants?.map((variant) => variant.mediaVariantId) ?? [node.media.nodeId ?? node.id]
          for (const id of ids) expect(videos[id], `${node.id} -> ${id}`).toBeDefined()
        }
        if (node.media.type === 'portrait') expect(portraits[node.id], node.id).toBeDefined()
        if (node.media.type === 'cg') expect(cgs[node.id], node.id).toBeDefined()
      }
    }
  })
})
