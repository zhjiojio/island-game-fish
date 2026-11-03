# Long Feng Jie Interactive Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, validate, and publicly deploy an 8–12 minute mobile-first branching adaptation of 《龙凤劫：我的战神保镖》 with four meaningful decision points and three reachable endings.

**Architecture:** A React/Vite static app reads a typed story graph, applies stat and flag changes through a pure story engine, and renders video/still nodes in a portrait stage. Short source-derived media is imported through Vite's asset graph; local storage persists progress and unlocked endings; GitHub Actions deploys the verified `dist` artifact to GitHub Pages.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, CSS, ffmpeg, GitHub Actions, GitHub Pages.

---

## Execution convention

Unless a step explicitly changes directory, run commands from:

```text
/Users/kwaibear/Documents/AIGCGame/game-aigc-workflow/games/video-adaptation/2026-07-22-long-feng-jie-interactive
```

## File map

- `docs/story-graph.md`: human-readable narrative plus machine-readable JSON graph.
- `docs/asset-manifest.md`: human-readable media rationale and size summary.
- `docs/asset-manifest.json`: input for the workflow asset checker.
- `package/src/story/types.ts`: story graph, state, choice, media, and ending types.
- `package/src/story/engine.ts`: pure transition, gating, and ending-resolution logic.
- `package/src/story/storyData.ts`: typed graph and imported Vite media references.
- `package/src/story/engine.test.ts`: reachability and consequence tests.
- `package/src/storage/progress.ts`: versioned local progress and collection storage.
- `package/src/storage/progress.test.ts`: persistence and corruption recovery tests.
- `package/src/components/MediaStage.tsx`: video/still rendering and media-failure fallback.
- `package/src/components/ChoicePanel.tsx`: choice list, hints, and blocked reasons.
- `package/src/components/EndingScreen.tsx`: ending summary, history recap, replay controls.
- `package/src/App.tsx`: session orchestration only.
- `package/src/App.test.tsx`: critical player-flow UI tests.
- `package/src/styles.css`: portrait stage, responsive desktop shell, and visual tokens.
- `package/src/assets/video/*.mp4`: deployable 10–30 second source-derived segments.
- `package/src/assets/stills/*.jpg`: posters and choice-node fallback images.
- `package/.github/workflows/deploy.yml`: GitHub Pages build and deployment.
- `docs/build-report.md`: commands, test/build results, and package measurements.
- `docs/deploy-report.md`: target, URL, version, checked media, and final status.
- `reports/verification.json`: machine-readable public deployment verification.

### Task 1: Produce and validate the story graph

**Files:**
- Create: `docs/story-graph.md`
- Reference: `docs/video-analysis.md`
- Reference: `docs/superpowers/specs/2026-07-22-long-feng-jie-interactive-design.md`
- Modify: `workflow-run.yml`

- [ ] **Step 1: Run the required `story-architect` stage agent**

Give the agent the run directory and require these stable IDs and state names:

```json
{
  "startNodeId": "protection-contract",
  "initialStats": { "trust": 0, "evidence": 0, "control": 0 },
  "requiredChoiceNodes": [
    "protection-contract",
    "jade-guarded",
    "jade-independent",
    "lab-truth",
    "lab-business",
    "launch-evidence",
    "launch-control",
    "wedding-crisis"
  ],
  "requiredEndingIds": [
    "ending-together",
    "ending-crown-alone",
    "ending-unfinished"
  ]
}
```

The two `jade-*`, `lab-*`, and `launch-*` variants provide immediate media feedback without creating fake choices. The `wedding-crisis` node exposes only endings unlocked by accumulated flags/stats; `ending-unfinished` remains the safe reachable fallback.

- [ ] **Step 2: Validate required graph fields and references**

Run:

```bash
python3 - <<'PY'
import json, re
from pathlib import Path

path = Path('docs/story-graph.md')
text = path.read_text(encoding='utf-8')
match = re.search(r'```json\s*(\{.*?\})\s*```', text, re.S)
assert match, 'missing JSON block'
graph = json.loads(match.group(1))
assert graph['startNodeId'] in graph['nodes']
assert set(graph['initialStats']) == {'trust', 'evidence', 'control'}
for node_id, node in graph['nodes'].items():
    assert node['id'] == node_id
    assert node['media']['src']
    assert isinstance(node['dialogue'], list)
    assert bool(node.get('choices')) != bool(node.get('ending'))
    for choice in node.get('choices', []):
        if 'nextNodeId' in choice:
            assert choice['nextNodeId'] in graph['nodes']
endings = {n['ending']['id'] for n in graph['nodes'].values() if n.get('ending')}
assert {'ending-together', 'ending-crown-alone', 'ending-unfinished'} <= endings
print('story graph valid:', len(graph['nodes']), 'nodes')
PY
```

Expected: `story graph valid: <N> nodes`, with `N >= 12`.

- [ ] **Step 3: Mark the story stage complete**

Update `workflow-run.yml` so `story-architect.status` is `completed` and `stage` is `asset-director`.

- [ ] **Step 4: Commit the story handoff**

```bash
git add -f docs/story-graph.md workflow-run.yml
git commit -m "docs: define Long Feng Jie branching story"
```

### Task 2: Create deployable media and the asset manifest

**Files:**
- Create: `package/src/assets/video/*.mp4`
- Create: `package/src/assets/stills/*.jpg`
- Create: `docs/asset-manifest.md`
- Create: `docs/asset-manifest.json`
- Modify: `workflow-run.yml`

- [ ] **Step 1: Verify the required cutter is available**

Run:

```bash
command -v ffmpeg || brew install ffmpeg
ffmpeg -version | head -1
```

Expected: an `ffmpeg version ...` line. Do not modify the source MP4.

- [ ] **Step 2: Run the required `asset-director` stage agent**

Require the agent to use the approved story graph, produce one poster for every video node, and select no more than eight short MP4 segments. Suggested source windows are:

```text
00:00:05–00:01:35  protection contract
00:09:00–00:10:00  public alignment consequence
00:12:05–00:13:05  jade memory
00:15:10–00:16:10  lab evidence
00:30:20–00:31:20  launch setup
00:33:40–00:34:40  launch attack
00:41:45–00:43:00  warning and proposal
00:44:10–00:45:30  wedding system attack
```

The agent must trim these windows into 10–30 second narrative units, not copy each whole suggested range.

- [ ] **Step 3: Run the workflow asset gate**

Run:

```bash
python3 ../../../skills/agw-video-adaptation/scripts/check_assets.py \
  docs/asset-manifest.json
```

Expected: exit code 0; every deployable asset exists and is below 25 MB; the source video is not deployable.

- [ ] **Step 4: Inspect aggregate payload size**

Run:

```bash
find package/src/assets -type f -maxdepth 3 -print0 | xargs -0 stat -f '%z %N' | sort -nr
du -sh package/src/assets
```

Expected: no item above 26,214,400 bytes. Target total media payload: at most 80 MB.

- [ ] **Step 5: Mark the asset stage complete and commit**

Update `workflow-run.yml` so `asset-director.status` is `completed` and `stage` is `web-game-builder`, then run:

```bash
git add -f docs/asset-manifest.md docs/asset-manifest.json workflow-run.yml
git commit -m "docs: define Long Feng Jie media package"
```

Media binaries stay ignored in the workflow repository; they will be committed only in the standalone deploy repository created in Task 9.

### Task 3: Scaffold the tested React/Vite package

**Files:**
- Create: `package/package.json`
- Create: `package/tsconfig.json`
- Create: `package/vite.config.ts`
- Create: `package/index.html`
- Create: `package/src/main.tsx`
- Create: `package/src/test/setup.ts`

- [ ] **Step 1: Create the package and install test dependencies**

Run from the run directory:

```bash
npm create vite@latest package -- --template react-ts
cd package
npm install
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Expected: `package/package.json` and `package/package-lock.json` exist.

- [ ] **Step 2: Configure Vite and Vitest**

Set `package/vite.config.ts` to:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/long-feng-jie-interactive/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
```

Set `package/src/test/setup.ts` to:

```ts
import '@testing-library/jest-dom/vitest'
```

Add these scripts to `package/package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  }
}
```

- [ ] **Step 3: Verify the empty scaffold**

Run: `npm --prefix package run build`

Expected: exit code 0 and `dist/index.html` exists.

- [ ] **Step 4: Commit the scaffold in the workflow repository**

```bash
git add -f package/package.json package/package-lock.json package/tsconfig*.json package/vite.config.ts package/index.html package/src/main.tsx package/src/test/setup.ts
git commit -m "build: scaffold Long Feng Jie web game"
```

### Task 4: Implement the story engine with TDD

**Files:**
- Create: `package/src/story/types.ts`
- Create: `package/src/story/engine.ts`
- Create: `package/src/story/engine.test.ts`

- [ ] **Step 1: Write failing transition and gating tests**

Create `package/src/story/engine.test.ts` with tests that assert:

```ts
import { describe, expect, it } from 'vitest'
import { applyChoice, availableChoices } from './engine'

describe('story engine', () => {
  it('applies stat deltas and records history without mutation', () => {
    const state = { nodeId: 'a', stats: { trust: 0, evidence: 0, control: 0 }, flags: [], history: [] }
    const choice = { id: 'trust', label: '交付信任', hint: '', nextNodeId: 'b', statDelta: { trust: 1 }, setFlags: ['trusted'] }
    const next = applyChoice(state, choice)
    expect(next).toEqual({ nodeId: 'b', stats: { trust: 1, evidence: 0, control: 0 }, flags: ['trusted'], history: ['trust'] })
    expect(state.stats.trust).toBe(0)
  })

  it('keeps unmet choices visible but blocked', () => {
    const choices = [{ id: 'truth', label: '公开真相', hint: '', ending: 'ending-together', requiresFlags: ['trusted', 'evidence-secured'], blockedHint: '你仍缺少信任或证据' }]
    expect(availableChoices(choices, ['trusted'])[0]).toMatchObject({ blocked: true, blockedHint: '你仍缺少信任或证据' })
  })
})
```

- [ ] **Step 2: Run the tests and confirm RED**

Run: `npm --prefix package test -- src/story/engine.test.ts`

Expected: FAIL because `./engine` does not exist.

- [ ] **Step 3: Implement minimal pure engine functions**

Define `GameState`, `StoryChoice`, `StoryNode`, `StoryGraph`, and `Ending` in `types.ts`. Implement `applyChoice(state, choice)` and `availableChoices(choices, flags)` in `engine.ts`; clamp each stat to `[-3, 3]`, deduplicate flags, and preserve blocked choices with their `blockedHint`.

- [ ] **Step 4: Add graph reachability tests**

Add `validateGraph(graph)` and `reachableEndingIds(graph)` tests proving that all choice targets exist and all three formal endings can be reached from `startNodeId` under at least one legal sequence.

- [ ] **Step 5: Run tests and commit**

Run: `npm --prefix package test -- src/story/engine.test.ts`

Expected: all story engine tests pass.

```bash
git add -f package/src/story
git commit -m "feat: add branching story engine"
```

### Task 5: Implement versioned progress storage with TDD

**Files:**
- Create: `package/src/storage/progress.ts`
- Create: `package/src/storage/progress.test.ts`

- [ ] **Step 1: Write failing persistence tests**

Cover saving/restoring a valid session, returning a fresh session for malformed JSON, discarding an unsupported save version, and retaining the ending collection when starting a new run.

```ts
expect(loadProgress(storage, freshState)).toEqual(freshState)
storage.setItem(STORAGE_KEY, '{broken')
expect(loadProgress(storage, freshState)).toEqual(freshState)
```

- [ ] **Step 2: Run the tests and confirm RED**

Run: `npm --prefix package test -- src/storage/progress.test.ts`

Expected: FAIL because `progress.ts` does not exist.

- [ ] **Step 3: Implement the storage adapter**

Use a single key `long-feng-jie-progress`, schema version `1`, `saveProgress`, `loadProgress`, `resetRun`, and `unlockEnding`. Catch storage and JSON errors and return deterministic defaults.

- [ ] **Step 4: Run tests and commit**

Run: `npm --prefix package test -- src/storage/progress.test.ts`

Expected: all progress tests pass.

```bash
git add -f package/src/storage
git commit -m "feat: persist game progress and endings"
```

### Task 6: Integrate typed story data and media imports

**Files:**
- Create: `package/src/story/storyData.ts`
- Test: `package/src/story/storyData.test.ts`

- [ ] **Step 1: Write a failing production-graph test**

```ts
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
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm --prefix package test -- src/story/storyData.test.ts`

Expected: FAIL because `storyData.ts` does not exist.

- [ ] **Step 3: Implement the approved graph**

Translate the JSON block from `docs/story-graph.md` into `storyData.ts`. Import every MP4 and JPG from `src/assets`; do not embed `/video/...` strings. Map each graph media key to its imported URL before exporting `story`.

- [ ] **Step 4: Run tests and commit**

Run: `npm --prefix package test -- src/story/storyData.test.ts`

Expected: PASS with exactly the three promised ending IDs.

```bash
git add -f package/src/story/storyData.ts package/src/story/storyData.test.ts
git commit -m "feat: add production Long Feng Jie story"
```

### Task 7: Build the player interface with focused UI tests

**Files:**
- Create: `package/src/components/MediaStage.tsx`
- Create: `package/src/components/ChoicePanel.tsx`
- Create: `package/src/components/EndingScreen.tsx`
- Replace: `package/src/App.tsx`
- Create: `package/src/App.test.tsx`
- Replace: `package/src/styles.css`

- [ ] **Step 1: Write the failing player-flow test**

Test that the opening title and choices render, selecting a choice advances the node and announces a consequence, blocked ending choices cannot be selected, a media error displays the poster plus summary, and replay resets the run while keeping unlocked endings.

```ts
render(<App />)
expect(screen.getByRole('heading', { name: '保护契约' })).toBeInTheDocument()
await user.click(screen.getByRole('button', { name: /接受贴身保护/ }))
expect(await screen.findByText(/命运已改写/)).toBeInTheDocument()
```

- [ ] **Step 2: Run the UI test and confirm RED**

Run: `npm --prefix package test -- src/App.test.tsx`

Expected: FAIL because the production UI is not implemented.

- [ ] **Step 3: Implement focused components**

`MediaStage` accepts `media`, `dialogue`, `onEnded`, and exposes a retry/continue fallback after `video.onerror`. `ChoicePanel` accepts already evaluated choices and never applies state itself. `EndingScreen` renders ending title, summary, decision history, collection progress, and replay action. `App` alone owns the current `GameState`, persistence calls, and transition orchestration.

- [ ] **Step 4: Implement the approved visual system**

Use CSS custom properties:

```css
:root {
  --ink: #080b12;
  --panel: rgba(12, 17, 29, 0.92);
  --gold: #e3bf68;
  --danger: #9c3441;
  --text: #f6f0e4;
  --muted: #aab3c4;
}
```

Keep the stage at a `206 / 360` aspect ratio, cap desktop width near `430px`, place choices in a bottom sheet, honor `prefers-reduced-motion`, and keep every interactive target at least 44 CSS pixels tall.

- [ ] **Step 5: Run UI and full tests**

Run:

```bash
npm --prefix package test -- src/App.test.tsx
npm --prefix package test
```

Expected: all UI and unit tests pass.

- [ ] **Step 6: Commit the UI**

```bash
git add -f package/src/App.tsx package/src/App.test.tsx package/src/components package/src/styles.css
git commit -m "feat: build Long Feng Jie interactive player"
```

### Task 8: Pass build, asset, and browser gates

**Files:**
- Create: `docs/build-report.md`
- Modify: `workflow-run.yml`

- [ ] **Step 1: Run deterministic local gates**

```bash
npm --prefix package test
npm --prefix package run build
python3 ../../../skills/agw-video-adaptation/scripts/check_assets.py docs/asset-manifest.json
```

Expected: every command exits 0; `package/dist` contains hashed MP4/JPG assets.

- [ ] **Step 2: Run production preview and inspect both viewports**

Start: `npm --prefix package run preview -- --host 127.0.0.1 --port 4173`

Verify with the in-app browser at `390×844` and `1280×800`: opening media and poster load, four decision beats are playable, each of the three endings can be reached using documented paths, refresh resumes, mute/continue works, and no horizontal scroll appears.

- [ ] **Step 3: Write the build report**

Record exact commands, test counts, build output size, largest media file, all three ending paths, browser viewports, and any remaining non-blocking limitations in `docs/build-report.md`.

- [ ] **Step 4: Mark build complete and commit**

Set `web-game-builder.status` to `completed` and `stage` to `deploy-verifier`.

```bash
git add -f docs/build-report.md workflow-run.yml
git commit -m "test: verify Long Feng Jie game build"
```

### Task 9: Publish and verify GitHub Pages

**Files:**
- Create: `package/.github/workflows/deploy.yml`
- Create: `docs/deploy-report.md`
- Create: `reports/verification.json`
- Modify: `workflow-run.yml`

- [ ] **Step 1: Add the official Pages workflow**

Create `package/.github/workflows/deploy.yml` with `pages: write` and `id-token: write` permissions. It must run `npm ci`, `npm test`, `npm run build`, `actions/configure-pages`, `actions/upload-pages-artifact` with `./dist`, and `actions/deploy-pages` on pushes to `main`.

- [ ] **Step 2: Create the standalone public repository and push**

From `package/`:

```bash
git init -b main
git add .
git commit -m "feat: publish Long Feng Jie interactive game"
gh repo create long-feng-jie-interactive --public --source=. --remote=origin --push
gh api repos/bboyabssiszai/long-feng-jie-interactive/pages -X POST -f build_type=workflow
```

If the repository already exists under the authenticated account, verify ownership with `gh repo view`, set that repository as `origin`, and push the reviewed `main` branch instead of creating another repository.

- [ ] **Step 3: Wait for the deployment workflow**

```bash
gh run list --repo bboyabssiszai/long-feng-jie-interactive --workflow deploy.yml --limit 1
gh run watch --repo bboyabssiszai/long-feng-jie-interactive --exit-status
```

Expected: workflow conclusion `success` and public URL `https://bboyabssiszai.github.io/long-feng-jie-interactive/`.

- [ ] **Step 4: Run the required deployment verifier agent**

The agent must execute:

```bash
bash ../../../skills/agw-video-adaptation/scripts/verify_site_assets.sh \
  https://bboyabssiszai.github.io/long-feng-jie-interactive/
```

It must verify the homepage, bundled JS, every discovered MP4/JPG asset, response content types, and absence of HTML fallbacks.

- [ ] **Step 5: Record final deployment state**

Write `docs/deploy-report.md` and `reports/verification.json` with the deployment target, public URL, standalone repository commit SHA, checked media URLs, status, and failure classification if any. Set `deploy-verifier.status` to `completed` and `stage` to `done` only when all public checks pass.

- [ ] **Step 6: Commit the workflow handoff reports**

```bash
git add -f docs/deploy-report.md reports/verification.json workflow-run.yml
git commit -m "docs: record Long Feng Jie deployment verification"
```

### Task 10: Final regression and handoff

**Files:**
- Verify: `workflow-run.yml`
- Verify: `docs/build-report.md`
- Verify: `docs/deploy-report.md`
- Verify: `reports/verification.json`

- [ ] **Step 1: Re-run final local verification**

```bash
npm --prefix package test
npm --prefix package run build
python3 ../../../skills/agw-video-adaptation/scripts/check_assets.py docs/asset-manifest.json
```

Expected: all commands exit 0.

- [ ] **Step 2: Re-run public asset verification**

```bash
bash ../../../skills/agw-video-adaptation/scripts/verify_site_assets.sh \
  https://bboyabssiszai.github.io/long-feng-jie-interactive/
```

Expected: homepage, JS, video, and image checks pass with no `fallback-html` result.

- [ ] **Step 3: Confirm the workflow contract is complete**

Check that every required artifact exists, every stage status is `completed`, and top-level `stage` is `done`. Hand off the public URL, local package path, reports, test/build results, and known limitations.
