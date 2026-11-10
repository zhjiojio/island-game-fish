#!/usr/bin/env python3
"""收尾验证：侧面底部、新拆分元素清单与统计。"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL.Image import open as open_img

ROOT = Path(__file__).resolve().parents[2] / "assets"


def fine(rel: str, cols: int, rows: int, label: str, box: tuple | None = None) -> None:
    p = ROOT / rel
    if not p.is_file():
        print(f"--- {label}: MISSING {rel}")
        return
    arr = np.array(open_img(p).convert("RGBA"))
    if box:
        x0, x1, y0, y1 = box
        arr = arr[y0:y1, x0:x1]
    h, w = arr.shape[:2]
    print(f"--- {label} {rel} {w}x{h}")
    cys = np.linspace(0, h, rows + 1).astype(int)
    cxs = np.linspace(0, w, cols + 1).astype(int)
    for r in range(rows):
        line = []
        for c in range(cols):
            cell = arr[cys[r]:cys[r + 1], cxs[c]:cxs[c + 1]]
            m = cell[:, :, 3] > 8
            if not m.any():
                line.append(" ")
                continue
            px = cell[m][:, :3].astype(np.float32)
            lum = px.max(axis=1)
            sat = (px.max(axis=1) - px.min(axis=1)) / (lum + 1e-3)
            if ((lum > 205) & (sat < 0.32)).mean() > 0.5:
                line.append("W")
            elif (lum < 100).mean() > 0.5:
                line.append("K")
            else:
                line.append("#")
        print("".join(line))


def list_all() -> None:
    for sub in ["道具/烤架", "道具/椰子", "道具/作物", "道具/天气", "道具/菜园",
                "角色/顾客", "角色/主角", "角色/特殊NPC"]:
        d = ROOT / sub
        files = sorted(d.glob("*.png")) if d.is_dir() else []
        print(f"[{sub}] {len(files)} 个文件:")
        for f in files:
            arr = np.array(open_img(f).convert("RGBA"))
            m = arr[:, :, 3] > 8
            ys, xs = np.where(m)
            ok = "OK" if m.sum() > 1000 else "!!TINY"
            edge = all([(xs.min() <= 2), (xs.max() >= arr.shape[1] - 3),
                        (ys.min() <= 2), (ys.max() >= arr.shape[0] - 3)])
            print(f"    {f.name:28s} {arr.shape[1]:4d}x{arr.shape[0]:4d} opaque={int(m.sum()):7d} "
                  f"tight={'Y' if edge else 'N'} {ok}")


def main() -> None:
    fine("角色/主角/主角-兔子-侧面.png", 60, 22, "主角-侧面全幅", None)
    fine("角色/顾客/顾客-蓝熊.png", 60, 22, "蓝熊底部", (0, 444, 520, 691))
    list_all()


if __name__ == "__main__":
    sys.exit(main())
