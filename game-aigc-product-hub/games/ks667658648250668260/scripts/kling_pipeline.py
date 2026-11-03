#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kling 视频并行流水线调度器

━━━ 为什么需要它 ━━━
原 `python3 -m tools.make_videos` 的 main() 是「提交 → while sleep 轮询 → 下载」全程独占，
一个视频要占满约 130~190s，其中 90% 是干等 Kling 渲染。19 个串行 ≈ 43 分钟。

━━━ 实测约束（scripts/probe_kling_concurrency.py 探得）━━━
Kling 并发上限 = 3。第 4 个提交立刻返回
    429 {"code":1303,"message":"parallel task over resource pack limit"}
所以不能无脑加并发，必须做「限 3 的滑动窗口」。

━━━ 本调度器做法 ━━━
   ┌ 提交槽位（≤3 并发）───────────────┐
   │  任务A ██████ 渲染中               │
   │  任务B ████ 渲染中                 │  ← 一个完成立刻补下一个进来
   │  任务C ██████████ 渲染中            │
   └──────────────────────────────────┘
   统一轮询所有在飞任务 → succeeded 即在独立线程下载 → 腾出槽位补新任务

理论提速：串行 N×150s → 并行 ceil(N/3)×150s ≈ 3 倍
19 个：43 分钟 → 约 15 分钟

━━━ 复用与安全 ━━━
· job-file 与官方 JobStore 同格式，中断可续跑（已 succeeded 的不重复提交）
· 输出已存在且 >100KB 则跳过
· 1303 限流不算失败，退避后重投
· 下载与提交解耦，下载不占并发额度
"""
from __future__ import annotations
import argparse, base64, json, sys, threading, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

SKILL = Path("/Users/fat/.codeflicker/remote-personal-skills/agw-work-mode")
sys.path.insert(0, str(SKILL))

from tools.make_videos.kling import create_jwt, submit, status, download
from tools.make_videos.contract import normalize_request
from tools.make_videos.providers.kling import build_payload
from tools.make_videos.profiles import load_profile
from tools.media_common.credentials import load_credentials

MAX_INFLIGHT   = 3      # 实测硬上限，勿调高
POLL_INTERVAL  = 10
SUBMIT_SPACING = 6.0    # 提交间隔；实测 2s 太密会导致渲染阶段回吐 1303
RETRY_BACKOFF  = 30     # 撞 1303 后的退避
TIMEOUT        = 1200

_lock = threading.Lock()
def log(msg: str):
    with _lock:
        print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def is_rate_limited(err: str) -> bool:
    e = err.lower()
    return "1303" in e or "parallel task" in e or "429" in e


class Task:
    __slots__ = ("node", "req", "out", "jobf", "job", "state", "tries", "t0")
    def __init__(self, node, req, out, jobf):
        self.node, self.req, self.out, self.jobf = node, req, out, jobf
        self.job, self.state, self.tries, self.t0 = None, "pending", 0, None


class Pipeline:
    def __init__(self, tasks, profile="kling-3-pro"):
        self.cred = load_credentials()
        if not self.cred.kling_access_key:
            raise SystemExit("缺少 KLING_ACCESS_KEY")
        self.prof = load_profile(profile)
        self.tasks = tasks
        self.queue = list(tasks)
        self.inflight: list[Task] = []
        self.done: list[Task] = []
        self.failed: list[Task] = []
        self.pool = ThreadPoolExecutor(max_workers=4)   # 下载专用，不占并发额度
        self.dl_futures = []
        self.last_submit = 0.0

    def token(self):
        return create_jwt(self.cred.kling_access_key, self.cred.kling_secret_key)

    # ── 断点续跑：已有 job-file 且 succeeded 的直接进下载
    def resume(self):
        for t in list(self.queue):
            if t.out.exists() and t.out.stat().st_size > 100_000:
                log(f"⏭  {t.node} 输出已存在，跳过")
                t.state = "done"; self.done.append(t); self.queue.remove(t); continue
            if t.jobf.exists():
                try:
                    j = json.loads(t.jobf.read_text())
                    if j.get("jobId"):
                        t.job = j
                        t.state = "flying"
                        t.t0 = time.monotonic()
                        self.inflight.append(t); self.queue.remove(t)
                        log(f"♻️  {t.node} 续跑已有任务 jobId={j['jobId']}")
                except Exception:
                    pass

    def try_submit(self):
        while self.queue and len(self.inflight) < MAX_INFLIGHT:
            gap = time.monotonic() - self.last_submit
            if gap < SUBMIT_SPACING:
                time.sleep(SUBMIT_SPACING - gap)
            t = self.queue[0]
            try:
                job = submit(build_payload(t.req, self.prof["model"]),
                             self.cred.kling_base_url, self.token())
                t.job, t.state, t.t0 = job, "flying", time.monotonic()
                t.jobf.write_text(json.dumps(job, ensure_ascii=False, indent=2))
                self.queue.pop(0); self.inflight.append(t)
                self.last_submit = time.monotonic()
                log(f"▶  提交 {t.node}  jobId={job['jobId']}  "
                    f"(在飞 {len(self.inflight)}/{MAX_INFLIGHT}, 待提交 {len(self.queue)})")
            except Exception as e:
                msg = str(e)
                if is_rate_limited(msg):
                    log(f"⏸  {t.node} 撞并发上限，退避 {RETRY_BACKOFF}s（不计失败）")
                    self.last_submit = time.monotonic() + RETRY_BACKOFF
                    return
                t.tries += 1
                if t.tries >= 3:
                    log(f"❌ {t.node} 提交连续失败 3 次: {msg[:150]}")
                    self.queue.pop(0); t.state = "failed"; self.failed.append(t)
                else:
                    log(f"⚠️  {t.node} 提交失败(第{t.tries}次)，稍后重试: {msg[:120]}")
                    return

    def poll(self):
        for t in list(self.inflight):
            try:
                t.job = status(t.job, self.cred.kling_base_url, self.token())
                t.jobf.write_text(json.dumps(t.job, ensure_ascii=False, indent=2))
            except Exception as e:
                log(f"⚠️  {t.node} 查询异常（下轮重试）: {str(e)[:100]}")
                continue

            st = t.job.get("status")
            if st == "succeeded" and t.job.get("assetUrl"):
                el = time.monotonic() - t.t0
                self.inflight.remove(t); t.state = "downloading"
                log(f"✅ {t.node} 渲染完成 {el:.0f}s → 后台下载（腾出槽位）")
                self.dl_futures.append(self.pool.submit(self._download, t))
            elif st == "failed":
                self.inflight.remove(t)
                err = str(t.job.get("error") or "")
                # Kling 可能在【渲染阶段】才回吐 1303（提交时明明成功了）。
                # 这不是内容问题，是额度问题 —— 必须退回队列重投，不能判死。
                if is_rate_limited(err) and t.tries < 3:
                    t.tries += 1
                    t.job, t.state, t.t0 = None, "pending", None
                    t.jobf.unlink(missing_ok=True)      # 清掉 job-file，否则 resume 会捡回死任务
                    self.queue.append(t)
                    log(f"🔁 {t.node} 渲染阶段撞额度上限，退回队列重投（第{t.tries}次）")
                else:
                    t.state = "failed"; self.failed.append(t)
                    log(f"❌ {t.node} 渲染失败: {err[:150]}")
            elif t.t0 and time.monotonic() - t.t0 > TIMEOUT:
                self.inflight.remove(t); t.state = "failed"; self.failed.append(t)
                log(f"❌ {t.node} 超时 {TIMEOUT}s（job-file 保留可续跑）")

    def _download(self, t: Task):
        try:
            download(t.job["assetUrl"], t.out)
            mb = t.out.stat().st_size / 1048576
            t.state = "done"; self.done.append(t)
            log(f"⬇️  {t.node} 已落盘 {mb:.1f}MB")
        except Exception as e:
            t.state = "failed"; self.failed.append(t)
            log(f"❌ {t.node} 下载失败: {str(e)[:150]}")

    def run(self):
        n = len(self.tasks)
        log(f"═══ 并行流水线启动：{n} 个任务，并发上限 {MAX_INFLIGHT}（实测硬约束）═══")
        est = -(-n // MAX_INFLIGHT) * 150 / 60
        log(f"    预估约 {est:.0f} 分钟（串行需 {n*150/60:.0f} 分钟）")
        self.resume()
        start = time.monotonic()
        while self.queue or self.inflight:
            self.try_submit()
            if self.inflight:
                time.sleep(POLL_INTERVAL)
                self.poll()
            elif self.queue:
                time.sleep(3)
        for f in self.dl_futures:
            f.result()
        self.pool.shutdown(wait=True)

        el = (time.monotonic() - start) / 60
        log(f"═══ 完成 {len(self.done)}/{n}  失败 {len(self.failed)}  耗时 {el:.1f} 分钟 ═══")
        if self.failed:
            log(f"    失败节点: {[t.node for t in self.failed]}")
        if el > 0 and self.done:
            log(f"    实测提速: 串行预计 {n*150/60:.0f} 分钟 → 实际 {el:.1f} 分钟 "
                f"({n*150/60/max(el,0.1):.1f}×)")
        return len(self.failed) == 0


def build_tasks(shots: dict, frames_dir: Path, out_dir: Path, jobs_dir: Path, prof) -> list[Task]:
    """shots: {node: {"prompt":..., "sec":5}}；首帧缺失则跳过"""
    out_dir.mkdir(parents=True, exist_ok=True); jobs_dir.mkdir(parents=True, exist_ok=True)
    tasks = []
    for node, cfg in shots.items():
        frame = frames_dir / f"{node}_frame.png"
        if not frame.exists():
            log(f"⏭  {node} 缺首帧，跳过"); continue
        req = normalize_request({**prof.get("defaults", {}), **{
            "prompt": cfg["prompt"],
            "image": base64.b64encode(frame.read_bytes()).decode("ascii"),
            "aspectRatio": "9:16", "resolution": "720p",
            "durationSec": cfg.get("sec", 5), "generateAudio": True,
        }})
        tasks.append(Task(node, req, out_dir / f"{node}.mp4", jobs_dir / f"{node}.json"))
    return tasks


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Kling 并行视频流水线")
    ap.add_argument("shots", type=Path, help="JSON: {node:{prompt,sec}}")
    ap.add_argument("--frames", type=Path, default=Path("/tmp/wq_gen/frames"))
    ap.add_argument("--out",    type=Path, default=Path("/tmp/wq_gen/videos"))
    ap.add_argument("--jobs",   type=Path, default=Path("/tmp/wq_gen/jobs"))
    ap.add_argument("--profile", default="kling-3-pro")
    a = ap.parse_args()
    prof = load_profile(a.profile)
    shots = json.loads(a.shots.read_text(encoding="utf-8"))
    tasks = build_tasks(shots, a.frames, a.out, a.jobs, prof)
    if not tasks:
        raise SystemExit("没有可执行任务")
    sys.exit(0 if Pipeline(tasks, a.profile).run() else 1)
