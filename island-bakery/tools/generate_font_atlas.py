#!/usr/bin/env python3
import json
import re
import string
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "package"
OUTPUT_IMAGE = PACKAGE / "res" / "images" / "ui-font-atlas.png"
OUTPUT_MAPPING = PACKAGE / "gameplay" / "render" / "font-atlas.js"
FONT_PATH = "/System/Library/Fonts/PingFang.ttc"
FONT_INDEX_SC_MEDIUM = 5
FONT_SIZE = 48
CELL_SIZE = 64
ATLAS_WIDTH = 1024
TEXT_SOURCES = [
    PACKAGE / "gameplay" / "render" / "renderer.js",
    PACKAGE / "gameplay" / "core" / "game.js",
    PACKAGE / "gameplay" / "core" / "game-state.js",
    PACKAGE / "gameplay" / "play" / "collection.js",
    PACKAGE / "gameplay" / "play" / "baking.js",
    PACKAGE / "gameplay" / "play" / "selling.js",
    PACKAGE / "gameplay" / "data" / "recipes.js",
]

# 全量扫源码会塞满注释汉字、超 2048 纹理；缺字用显式补表（R0022 地图解锁文案）
# R0023 地图解锁；R0025 引导；R0026 拉锯；R0027 椰林「接住掉落的椰子」
EXTRA_CHARACTERS = "达件森花费仓库养殖菜园并留处关闭度长的"


def collect_characters():
    characters = set(string.printable)
    characters.update("，。！？：；、（）【】《》“”‘’…→×")
    characters.update(EXTRA_CHARACTERS)
    pattern = re.compile(r"[^\x00-\x7f]")
    for source in TEXT_SOURCES:
        characters.update(pattern.findall(source.read_text(encoding="utf-8")))
    return sorted(characters)


def load_existing_mapping():
    if not OUTPUT_MAPPING.exists():
        return None
    text = OUTPUT_MAPPING.read_text(encoding="utf-8")
    match = re.search(r"FontAtlas = (\{.*\});", text, re.S)
    if not match:
        return None
    return json.loads(match.group(1))


def append_missing_glyphs(existing):
    """在现有字帖末尾追加缺字，避免全量重排超 2048。"""
    font = ImageFont.truetype(FONT_PATH, FONT_SIZE, index=FONT_INDEX_SC_MEDIUM)
    glyphs = dict(existing.get("glyphs") or {})
    missing = [ch for ch in EXTRA_CHARACTERS if ch not in glyphs]
    if not missing:
        print("No missing EXTRA_CHARACTERS; atlas unchanged")
        return False

    columns = ATLAS_WIDTH // CELL_SIZE
    atlas = Image.open(OUTPUT_IMAGE).convert("RGBA")
    # 新字整行追加在现有纹理下方，避免覆盖旧格
    start_row = (atlas.height + CELL_SIZE - 1) // CELL_SIZE
    need_rows = (len(missing) + columns - 1) // columns
    new_height = (start_row + need_rows) * CELL_SIZE
    if new_height > 2048:
        raise RuntimeError("Appending glyphs would exceed the 2048px texture budget")
    grown = Image.new("RGBA", (ATLAS_WIDTH, new_height), (0, 0, 0, 0))
    grown.paste(atlas, (0, 0))
    atlas = grown
    draw = ImageDraw.Draw(atlas)

    for offset, character in enumerate(missing):
        index = start_row * columns + offset
        cell_x = (index % columns) * CELL_SIZE
        cell_y = (index // columns) * CELL_SIZE
        draw.text((cell_x, cell_y), character, font=font, fill=(255, 255, 255, 255))
        bbox = font.getbbox(character)
        advance = font.getlength(character)
        left, top, right, bottom = bbox
        glyphs[character] = {
            "x": cell_x + left,
            "y": cell_y + top,
            "w": max(0, right - left),
            "h": max(0, bottom - top),
            "xoffset": left,
            "yoffset": top,
            "advance": round(advance, 3),
        }

    atlas.save(OUTPUT_IMAGE)
    image_path = existing.get("image") or "res/images/ui-font-atlas.png"
    #  bump cache：保留 ?v= 并递增，或加 ?v=3
    if "?v=" in image_path:
        base, ver = image_path.split("?v=", 1)
        try:
            image_path = base + "?v=" + str(int(re.sub(r"\D", "", ver) or "2") + 1)
        except ValueError:
            image_path = "res/images/ui-font-atlas.png?v=3"
    else:
        image_path = image_path + "?v=3"

    mapping = {
        "image": image_path,
        "width": ATLAS_WIDTH,
        "height": atlas.height,
        "fontSize": existing.get("fontSize", FONT_SIZE),
        "glyphs": glyphs,
    }
    OUTPUT_MAPPING.write_text(
        "(function () {\n"
        "  window.AIGCUtils.FontAtlas = "
        + json.dumps(mapping, ensure_ascii=False, separators=(",", ":"))
        + ";\n})();\n",
        encoding="utf-8",
    )
    print(
        "Appended {} glyphs ({}), atlas {}x{}, total {}".format(
            len(missing), "".join(missing), ATLAS_WIDTH, atlas.height, len(glyphs)
        )
    )
    return True


def main():
    import sys

    existing = load_existing_mapping()
    if "--append-missing" in sys.argv or (
        existing and OUTPUT_IMAGE.exists() and "--full" not in sys.argv
    ):
        if not existing:
            raise RuntimeError("No existing font-atlas.js to append into")
        append_missing_glyphs(existing)
        return

    font = ImageFont.truetype(
        FONT_PATH, FONT_SIZE, index=FONT_INDEX_SC_MEDIUM
    )
    characters = collect_characters()
    columns = ATLAS_WIDTH // CELL_SIZE
    rows = (len(characters) + columns - 1) // columns
    atlas_height = rows * CELL_SIZE
    if atlas_height > 2048:
        raise RuntimeError(
            "Font atlas exceeds the 2048px texture budget; use default append mode "
            "or pass --full only with a reduced charset"
        )

    atlas = Image.new("RGBA", (ATLAS_WIDTH, atlas_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(atlas)
    glyphs = {}
    for index, character in enumerate(characters):
        cell_x = (index % columns) * CELL_SIZE
        cell_y = (index // columns) * CELL_SIZE
        draw.text((cell_x, cell_y), character, font=font, fill=(255, 255, 255, 255))
        bbox = font.getbbox(character)
        advance = font.getlength(character)
        left, top, right, bottom = bbox
        glyphs[character] = {
            "x": cell_x + left,
            "y": cell_y + top,
            "w": max(0, right - left),
            "h": max(0, bottom - top),
            "xoffset": left,
            "yoffset": top,
            "advance": round(advance, 3),
        }

    OUTPUT_IMAGE.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(OUTPUT_IMAGE)
    mapping = {
        "image": "res/images/ui-font-atlas.png",
        "width": ATLAS_WIDTH,
        "height": atlas_height,
        "fontSize": FONT_SIZE,
        "glyphs": glyphs,
    }
    OUTPUT_MAPPING.write_text(
        "(function () {\n"
        "  window.AIGCUtils.FontAtlas = "
        + json.dumps(mapping, ensure_ascii=False, separators=(",", ":"))
        + ";\n})();\n",
        encoding="utf-8",
    )
    print(
        "Generated {} Simplified Chinese glyphs, atlas {}x{}".format(
            len(characters), ATLAS_WIDTH, atlas_height
        )
    )


if __name__ == "__main__":
    main()
