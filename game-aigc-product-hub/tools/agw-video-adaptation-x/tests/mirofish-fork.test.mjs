import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../vendor/mirofish/frontend/src/', import.meta.url)

test('the workbench keeps the force graph and exposes professional workspaces', async () => {
  const main = await readFile(new URL('views/MainView.vue', root), 'utf8')
  assert.match(main, /GraphPanel/)
  for (const label of ['剧本', '人物', '镜头视频', '游戏组装', '构建发布']) assert.match(main, new RegExp(label))
  for (const label of ['章节与场景', '分支剧本', '人物关系', '玩法关系']) assert.match(main, new RegExp(label))
  assert.doesNotMatch(main, /GameWorkbench/)
})

test('AI is embedded in domain actions instead of a standalone assistant', async () => {
  const main = await readFile(new URL('views/MainView.vue', root), 'utf8')
  const panel = await readFile(new URL('components/ProductionWorkspacePanel.vue', root), 'utf8')
  const api = await readFile(new URL('api/drama.js', root), 'utf8')
  for (const source of [main, panel, api]) {
    assert.doesNotMatch(source, /AI 制作助手|agentPrompt|agent-task|createDramaAgentTask/)
  }
  for (const action of ['拆解剧本', '补全分支', '生成候选', '生成下一批镜头']) assert.match(panel, new RegExp(action))
})

test('the product uses the 幕间 Studio identity without upstream navigation', async () => {
  const home = await readFile(new URL('views/Home.vue', root), 'utf8')
  const main = await readFile(new URL('views/MainView.vue', root), 'utf8')
  const brand = await readFile(new URL('components/BrandMark.vue', root), 'utf8')
  const index = await readFile(new URL('../index.html', root), 'utf8')

  for (const source of [home, main, brand, index]) {
    assert.doesNotMatch(source, /MiroFish/i)
  }
  assert.match(brand, /幕间/)
  assert.match(brand, /STUDIO/)
  assert.match(brand, /mujian-mark\.svg/)
  assert.doesNotMatch(home, /LanguageSwitcher/)
  assert.doesNotMatch(home, /github\.com|visitGithub|github-link/i)
})
