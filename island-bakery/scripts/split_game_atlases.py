#!/usr/bin/env python3
"""附录图集 → 单张透明精灵 + 游戏 ID 命名（按真实排版：横排黑底等）。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

import numpy as np
from PIL import Image

import sys

sys.path.insert(0, str(Path(__file__).parent))
from alpha_key_ui_png import (  # noqa: E402
    key_character_cell,
    key_coconut_cell,
    key_grill_cell,
    key_grilled_cell,
    key_sprite_cell,
)

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets"
PKG_SPR = ROOT / "island-bakery/package/res/Image/sprites"
MANIFEST = ASSETS / "游戏元素清单.json"

KEY_FN: dict[str, Callable[[np.ndarray], np.ndarray]] = {
    "paper": key_sprite_cell,
    "character": key_character_cell,
    "grill": key_grill_cell,
    "grilled": key_grilled_cell,
    "coconut": key_coconut_cell,
}

ATLASES = [
    {
        "src": ASSETS / "道具/烤架图集.png",
        "out_dir": ASSETS / "道具/烤架",
        "grid": (4, 1),
        "key": "grill",
        "cells": [
            {"col": 0, "row": 0, "file": "烤架-一级.png", "gameId": "grill_lv1", "zh": "一级烤架"},
            {"col": 1, "row": 0, "file": "烤架-二级.png", "gameId": "grill_lv2", "zh": "二级烤架"},
            {"col": 2, "row": 0, "file": "烤架-三级.png", "gameId": "grill_lv3", "zh": "三级烤架"},
            {"col": 3, "row": 0, "file": "烤架-四级.png", "gameId": "grill_lv4", "zh": "四级烤架"},
        ],
    },
    {
        "src": ASSETS / "道具/烤鱼成品图集.png",
        "out_dir": ASSETS / "道具/烤鱼成品",
        "grid": (2, 2),
        "key": "grilled",
        "cells": [
            {"col": 0, "row": 0, "file": "烤鱼成品-小海鱼.png", "gameId": "grilled_small", "speciesId": "small"},
            {"col": 1, "row": 0, "file": "烤鱼成品-三文鱼.png", "gameId": "grilled_salmon", "speciesId": "salmon"},
            {"col": 0, "row": 1, "file": "烤鱼成品-金枪鱼.png", "gameId": "grilled_tuna", "speciesId": "tuna"},
            {"col": 1, "row": 1, "file": "烤鱼成品-金色传说.png", "gameId": "grilled_golden", "speciesId": "golden"},
        ],
        "pkg_atlas": PKG_SPR.parent / "e4_grilled_fish.png",
    },
    {
        "src": ASSETS / "道具/椰子图集.png",
        "out_dir": ASSETS / "道具/椰子",
        "grid": (2, 2),
        "key": "coconut",
        "cells": [
            {"col": 0, "row": 0, "file": "椰子-青椰.png", "gameId": "coconut_green", "use": "青椰原料"},
            {"col": 1, "row": 0, "file": "椰子-金椰.png", "gameId": "coconut_golden", "use": "金椰原料"},
            {"col": 0, "row": 1, "file": "椰子-青椰-榨汁.png", "gameId": "coconut_green_juiced", "use": "青椰敲开榨汁"},
            {"col": 1, "row": 1, "file": "椰子-金椰-榨汁.png", "gameId": "coconut_golden_juiced", "use": "金椰敲开榨汁"},
        ],
        "pkg_atlas": PKG_SPR.parent / "e3_coconuts.png",
    },
    {
        "src": ASSETS / "图鉴/鱼种图集.png",
        "out_dir": ASSETS / "图鉴/鱼种",
        "grid": (2, 2),
        "key": "paper",
        "cells": [
            {"col": 0, "row": 0, "file": "鱼种-小海鱼-生.png", "gameId": "fish_raw_small", "speciesId": "small"},
            {"col": 1, "row": 0, "file": "鱼种-三文鱼-生.png", "gameId": "fish_raw_salmon", "speciesId": "salmon"},
            {"col": 0, "row": 1, "file": "鱼种-金枪鱼-生.png", "gameId": "fish_raw_tuna", "speciesId": "tuna"},
            {"col": 1, "row": 1, "file": "鱼种-金色传说-生.png", "gameId": "fish_raw_golden", "speciesId": "golden"},
        ],
        "pkg_atlas": PKG_SPR.parent / "e1_fish_icons.png",
    },
    {
        "src": ASSETS / "角色/顾客图集.png",
        "out_dir": ASSETS / "角色/顾客",
        "grid": (5, 1),
        "key": "character",
        "cells": [
            {"col": 0, "row": 0, "file": "顾客-蓝熊.png", "gameId": "customer_bear_blue"},
            {"col": 1, "row": 0, "file": "顾客-米熊.png", "gameId": "customer_bear_cream"},
            {"col": 2, "row": 0, "file": "顾客-粉猪.png", "gameId": "customer_pig"},
            {"col": 3, "row": 0, "file": "顾客-企鹅.png", "gameId": "customer_penguin"},
            {"col": 4, "row": 0, "file": "顾客-狐狸.png", "gameId": "customer_fox"},
        ],
    },
    {
        "src": ASSETS / "角色/特殊NPC图集.png",
        "out_dir": ASSETS / "角色/特殊NPC",
        "grid": (4, 1),
        "key": "character",
        "cells": [
            {"col": 0, "row": 0, "file": "特殊NPC-鹿.png", "gameId": "npc_deer"},
            {"col": 1, "row": 0, "file": "特殊NPC-獾厨师.png", "gameId": "npc_badger_chef"},
            {"col": 2, "row": 0, "file": "特殊NPC-松鼠.png", "gameId": "npc_squirrel"},
            {"col": 3, "row": 0, "file": "特殊NPC-乌龟渔夫.png", "gameId": "npc_turtle"},
        ],
    },
    {
        "src": ASSETS / "角色/兔子主角.png",
        "out_dir": ASSETS / "角色/主角",
        "grid": (4, 1),
        "key": "character",
        "cells": [
            {"col": 0, "row": 0, "file": "主角-兔子烤鱼师.png", "gameId": "hero_rabbit", "zh": "正面"},
            {"col": 1, "row": 0, "file": "主角-兔子-侧面.png", "gameId": "hero_rabbit_side"},
            {"col": 2, "row": 0, "file": "主角-兔子-背面.png", "gameId": "hero_rabbit_back"},
            {"col": 3, "row": 0, "file": "主角-兔子-部件.png", "gameId": "hero_rabbit_parts"},
        ],
    },
]


def column_bounds(im: Image.Image, ncol: int) -> list[tuple[int, int]]:
    """按透明列间隙切横排（避免等分裁到邻角色）。"""
    arr = np.array(im.convert("RGBA"))
    density = (arr[:, :, 3] > 12).mean(axis=0)
    w = arr.shape[1]
    margin = max(8, w // 40)
    xs = np.arange(margin, w - margin)
    valleys = []
    win = max(3, w // 200)
    for x in xs:
        seg = density[max(0, x - win) : min(w, x + win + 1)]
        if seg.mean() < 0.02:
            valleys.append(int(x))
    if len(valleys) < ncol - 1:
        cw = w // ncol
        return [(i * cw, (i + 1) * cw) for i in range(ncol)]
    clusters: list[list[int]] = []
    for x in valleys:
        if not clusters or x - clusters[-1][-1] > win * 3:
            clusters.append([x])
        else:
            clusters[-1].append(x)
    centers = [int(sum(c) / len(c)) for c in clusters]
    if len(centers) < ncol - 1:
        cw = w // ncol
        return [(i * cw, (i + 1) * cw) for i in range(ncol)]
    centers = sorted(centers, key=lambda t: abs(t - w / 2))[: ncol - 1]
    centers.sort()
    bounds = [0] + centers + [w]
    return [(bounds[i], bounds[i + 1]) for i in range(ncol)]


def split_one(cfg: dict, manifest: dict) -> None:
    src: Path = cfg["src"]
    if not src.is_file():
        print("skip missing", src)
        return
    im = Image.open(src)
    w, h = im.size
    gc, gr = cfg["grid"]
    col_boxes = column_bounds(im, gc) if gr == 1 and gc > 1 else None
    cw, ch = w // gc, h // gr
    key_name = cfg.get("key", "paper")
    keyer = KEY_FN.get(key_name, key_sprite_cell)
    atlas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out_dir: Path = cfg["out_dir"]
    out_dir.mkdir(parents=True, exist_ok=True)
    PKG_SPR.mkdir(parents=True, exist_ok=True)
    for cell in cfg["cells"]:
        if col_boxes and cell["row"] == 0:
            x0, x1 = col_boxes[cell["col"]]
            box = (x0, 0, x1, h)
        else:
            box = (
                cell["col"] * cw,
                cell["row"] * ch,
                (cell["col"] + 1) * cw,
                (cell["row"] + 1) * ch,
            )
        arr = np.array(im.crop(box).convert("RGBA"))
        keyed = keyer(arr)
        out_path = out_dir / cell["file"]
        Image.fromarray(keyed).save(out_path, optimize=True)
        pkg_copy = PKG_SPR / f"{cell['gameId']}.png"
        Image.fromarray(keyed).save(pkg_copy, optimize=True)
        atlas.paste(Image.fromarray(keyed), box[:2])
        entry = {k: v for k, v in cell.items() if k not in ("col", "row")}
        entry["path"] = str(out_path.relative_to(ASSETS))
        entry["package"] = f"sprites/{cell['gameId']}.png"
        manifest[cell["gameId"]] = entry
        print("split", cell["gameId"], out_path.name)
    if cfg.get("pkg_atlas"):
        atlas.save(cfg["pkg_atlas"], optimize=True)


def cleanup_coconut_legacy() -> None:
    legacy = [
        ASSETS / "道具/椰子/椰子-青椰-原料.png",
        ASSETS / "道具/椰子/椰子-金椰-原料.png",
        ASSETS / "道具/椰子/椰子-开口椰-榨汁.png",
        ASSETS / "道具/椰子/椰子-椰子汁杯-商品.png",
        ASSETS / "道具/椰子/椰子汁杯.png",
        ASSETS / "道具/椰子/开口椰.png",
        ASSETS / "道具/椰子/青椰.png",
        ASSETS / "道具/椰子/金椰.png",
    ]
    for p in legacy:
        if p.is_file():
            p.unlink()
            print("removed legacy", p.name)


def main() -> None:
    cleanup_coconut_legacy()
    manifest = {"version": 3, "sprites": {}}
    for cfg in ATLASES:
        split_one(cfg, manifest["sprites"])
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", MANIFEST)


if __name__ == "__main__":
    main()
