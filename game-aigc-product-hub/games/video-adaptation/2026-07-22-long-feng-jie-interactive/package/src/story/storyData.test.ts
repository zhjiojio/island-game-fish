import { expect, it } from 'vitest'
import { reachableEndingIds, validateGraph } from './engine'
import { story } from './storyData'

it('ships a valid graph with every promised ending reachable', () => {
  expect(validateGraph(story)).toEqual([])
  expect(reachableEndingIds(story).sort()).toEqual([
    'ending-crown-alone',
    'ending-together',
    'ending-unfinished',
  ])
})
