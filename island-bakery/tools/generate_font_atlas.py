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


def collect_characters():
    characters = set(string.printable)
    characters.update("，。！？：；、（）【】《》“”‘’…→×")
    pattern = re.compile(r"[^\x00-\x7f]")
    for source in TEXT_SOURCES:
        characters.update(pattern.findall(source.read_text(encoding="utf-8")))
    return sorted(characters)


def main():
    font = ImageFont.truetype(
        FONT_PATH, FONT_SIZE, index=FONT_INDEX_SC_MEDIUM
    )
    characters = collect_characters()
    columns = ATLAS_WIDTH // CELL_SIZE
    rows = (len(characters) + columns - 1) // columns
    atlas_height = rows * CELL_SIZE
    if atlas_height > 2048:
        raise RuntimeError("Font atlas exceeds the 2048px texture budget")

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
