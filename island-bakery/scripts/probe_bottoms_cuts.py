#!/usr/bin/env python3
"""企鹅/蓝熊/主角底部精细视图 + 烤架 1300-1420 精确切线。"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL.Image import open as open_img

ROOT = Path(__file__).resolve().parents[2] / "assets"


def fine(rel: str, box: tuple[int, int, int, int], cols: int, rows: int, label: str) -> None:
    x0, x1, y0, y1 = box
    arr = np.array(open_img(ROOT / rel).convert("RGBA"))[y0:y1, x0:x1]
    h, w = arr.shape[:2]
    print(f"--- {label} [{box}] ({w}x{h})")
    cys = np.linspace(0, h, rows + 1).astype(int)
    cxs = np.linspace(0, w, cols + 1).astype(int)
    for r in range(rows):
        line = []
        for c in range(cols):
            cell = arr[cys[r]:cys[r + 1], cxs[c]:cxs[c + 1]]
            a = cell[:, :, 3] > 8
            if not a.any():
                line.append(" ")
                continue
            m = a
            px = cell[m][:, :3].astype(np.float32)
            mr, mg, mb = px[:, 0], px[:, 1], px[:, 2]
            lum = px.max(axis=1)
            sat = (px.max(axis=1) - px.min(axis=1)) / (lum + 1e-3)
            white = (lum > 205) & (sat < 0.30)
            dark = lum < 90
            wf = white.mean()
            if wf > 0.5:
                line.append("W")
            elif dark.mean() > 0.5:
                line.append("K")
            else:
                line.append("#")
        print("".join(line))


def main() -> None:
    C = "角色/顾客图集.png"
    fine(C, (1150, 1650, 780, 945), 80, 24, "企鹅底部150px")
    fine(C, (100, 470, 780, 945), 80, 24, "蓝熊底部")
    fine(C, (800, 1210, 780, 950), 80, 24, "粉猪底部")
    fine(C, (1560, 2040, 770, 945), 80, 24, "狐狸底部")
    fine(C, (440, 860, 780, 945), 80, 24, "米熊底部")
    H = "角色/兔子主角.png"
    fine(H, (100, 720, 900, 1065), 80, 24, "主角-正面底部")
    fine(H, (700, 1130, 900, 1060), 60, 20, "主角-侧面底部")
    fine(H, (1080, 1790, 910, 1075), 80, 20, "主角-背面底部")
    N = "角色/特殊NPC图集.png"
    fine(N, (0, 580, 940, 1090), 70, 18, "NPC-鹿底部")
    fine(N, (470, 1040, 920, 1070), 70, 18, "NPC-獾底部")
    fine(N, (1000, 1490, 910, 1060), 70, 18, "NPC-松鼠底部")
    fine(N, (1430, 2050, 920, 1090), 70, 18, "NPC-乌龟底部")

    # 烤架精确切线
    arr = np.array(open_img(ROOT / "道具/烤架图集.png").convert("RGBA"))
    dens = (arr[:, :, 3] > 8).mean(axis=0)
    print("--- 烤架 x[1250:1450] 密度（每 5 列）:")
    print("  " + " ".join(f"{x}:{dens[x]:.3f}" for x in range(1250, 1450, 5)))
    print("--- 烤架 x[1250:1450] 仅 y>=760 的密度（下半段）:")
    m = arr[760:, :, 3] > 8
    d2 = m.mean(axis=0)
    print("  " + " ".join(f"{x}:{d2[x]:.3f}" for x in range(1250, 1450, 5)))


if __name__ == "__main__":
    sys.exit(main())
