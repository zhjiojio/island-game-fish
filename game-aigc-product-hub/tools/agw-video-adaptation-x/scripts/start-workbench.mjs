#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function parseArgs(argv) {
  const result = { runDir:'', open:true }
  for (let index=0; index<argv.length; index+=1) {
    if (argv[index] === '--run-dir') result.runDir = argv[++index] || ''
    else if (argv[index] === '--no-open') result.open = false
  }
  return result
}

const args = parseArgs(process.argv.slice(2))
if (!args.runDir) {
  console.error('用法：node start-workbench.mjs --run-dir <项目目录> [--no-open]')
  process.exit(2)
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const skillDir = path.resolve(scriptDir, '..')
const workflowRoot = path.resolve(skillDir, '../..')
const vendorRoot = path.join(skillDir, 'vendor', 'mirofish')
const frontendDir = path.join(vendorRoot, 'frontend')
const backendDir = path.join(vendorRoot, 'backend')
const runDir = path.resolve(args.runDir)

for (const [directory, marker] of [[vendorRoot,'node_modules/concurrently'],[frontendDir,'node_modules/vue']]) {
  if (!existsSync(path.join(directory, marker))) {
    const install = spawnSync('npm', ['install'], { cwd:directory, stdio:'inherit' })
    if (install.status !== 0) process.exit(install.status || 1)
  }
}

const sharedEnv = {
  ...process.env,
  AGW_X_DRAMA_ONLY:'1',
  AGW_X_RUN_DIR:runDir,
  AGW_X_WORKFLOW_ROOT:workflowRoot,
  FLASK_HOST:'127.0.0.1',
  FLASK_PORT:'5001',
  VITE_API_BASE_URL:'http://127.0.0.1:5001',
}

const backend = spawn('uv', ['run','--no-project','--with','flask','--with','flask-cors','python','run.py'], { cwd:backendDir, env:sharedEnv, stdio:'inherit' })
const frontend = spawn('npm', ['run','dev','--','--host','127.0.0.1','--port','3000','--strictPort'], { cwd:frontendDir, env:sharedEnv, stdio:'inherit' })
const children = [backend, frontend]

for (const child of children) child.on('exit', code => { if (code && !shuttingDown) shutdown(code) })

const url = 'http://127.0.0.1:3000'
console.log(JSON.stringify({ type:'agw-x-workbench-started', url, runDir, pid:process.pid }))

if (args.open) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const openArgs = process.platform === 'win32' ? ['/c','start','',url] : [url]
  const opener = spawn(command, openArgs, { detached:true, stdio:'ignore' })
  opener.unref()
}

let shuttingDown = false
function shutdown(code=0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) if (!child.killed) child.kill('SIGTERM')
  setTimeout(() => process.exit(code), 250)
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
