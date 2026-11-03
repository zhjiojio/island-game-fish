#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CDN 素材体积全量体检

只做度量与分级，不改任何东西。判定阈值按小游戏加载体验定：
  mp4  > 1.5MB   偏大（10s/540p/crf30 正常在 0.3~1.2MB）
  png  > 300KB   偏大（多数是可转 jpg 或该 pngquant 的静图）
  jpg  > 400KB   偏大
"""
import re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

LIMIT = {"mp4": 1_500_000, "png": 300_000, "jpg": 400_000, "jpeg": 400_000,
         "webp": 300_000, "mp3": 800_000, "m4a": 800_000}


def head(url: str):
    """取 content-length；部分节点只在 range 请求下给 content-range"""
    r = subprocess.run(["curl", "-sI", "-m", "25", url], capture_output=True, text=True)
    h = r.stdout
    code = (h.split("\n", 1)[0].split() + ["?"])[1] if h else "ERR"
    m = re.search(r"content-length:\s*(\d+)", h, re.I)
    if not m:
        r2 = subprocess.run(["curl", "-sI", "-r", "0-1", "-m", "25", url],
                            capture_output=True, text=True)
        m = re.search(r"content-range:\s*bytes\s+\S+/(\d+)", r2.stdout, re.I)
    return url, code, int(m.group(1)) if m else -1


def main():
    urls = [l.strip() for l in Path(sys.argv[1]).read_text().splitlines() if l.strip()]
    print(f"体检 {len(urls)} 个 CDN 素材…\n")
    rows = []
    with ThreadPoolExecutor(max_workers=16) as ex:
        for url, code, size in ex.map(head, urls):
            rows.append((url, code, size))

    ext_of = lambda u: u.rsplit(".", 1)[1].lower()
    bad  = [r for r in rows if r[2] < 0]
    big  = [r for r in rows if r[2] >= 0 and r[2] > LIMIT.get(ext_of(r[0]), 10**9)]
    total = sum(r[2] for r in rows if r[2] > 0)

    by = {}
    for u, c, s in rows:
        if s > 0:
            e = ext_of(u); d = by.setdefault(e, [0, 0]); d[0] += 1; d[1] += s
    print("── 分类汇总 ──")
    for e, (n, s) in sorted(by.items(), key=lambda x: -x[1][1]):
        print(f"  {e:5s} {n:4d} 个   {s/1048576:8.1f} MB   均 {s/n/1024:7.0f} KB")
    print(f"  合计 {total/1048576:.1f} MB\n")

    if big:
        print(f"── 超阈值 {len(big)} 个（按大小降序）──")
        for u, c, s in sorted(big, key=lambda x: -x[2]):
            print(f"  {s/1048576:6.2f} MB  {u.rsplit('/',1)[1]}")
    else:
        print("── 无超阈值素材 ──")
    if bad:
        print(f"\n── 取不到大小 {len(bad)} 个 ──")
        for u, c, s in bad: print(f"  [{c}] {u.rsplit('/',1)[1]}")

    Path("/tmp/audit_sizes.tsv").write_text(
        "\n".join(f"{s}\t{c}\t{u}" for u, c, s in sorted(rows, key=lambda x: -x[2])),
        encoding="utf-8")
    print("\n明细 → /tmp/audit_sizes.tsv")


if __name__ == "__main__":
    main()
