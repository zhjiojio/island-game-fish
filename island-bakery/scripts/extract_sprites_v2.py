#!/usr/bin/env python3
"""精灵重抠 v2.1：连通域归属替代网格等分，修复跨格误切/底色残留/脚底白垫问题。

- 源图集均为透明底（背景 RGB=奶油色），主体 alpha=255（二值）。
- 切分：dil0 连通域 + 质心就近归属；粘连大块按预探测的最小密度列切分。
- 修复项：
  * 烤架 lv3|lv4 粘连 → x=1348 切分（lv3 炉体止于 ~1338，烟囱属四级）
  * NPC 獾|松鼠粘连 → x=1011 切分
  * 椰子榨汁图：奶油/米黄不透明底 → 从透明区泛洪清除；外缘连通暗影 → 清除
  * 金椰(TR)：保留源图开口白色椰肉（旧脚本误杀成黑洞），不做任何内部处理
  * 顾客/主角：底部白色脚垫/白板 → 按连通域+几何特征移除（不伤白肚子/白围裙）
  * NPC 不做白垫移除（避免误删獾厨师围裙等）
  * <150px 漂浮碎片丢弃；全部紧致裁剪；透明像素保留源图奶油 RGB
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets"
PKG_SPR = ROOT / "island-bakery/package/res/Image/sprites"
MANIFEST = ASSETS / "游戏元素清单.json"
BACKUP = ASSETS / "_backup_bad_cutouts_20261108"
CONN8 = np.ones((3, 3), dtype=bool)
MIN_PIECE = 150


def whiteish_mask(arr: np.ndarray) -> np.ndarray:
    rgb = arr[:, :, :3].astype(np.float32)
    lum = rgb.max(axis=2)
    sat = (rgb.max(axis=2) - rgb.min(axis=2)) / (lum + 1e-3)
    return (arr[:, :, 3] > 30) & (lum > 200) & (sat < 0.32)


def film_mask(arr: np.ndarray, keep: np.ndarray) -> np.ndarray:
    rgb = arr[:, :, :3].astype(np.float32)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    lum = rgb.max(axis=2)
    sat = (rgb.max(axis=2) - rgb.min(axis=2)) / (lum + 1e-3)
    return keep & (arr[:, :, 3] > 200) & (lum >= 195) & (sat <= 0.34) \
        & (np.abs(r - g) <= 30) & (b >= 110)


def white_mask(arr: np.ndarray, keep: np.ndarray) -> np.ndarray:
    """烤架白圈：外连白（通过泛洪从透明区清除），封闭白保留。"""
    rgb = arr[:, :, :3].astype(np.float32)
    lum = rgb.max(axis=2)
    sat = (rgb.max(axis=2) - rgb.min(axis=2)) / (lum + 1e-3)
    return keep & (arr[:, :, 3] > 200) & (lum > 202) & (sat < 0.30)


def fill_body(arr: np.ndarray, keep: np.ndarray, label: str, radius: int = 24) -> int:
    """米熊：闭运算桥接轮廓 + fill_holes + 逐行跨度填充，重建 Alpha=0 的白色身体/头毛。"""
    struct = ndimage.generate_binary_structure(2, 2)
    orig = keep.copy()
    m = keep.copy()
    for _ in range(radius):
        m = ndimage.binary_dilation(m, structure=struct)
    for _ in range(radius):
        m = ndimage.binary_erosion(m, structure=struct)
    filled = ndimage.binary_fill_holes(m)
    keep |= filled
    # 逐行跨度填充：行内内容≥25px 且跨度≤420px 时，补齐左右边界之间（脸部口鼻/胸口大间隙）
    for y in range(keep.shape[0]):
        xs = np.where(keep[y])[0]
        if len(xs) >= 25 and (xs.max() - xs.min()) <= 420:
            keep[y, xs.min():xs.max() + 1] = True
    keep |= ndimage.binary_fill_holes(keep)
    added = keep & ~orig
    if added.any():
        arr[added, 3] = 255
        print(f"    [{label}] fillbody +{int(added.sum())} px")
    return int(added.sum())


def dark_mask(arr: np.ndarray, keep: np.ndarray) -> np.ndarray:
    rgb = arr[:, :, :3].astype(np.float32)
    lum = rgb.max(axis=2)
    sat = (rgb.max(axis=2) - rgb.min(axis=2)) / (lum + 1e-3)
    return keep & (arr[:, :, 3] > 200) & (lum < 110) & (sat < 0.55)


def flood_remove(arr: np.ndarray, keep: np.ndarray, target: np.ndarray, label: str) -> int:
    """从透明像素出发，泛洪清除与透明区连通的 target 像素（迭代 3 轮）。"""
    total = 0
    for _ in range(3):
        free = arr[:, :, 3] < 8
        lab, n = ndimage.label(free | target, structure=CONN8)
        if n == 0:
            break
        has_free = np.zeros(n + 1, dtype=bool)
        has_free[1:] = ndimage.maximum(free.astype(np.uint8), lab, np.arange(1, n + 1)) > 0
        kill = target & has_free[lab]
        if not kill.any():
            break
        keep &= ~kill
        arr[kill, 3] = 0
        total += int(kill.sum())
    if total:
        print(f"    [{label}] flood removed {total} px")
    return total


def remove_pads(arr: np.ndarray, keep: np.ndarray, label: str) -> int:
    """移除底部白色脚垫：白色连通块、高≤60、宽≥25、面积≥150、贴底、宽高比≥0.8。"""
    rows_idx = np.where(keep.any(axis=1))[0]
    if not len(rows_idx):
        return 0
    bottom = int(rows_idx.max())
    wm = whiteish_mask(arr) & keep
    if not wm.any():
        return 0
    lab, n = ndimage.label(wm, structure=CONN8)
    objs = ndimage.find_objects(lab)
    removed = 0
    for i, sl in enumerate(objs):
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        comp = lab[sl] == i + 1
        area = int(comp.sum())
        if (area >= 150 and h <= 60 and w >= 25 and w / max(h, 1) >= 0.8
                and sl[0].stop - 1 >= bottom - 5):
            kill = comp & keep[sl]
            keep[sl] = keep[sl] & ~kill
            sl_full = np.zeros_like(wm)
            sl_full[sl] = kill
            arr[sl_full, 3] = 0
            removed += area
            print(f"    [{label}] removed pad {w}x{h}px at x[{sl[1].start}:{sl[1].stop}] area={area}")
    return removed


def extract_with(cfg: dict, zs: list) -> None:
    src: Path = ASSETS / cfg["src"]
    arr_full = np.array(Image.open(src).convert("RGBA"))
    H, W = arr_full.shape[:2]
    cuts: list[int] = cfg.get("cuts", [])

    mask = arr_full[:, :, 3] > 8
    lab, n = ndimage.label(mask, structure=CONN8)
    print(f"=== {cfg['src']}: {n} raw comps")

    pieces = []
    for i in range(1, n + 1):
        comp = lab == i
        if comp.sum() < MIN_PIECE:
            continue
        ys, xs = np.where(comp)
        x0, x1 = int(xs.min()), int(xs.max())
        segs = [(x0, x1)]
        for c in sorted(cuts):
            new = []
            for a, b in segs:
                if a < c < b:
                    new.extend([(a, c), (c, b)])
                else:
                    new.append((a, b))
            segs = new
        for a, b in segs:
            seg_mask = comp & (np.arange(W)[None, :] >= a) & (np.arange(W)[None, :] < b)
            if seg_mask.sum() < MIN_PIECE:
                continue
            pys, pxs = np.where(seg_mask)
            pieces.append((seg_mask, (int(pxs.min()), int(pxs.max()),
                                      int(pys.min()), int(pys.max()))))

    assign: list[list[int]] = [[] for _ in zs]
    for idx, (seg_mask, (px0, px1, py0, py1)) in enumerate(pieces):
        pys, pxs = np.where(seg_mask)
        cx, cy = float(pxs.mean()), float(pys.mean())
        best = min(range(len(zs)), key=lambda k: (zs[k][0] - cx) ** 2 + (zs[k][1] - cy) ** 2)
        assign[best].append(idx)
        print(f"    piece x[{px0}:{px1}]y[{py0}:{py1}] px={int(seg_mask.sum())} -> {cfg['sprites'][best]['file']}")

    for zi, spr in enumerate(cfg["sprites"]):
        keep = np.zeros((H, W), dtype=bool)
        for idx in assign[zi]:
            keep |= pieces[idx][0]
        out = arr_full.copy()
        out[:, :, 3] = np.where(keep, arr_full[:, :, 3], 0).astype(np.uint8)

        for c in spr.get("cleanup", []):
            if c == "film":
                flood_remove(out, keep, film_mask(out, keep), spr["file"])
            elif c == "dark":
                flood_remove(out, keep, dark_mask(out, keep), spr["file"])
            elif c == "whitering":
                flood_remove(out, keep, white_mask(out, keep), spr["file"])
            elif c == "pads":
                remove_pads(out, keep, spr["file"])
            elif c == "fillbody":
                fill_body(out, keep, spr["file"])

        ys, xs = np.where(out[:, :, 3] > 8)
        if not len(ys):
            print(f"    !! EMPTY {spr['file']}")
            continue
        y0, y1, x0, x1 = int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max())
        crop = out[y0:y1 + 1, x0:x1 + 1]
        out_path = ASSETS / spr["path"]
        out_path.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(crop).save(out_path, optimize=True)
        if spr.get("gameId"):
            PKG_SPR.mkdir(parents=True, exist_ok=True)
            Image.fromarray(crop).save(PKG_SPR / f"{spr['gameId']}.png", optimize=True)
        print(f"    => {spr['file']} {crop.shape[1]}x{crop.shape[0]} opaque={(crop[:, :, 3] > 8).mean():.0%}")


G2 = [(256, 384), (1536, 384), (256, 1152), (1536, 1152)]
G4x2 = [(341, 384), (1024, 384), (1707, 384), (341, 1152), (1024, 1152), (1707, 1152)]

ATLASES = [
    {
        "src": "道具/烤架图集.png", "grid": (4, 1), "cuts": [1430],
        "zones_override": [(256, 576), (768, 576), (1280, 576), (1792, 576)],
        "sprites": [
            {"file": "烤架-一级.png", "gameId": "grill_lv1", "zh": "一级烤架", "path": "道具/烤架/烤架-一级.png", "cleanup": ["whitering"]},
            {"file": "烤架-二级.png", "gameId": "grill_lv2", "zh": "二级烤架", "path": "道具/烤架/烤架-二级.png", "cleanup": ["whitering"]},
            {"file": "烤架-三级.png", "gameId": "grill_lv3", "zh": "三级烤架", "path": "道具/烤架/烤架-三级.png", "cleanup": ["whitering"]},
            {"file": "烤架-四级.png", "gameId": "grill_lv4", "zh": "四级烤架", "path": "道具/烤架/烤架-四级.png", "cleanup": ["whitering"]},
        ],
    },
    {
        "src": "道具/椰子图集.png", "grid": (2, 2), "cuts": [],
        "zones_override": G2,
        "sprites": [
            {"file": "椰子-青椰.png", "gameId": "coconut_green", "zh": "青椰原料", "path": "道具/椰子/椰子-青椰.png"},
            {"file": "椰子-金椰.png", "gameId": "coconut_golden", "zh": "金椰原料", "path": "道具/椰子/椰子-金椰.png"},
            {"file": "椰子-青椰-榨汁.png", "gameId": "coconut_green_juiced", "zh": "青椰榨汁",
             "path": "道具/椰子/椰子-青椰-榨汁.png", "cleanup": ["film", "dark"]},
            {"file": "椰子-金椰-榨汁.png", "gameId": "coconut_golden_juiced", "zh": "金椰榨汁",
             "path": "道具/椰子/椰子-金椰-榨汁.png", "cleanup": ["film", "dark"]},
        ],
    },
    {
        "src": "角色/顾客图集.png", "grid": (5, 1), "cuts": [],
        "zones_override": [(205, 576), (614, 576), (1024, 576), (1434, 576), (1843, 576)],
        "sprites": [
            {"file": "顾客-蓝熊.png", "gameId": "customer_bear_blue", "zh": "蓝熊",
             "path": "角色/顾客/顾客-蓝熊.png", "cleanup": ["pads"]},
            {"file": "顾客-米熊.png", "gameId": "customer_bear_cream", "zh": "米熊",
             "path": "角色/顾客/顾客-米熊.png", "cleanup": ["fillbody"]},
            {"file": "顾客-粉猪.png", "gameId": "customer_pig", "zh": "粉猪",
             "path": "角色/顾客/顾客-粉猪.png", "cleanup": ["pads"]},
            {"file": "顾客-企鹅.png", "gameId": "customer_penguin", "zh": "企鹅",
             "path": "角色/顾客/顾客-企鹅.png", "cleanup": ["pads"]},
            {"file": "顾客-狐狸.png", "gameId": "customer_fox", "zh": "狐狸",
             "path": "角色/顾客/顾客-狐狸.png", "cleanup": ["pads"]},
        ],
    },
    {
        "src": "角色/特殊NPC图集.png", "grid": (4, 1), "cuts": [1011],
        "zones_override": [(256, 576), (768, 576), (1280, 576), (1792, 576)],
        "sprites": [
            {"file": "特殊NPC-鹿.png", "gameId": "npc_deer", "zh": "鹿", "path": "角色/特殊NPC/特殊NPC-鹿.png"},
            {"file": "特殊NPC-獾厨师.png", "gameId": "npc_badger_chef", "zh": "獾厨师",
             "path": "角色/特殊NPC/特殊NPC-獾厨师.png"},
            {"file": "特殊NPC-松鼠.png", "gameId": "npc_squirrel", "zh": "松鼠",
             "path": "角色/特殊NPC/特殊NPC-松鼠.png"},
            {"file": "特殊NPC-乌龟渔夫.png", "gameId": "npc_turtle", "zh": "乌龟渔夫",
             "path": "角色/特殊NPC/特殊NPC-乌龟渔夫.png"},
        ],
    },
    {
        "src": "角色/兔子主角.png", "grid": (4, 1), "cuts": [],
        "zones_override": [(256, 576), (768, 576), (1280, 576), (1792, 576)],
        "sprites": [
            {"file": "主角-兔子烤鱼师.png", "gameId": "hero_rabbit", "zh": "正面",
             "path": "角色/主角/主角-兔子烤鱼师.png", "cleanup": ["pads"]},
            {"file": "主角-兔子-侧面.png", "gameId": "hero_rabbit_side", "zh": "侧面",
             "path": "角色/主角/主角-兔子-侧面.png", "cleanup": ["pads"]},
            {"file": "主角-兔子-背面.png", "gameId": "hero_rabbit_back", "zh": "背面",
             "path": "角色/主角/主角-兔子-背面.png", "cleanup": ["pads"]},
            {"file": "主角-兔子-部件.png", "gameId": "hero_rabbit_parts", "zh": "部件",
             "path": "角色/主角/主角-兔子-部件.png", "cleanup": ["pads"]},
        ],
    },
    {
        "src": "道具/作物图集.png", "grid": (2, 2), "cuts": [],
        "zones_override": G2,
        "sprites": [
            {"file": "作物-小麦.png", "gameId": "crop_wheat", "zh": "小麦", "path": "道具/作物/作物-小麦.png"},
            {"file": "作物-番茄.png", "gameId": "crop_tomato", "zh": "番茄", "path": "道具/作物/作物-番茄.png"},
            {"file": "作物-胡萝卜.png", "gameId": "crop_carrot", "zh": "胡萝卜", "path": "道具/作物/作物-胡萝卜.png"},
            {"file": "作物-草莓.png", "gameId": "crop_strawberry", "zh": "草莓", "path": "道具/作物/作物-草莓.png"},
        ],
    },
    {
        "src": "道具/天气图集.png", "grid": (4, 1), "cuts": [],
        "zones_override": [(262, 768), (773, 768), (1273, 768), (1778, 768)],
        "sprites": [
            {"file": "天气-晴天.png", "gameId": "weather_sunny", "zh": "晴天", "path": "道具/天气/天气-晴天.png"},
            {"file": "天气-雨天.png", "gameId": "weather_rain", "zh": "雨天", "path": "道具/天气/天气-雨天.png"},
            {"file": "天气-暴风雨.png", "gameId": "weather_storm", "zh": "暴风雨", "path": "道具/天气/天气-暴风雨.png"},
            {"file": "天气-彩虹天.png", "gameId": "weather_rainbow", "zh": "彩虹天", "path": "道具/天气/天气-彩虹天.png"},
        ],
    },
    {
        "src": "道具/菜园图集.png", "grid": (3, 2), "cuts": [],
        "zones_override": G4x2,
        "sprites": [
            {"file": "菜园-左上.png", "gameId": "garden_plot_1", "zh": "菜园左上", "path": "道具/菜园/菜园-左上.png"},
            {"file": "菜园-中上.png", "gameId": "garden_plot_2", "zh": "菜园中上", "path": "道具/菜园/菜园-中上.png"},
            {"file": "菜园-右上.png", "gameId": "garden_plot_3", "zh": "菜园右上", "path": "道具/菜园/菜园-右上.png"},
            {"file": "菜园-左下.png", "gameId": "garden_plot_4", "zh": "菜园左下", "path": "道具/菜园/菜园-左下.png"},
            {"file": "菜园-中下.png", "gameId": "garden_plot_5", "zh": "菜园中下", "path": "道具/菜园/菜园-中下.png"},
            {"file": "菜园-右下.png", "gameId": "garden_plot_6", "zh": "菜园右下", "path": "道具/菜园/菜园-右下.png"},
        ],
    },
]


def main() -> None:
    # 备份旧抠图（仅首次）
    for sub in ["道具/烤架", "道具/椰子", "角色/顾客", "角色/主角", "角色/特殊NPC"]:
        src_dir = ASSETS / sub
        dst = BACKUP / sub
        if src_dir.is_dir() and not dst.is_dir():
            dst.mkdir(parents=True, exist_ok=True)
            for f in src_dir.glob("*.png"):
                shutil.copy2(f, dst / f.name)
            print(f"backup {sub} -> {dst}")

    manifest = {"version": 5, "sprites": {}}
    old = {}
    if MANIFEST.is_file():
        try:
            old = json.loads(MANIFEST.read_text(encoding="utf-8")).get("sprites", {})
        except Exception:
            old = {}
    for cfg in ATLASES:
        extract_with(cfg, cfg["zones_override"])
        for spr in cfg["sprites"]:
            entry = {k: v for k, v in spr.items() if k not in ("cleanup",)}
            entry["package"] = f"sprites/{spr['gameId']}.png"
            manifest["sprites"][spr["gameId"]] = entry
    # 保留未处理的旧条目（烤鱼成品/鱼种）
    for gid, e in old.items():
        if gid not in manifest["sprites"]:
            manifest["sprites"][gid] = e
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", MANIFEST)


if __name__ == "__main__":
    sys.exit(main())
