import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const skillRoot = new URL('../', import.meta.url)

test('X owns gameplay decomposition and video production capabilities', async () => {
  const gameplayUrl = new URL('capabilities/gameplay-decomposition/SKILL.md', skillRoot)
  const videoUrl = new URL('capabilities/video-production/SKILL.md', skillRoot)
  assert.equal(existsSync(fileURLToPath(gameplayUrl)), true, 'gameplay-decomposition should exist inside X')
  assert.equal(existsSync(fileURLToPath(videoUrl)), true, 'video-production should exist inside X')
  const rootSkill = await readFile(new URL('SKILL.md', skillRoot), 'utf8')
  const videoSkill = await readFile(videoUrl, 'utf8')
  const orchestrator = await readFile(new URL('capabilities/game-workbench-orchestrator/SKILL.md', skillRoot), 'utf8')
  assert.match(rootSkill, /gameplay-decomposition/)
  assert.match(rootSkill, /video-production/)
  assert.match(orchestrator, /gameplay-decomposition/)
  assert.match(orchestrator, /video-production/)
  assert.doesNotMatch(rootSkill + videoSkill + orchestrator, /capabilities\/media-production|agw-video-adaptation-flash|shot-media/)
})

test('video production owns its artifact contract and production recipes', () => {
  for (const path of [
    'capabilities/video-production/references/artifact-contract.md',
    'capabilities/video-production/recipes/reference-to-video.md',
    'capabilities/video-production/recipes/character-node-video.md',
    'capabilities/video-production/recipes/digital-human-lipsync.md',
    'capabilities/video-production/recipes/multishot-final-compose.md',
  ]) assert.equal(existsSync(fileURLToPath(new URL(path, skillRoot))), true, `${path} should exist`)
})

test('backend exposes domain production actions without an assistant API', async () => {
  const backend = new URL('../vendor/mirofish/backend/app/', import.meta.url)
  const api = await readFile(new URL('api/drama.py', backend), 'utf8')
  const serviceUrl = new URL('services/production_action.py', backend)
  assert.equal(existsSync(fileURLToPath(serviceUrl)), true, 'production action service should exist')
  const service = await readFile(serviceUrl, 'utf8')
  assert.match(api, /projects\/<project_id>\/actions/)
  assert.doesNotMatch(api + service, /agent\/tasks|DramaAgentService|AI 制作助手/)
  for (const capability of ['structured-story', 'gameplay-decomposition', 'character-assets', 'video-production', 'game-assembly', 'game-release']) {
    assert.match(service, new RegExp(capability))
  }
})
