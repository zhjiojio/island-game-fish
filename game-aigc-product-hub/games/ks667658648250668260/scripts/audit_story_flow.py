#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""剧情衔接体检

查三类「对不上」：
  A 结构断裂：next/选项指向不存在的节点、节点不可达、死胡同
  B 文本与视频不符：节点 text 的台词 与 该节点视频的 ASR 识别内容 差异过大
  C 语速过快：ASR 字数 / 说话时长 > 4.8 字/秒
"""
import json, glob, os, re, sys
from collections import deque

ASR_DIRS = ["/tmp/wq_gen/asr82", "/tmp/wq_gen/asr82old"]
FAST = 4.8


def load_story():
    D = {}
    for f in glob.glob("content/episodes/*.json"):
        for k, v in json.load(open(f)).items():
            v["_file"] = os.path.basename(f)
            D[k] = v
    return D


def outs(n):
    """一个节点所有出边（next + 各类选项）"""
    r = []
    if n.get("next"):
        r.append(n["next"])
    for key in ("choices", "options"):
        for c in n.get(key) or []:
            if isinstance(c, dict):
                for kk in ("next", "to", "goto", "target"):
                    if c.get(kk):
                        r.append(c[kk])
                fb = c.get("feedback") or {}
                if isinstance(fb, dict) and fb.get("next"):
                    r.append(fb["next"])
    return r


def asr_of(key):
    for d in ASR_DIRS:
        p = os.path.join(d, key + ".json")
        if os.path.exists(p):
            return json.load(open(p))
    return None


def clean(t):
    return re.sub(r"[^\u4e00-\u9fa5]", "", t or "")


def main():
    D = load_story()
    print(f"节点 {len(D)} 个\n")

    # A 结构
    dangling, dead = [], []
    for k, n in D.items():
        for t in outs(n):
            if t not in D:
                dangling.append((k, t))
        if not outs(n) and not n.get("ending") and n.get("kind") != "ending":
            dead.append(k)

    # 起点是 op1（EP01 第一个节点），不是 "start" —— 用错起点会把 365 个全判成不可达
    starts = [k for k in ("op1", "s1") if k in D] or [next(iter(D))]
    seen, q = set(), deque(starts)
    while q:
        c = q.popleft()
        if c in seen or c not in D:
            continue
        seen.add(c)
        for t in outs(D[c]):
            q.append(t)
    orphan = sorted(set(D) - seen)

    print("══════ A 结构衔接 ══════")
    print(f"悬空引用 {len(dangling)}  死胡同 {len(dead)}  不可达 {len(orphan)}")
    for k, t in dangling[:15]:
        print(f"  悬空: {k} → {t}（不存在）")
    if orphan:
        print(f"  不可达样例: {orphan[:15]}")

    # B / C 视频与文本
    mismatch, fast = [], []
    for k, n in sorted(D.items()):
        m = n.get("media") or {}
        f = m.get("file", "")
        if not f.endswith(".mp4"):
            continue
        base = re.sub(r"(\.c|_v82|\.v2|_v2)+$", "", f.rsplit("/", 1)[1][:-4])
        a = asr_of(base)
        if not a:
            continue
        heard, script = clean(a.get("text")), clean(n.get("text"))
        segs = a.get("segments") or []
        if segs:
            sp = segs[-1]["end"] - segs[0]["start"]
            rate = len(heard) / max(sp, 0.1)
            if rate > FAST:
                fast.append((rate, k, len(heard), sp))
        if script and heard:
            ov = len(set(heard) & set(script)) / max(len(set(script)), 1)
            if ov < 0.45:
                mismatch.append((ov, k, script[:34], heard[:34]))

    print("\n══════ B 视频台词 vs 节点文本 ══════")
    print(f"重合度 <45% 的 {len(mismatch)} 个")
    for ov, k, s, h in sorted(mismatch)[:15]:
        print(f"  [{ov*100:3.0f}%] {k}")
        print(f"        文本: {s}")
        print(f"        听到: {h}")

    print("\n══════ C 语速 ══════")
    print(f">{FAST} 字/秒 的 {len(fast)} 个")
    for r, k, n_, s in sorted(fast, reverse=True)[:12]:
        print(f"  {r:4.1f} 字/秒  {k:20s} {n_}字/{s:.1f}s")

    return 0


if __name__ == "__main__":
    sys.exit(main())
