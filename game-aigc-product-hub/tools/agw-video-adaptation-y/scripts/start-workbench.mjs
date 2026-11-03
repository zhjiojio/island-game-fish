#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const result = { defaultPort: 3100, open: true };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--port") result.defaultPort = Number(argv[++index]);
    else if (argv[index] === "--no-open") result.open = false;
    else {
      console.error(`未知参数：${argv[index]}`);
      process.exit(2);
    }
  }
  if (!Number.isInteger(result.defaultPort) || result.defaultPort < 1 || result.defaultPort > 65535) {
    console.error("--port 必须是 1 到 65535 之间的整数");
    process.exit(2);
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(scriptDir, "..");
const webappDir = path.join(skillDir, "webapp");

if (!existsSync(path.join(webappDir, "node_modules", "vinext"))) {
  const install = spawnSync("npm", ["ci"], { cwd: webappDir, stdio: "inherit" });
  if (install.status !== 0) process.exit(install.status || 1);
}

const host = "127.0.0.1";
const port = String(args.defaultPort);
const url = `http://${host}:${port}/`;
const child = spawn(
  "npm",
  ["run", "dev", "--", "--hostname", host, "--port", port],
  { cwd: webappDir, env: { ...process.env }, stdio: "inherit" },
);

console.log(JSON.stringify({ type: "agw-y-workbench-started", url, pid: process.pid }));

if (args.open) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const openArgs = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const opener = spawn(command, openArgs, { detached: true, stdio: "ignore" });
  opener.unref();
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (!child.killed) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 250);
}

child.on("exit", (code, signal) => {
  if (shuttingDown) return;
  if (signal) shutdown(1);
  else shutdown(code || 0);
});
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
