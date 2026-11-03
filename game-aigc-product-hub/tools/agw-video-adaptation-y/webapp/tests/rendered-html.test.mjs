import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the MuJian creator studio product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>幕间 Studio · AI 剧游创作平台<\/title>/i);
  assert.match(html, /荒年记/);
  assert.match(html, /项目总览/);
  assert.match(html, /剧本/);
  assert.match(html, /人物/);
  assert.match(html, /视频/);
  assert.match(html, /游戏组装/);
  assert.match(html, /构建发布/);
  assert.match(html, /AI 制作助手/);
  assert.match(html, /能力共建台/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|codex-preview/i);
});

test("ships the agreed workspaces and representative interactions", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  for (const workspace of [
    "overview",
    "story",
    "characters",
    "video",
    "assembly",
    "release",
    "capability",
  ]) {
    assert.match(page, new RegExp(`id:\\s*["']${workspace}["']`));
  }

  for (const behavior of [
    "setActiveWorkspace",
    "setSelectedNode",
    "setSelectedCharacter",
    "setFrameStatus",
    "setPreviewChoice",
    "setShowBlockers",
    "setStudioMode",
  ]) {
    assert.match(page, new RegExp(behavior));
  }

  assert.match(page, /从公共库使用/);
  assert.match(page, /从项目复用/);
  assert.match(page, /AI 新生成/);
  assert.match(page, /人物一致性生成/);
  assert.match(page, /Evals/);
  assert.match(page, /快手小游戏/);
});

test("removes disposable starter assets and metadata", async () => {
  const [layout, packageJson] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /lang="zh-CN"/);
  assert.match(layout, /幕间 Studio/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview/i);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await access(new URL("../public/media/wanr.png", import.meta.url));
  await access(new URL("../public/media/e4s6-first.jpg", import.meta.url));
});
