import assert from "node:assert/strict";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (["node_modules", ".git", ".vinext", ".wrangler", "dist"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    const stats = await lstat(absolute);
    assert.equal(stats.isSymbolicLink(), false, `${absolute} must not be a symlink`);
    if (entry.isDirectory()) files.push(...await collectFiles(absolute));
    else files.push(absolute);
  }
  return files;
}

test("ships a self-contained Y skill and web application", async () => {
  for (const relativePath of [
    "SKILL.md",
    "agents/openai.yaml",
    "scripts/start-workbench.mjs",
    "webapp/package.json",
    "webapp/package-lock.json",
    "webapp/app/page.tsx",
    "webapp/public/media/wanr.png",
    "webapp/tests/rendered-html.test.mjs",
  ]) {
    const stats = await lstat(path.join(skillRoot, relativePath));
    assert.equal(stats.isFile(), true, `${relativePath} must be a regular file`);
  }

  const packageJson = JSON.parse(await readFile(path.join(skillRoot, "webapp/package.json"), "utf8"));
  assert.equal(packageJson.name, "agw-video-adaptation-y-workbench");
});

test("contains no references or links to X or the temporary source checkout", async () => {
  const forbidden = [
    `agw-video-adaptation-${"x"}`,
    ["/Users/kwaibear/Documents/AIGCGame/tmp", "comedyAgent"].join("/"),
    ["AGW", "X", ""].join("_"),
    ["vendor", "mirofish"].join("/"),
  ];
  const textExtensions = new Set(["", ".md", ".json", ".mjs", ".js", ".ts", ".tsx", ".css", ".yaml", ".yml"]);

  for (const file of await collectFiles(skillRoot)) {
    if (!textExtensions.has(path.extname(file))) continue;
    const contents = await readFile(file, "utf8");
    for (const token of forbidden) {
      assert.equal(contents.includes(token), false, `${path.relative(skillRoot, file)} contains forbidden reference ${token}`);
    }
  }
});

test("launcher owns its webapp, port, and process lifecycle", async () => {
  const launcher = await readFile(path.join(skillRoot, "scripts/start-workbench.mjs"), "utf8");
  const viteConfig = await readFile(path.join(skillRoot, "webapp/vite.config.ts"), "utf8");
  assert.match(launcher, /path\.join\(skillDir, ["']webapp["']\)/);
  assert.match(launcher, /defaultPort:\s*3100/);
  assert.match(launcher, /--no-open/);
  assert.match(launcher, /["']--hostname["']/);
  assert.doesNotMatch(launcher, /["']--host["']/);
  assert.match(launcher, /SIGINT/);
  assert.match(launcher, /SIGTERM/);
  assert.doesNotMatch(launcher, new RegExp(`\\.\\.\\/agw-video-adaptation-${"x"}|127\\.0\\.0\\.1:3000`));
  assert.match(viteConfig, /strictPort:\s*true/);
});

test("is registered as its own workflow skill", async () => {
  const workflowRoot = path.resolve(skillRoot, "../..");
  const manifest = JSON.parse(await readFile(path.join(workflowRoot, "manifest.json"), "utf8"));
  const registration = manifest.skills.find((skill) => skill.name === "agw-video-adaptation-y");

  assert.ok(registration, "workflow manifest must register Y");
  assert.equal(registration.path, "./skills/agw-video-adaptation-y/SKILL.md");
  assert.ok(registration.triggers.includes("剧游 Y"));
});
