import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(scriptsDir, '..')
const distRoot = join(projectRoot, 'dist')

mkdirSync(join(distRoot, 'server'), { recursive: true })
mkdirSync(join(distRoot, '.openai'), { recursive: true })

copyFileSync(
  join(projectRoot, '.openai', 'hosting.json'),
  join(distRoot, '.openai', 'hosting.json'),
)

writeFileSync(
  join(distRoot, 'server', 'index.js'),
  `export default {
  async fetch(request, env) {
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      return assetResponse;
    }

    const indexUrl = new URL(request.url);
    indexUrl.pathname = '/index.html';
    indexUrl.search = '';
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};
`,
)
