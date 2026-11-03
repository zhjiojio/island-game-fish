#!/usr/bin/env bash
# =============================================================================
# laotie-check.sh —— 老铁眼真尖上线前 12 项强校验（Level 2 合体校验器）
# =============================================================================
# 用法：
#   bash skill/scripts/laotie-check.sh          # 交互运行，全部输出
#   bash skill/scripts/laotie-check.sh --quiet  # pre-commit 用，只出错才输出
#   bash skill/scripts/laotie-check.sh --skip-cdn  # 跳过 CDN 存在性检查（离线用）
#
# 任何一项红 → 退出码 1，拒绝上线。
# =============================================================================

set -uo pipefail

# ------------------------- 路径常量（跟着本脚本走）--------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GAME_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LEVELS="$GAME_ROOT/package/js/levels.js"
MAIN_JS="$GAME_ROOT/package/js/main.js"
INDEX_HTML="$GAME_ROOT/package/index.html"
PROJ_CFG="$GAME_ROOT/package/project.config.json"
EDITOR_ROOT="${LAOTIE_EDITOR_ROOT:-/Users/fat/Desktop/laotie-editor}"
EDITOR_JS="$EDITOR_ROOT/src/editor-legacy.js"
EDITOR_DIST="$EDITOR_ROOT/dist"

# ------------------------- 参数解析 -----------------------------------------
QUIET=0
SKIP_CDN=0
for arg in "$@"; do
  case "$arg" in
    --quiet) QUIET=1 ;;
    --skip-cdn) SKIP_CDN=1 ;;
  esac
done

# ------------------------- 输出工具 -----------------------------------------
RED=$'\033[0;31m'; GRN=$'\033[0;32m'; YLW=$'\033[0;33m'; CYA=$'\033[0;36m'; RST=$'\033[0m'
FAIL_COUNT=0
WARN_COUNT=0
PASS_COUNT=0

ok()   { PASS_COUNT=$((PASS_COUNT+1)); [ $QUIET -eq 0 ] && echo "${GRN}✓${RST} $1"; }
ok()   { PASS_COUNT=$((PASS_COUNT+1)); [ $QUIET -eq 0 ] && echo "${GRN}✓${RST} $1"; return 0; }
warn() { WARN_COUNT=$((WARN_COUNT+1)); echo "${YLW}⚠${RST} $1"; }
fail() { FAIL_COUNT=$((FAIL_COUNT+1)); echo "${RED}✗${RST} $1"; }
section() { [ $QUIET -eq 0 ] && echo "${CYA}━━ $1 ━━${RST}"; return 0; }

[ $QUIET -eq 0 ] && echo "${CYA}════ 老铁眼真尖 · 上线前 12 项校验 ════${RST}"
[ $QUIET -eq 0 ] && echo "GAME:   $GAME_ROOT"
[ $QUIET -eq 0 ] && echo "EDITOR: $EDITOR_ROOT"
[ $QUIET -eq 0 ] && echo ""

# ------------------------- 预检 ---------------------------------------------
[ -f "$LEVELS" ] || { echo "${RED}FATAL${RST}: levels.js 不存在: $LEVELS"; exit 2; }
[ -f "$MAIN_JS" ] || { echo "${RED}FATAL${RST}: main.js 不存在: $MAIN_JS"; exit 2; }
[ -f "$INDEX_HTML" ] || { echo "${RED}FATAL${RST}: index.html 不存在: $INDEX_HTML"; exit 2; }

# ═════════════════════════════════════════════════════════════════════════════
# 检查 1：中文 tag 零容忍（禁止 tag:'英文下划线'）
# ═════════════════════════════════════════════════════════════════════════════
section "1/12 中文 tag 零容忍"
BAD_TAGS=$(grep -oE "tag:'[a-zA-Z_][a-zA-Z_0-9]*'" "$LEVELS" 2>/dev/null | sort -u || true)
if [ -n "$BAD_TAGS" ]; then
  fail "levels.js 存在英文 tag：$(echo "$BAD_TAGS" | tr '\n' ' ')"
else
  ok "levels.js tag 全中文"
fi

# ═════════════════════════════════════════════════════════════════════════════
# 检查 2：敏感词库
# ═════════════════════════════════════════════════════════════════════════════
section "2/12 敏感词库"
SENSITIVE_HITS=$(grep -nE "供销社|洗浴中心|国营|春运" "$LEVELS" 2>/dev/null || true)
if [ -n "$SENSITIVE_HITS" ]; then
  fail "levels.js 命中敏感词：\n$SENSITIVE_HITS"
else
  ok "levels.js 无敏感词"
fi
if [ -f "$EDITOR_JS" ]; then
  E_HITS=$(grep -nE "供销社|洗浴中心|国营|春运" "$EDITOR_JS" 2>/dev/null || true)
  [ -n "$E_HITS" ] && fail "editor-legacy.js 命中敏感词：\n$E_HITS" || ok "editor 无敏感词"
fi

# ═════════════════════════════════════════════════════════════════════════════
# 检查 3：标题长度 ≤8 字（不含前缀）
# ═════════════════════════════════════════════════════════════════════════════
section "3/12 标题长度 ≤8 字"
python3 - "$LEVELS" <<'PYEOF' 2>/dev/null && ok "所有标题 ≤8 字" || fail "存在超长标题"
import re, sys
src = open(sys.argv[1], encoding='utf-8').read()
bad = []
for m in re.finditer(r"title:\s*'([^']+)'", src):
    t = m.group(1)
    # 去掉「第N关 · 」前缀
    clean = re.sub(r'^第[\d〇一二三四五六七八九十]+关\s*[·・]\s*', '', t)
    if len(clean) > 8:
        bad.append(f"{clean} ({len(clean)}字)")
if bad:
    print(f"  超长标题: {bad}", file=sys.stderr)
    sys.exit(1)
sys.exit(0)
PYEOF

# ═════════════════════════════════════════════════════════════════════════════
# 检查 4：hint 数字 ⇔ odds 数组长度一致（防"缺茬"血泪）
# ═════════════════════════════════════════════════════════════════════════════
section "4/12 hint 数字 vs odds 数组长度"
python3 - "$LEVELS" <<'PYEOF' 2>/dev/null && ok "hint 数字 与 odds 数组长度全部匹配" || fail "hint 与 odds 数组长度不匹配"
import re, sys
src = open(sys.argv[1], encoding='utf-8').read()
# 拆每个 level object
lvls = re.split(r'\{\s*idx\s*:', src)[1:]
bad = []
for i, chunk in enumerate(lvls):
    idx_m = re.match(r'\s*(\d+)', chunk)
    if not idx_m: continue
    idx = idx_m.group(1)
    title_m = re.search(r"title:\s*'([^']+)'", chunk[:400])
    title = title_m.group(1) if title_m else f"idx{idx}"
    hint_m = re.search(r"hint:\s*'([^']*)'", chunk[:800])
    hint_num = None
    if hint_m:
        n = re.search(r'(\d+)\s*处', hint_m.group(1))
        if n: hint_num = int(n.group(1))
    # odds 数组长度：找 odds:[ ... ] 里 { 出现次数
    odds_m = re.search(r'odds\s*:\s*\[(.*?)\]', chunk, re.DOTALL)
    if odds_m and hint_num is not None:
        odds_len = odds_m.group(1).count('{prop')
        # 兼容其它写法
        if odds_len == 0:
            odds_len = odds_m.group(1).count('prop:')
        if odds_len != hint_num:
            bad.append(f"idx={idx} 「{title}」 hint={hint_num} 处 但 odds={odds_len} 项")
if bad:
    for b in bad: print(f"  {b}", file=sys.stderr)
    sys.exit(1)
sys.exit(0)
PYEOF

# ═════════════════════════════════════════════════════════════════════════════
# 检查 5：idx 连续性（同 themeId 内不能跳号导致断链）
# ═════════════════════════════════════════════════════════════════════════════
section "5/12 idx 连续性 & 唯一性"
python3 - "$LEVELS" "$GAME_ROOT/build-artifacts/levels-config.json" <<'PYEOF' 2>/dev/null && ok "idx 唯一 & 主题内连续" || fail "idx 存在重复或断链风险"
import json, os, re, sys
from collections import defaultdict
if os.path.isfile(sys.argv[2]):
    cfg = json.load(open(sys.argv[2], encoding='utf-8'))
    lvls = [(str(level.get('idx')), str(level.get('themeId'))) for level in cfg.get('levels', [])
            if isinstance(level.get('idx'), int) and isinstance(level.get('themeId'), int)]
else:
    src = open(sys.argv[1], encoding='utf-8').read()
    lvls = re.findall(r'idx\s*:\s*(\d+)[^}]*?themeId\s*:\s*(\d+)', src)
if not lvls:
    print("  未解析到任何 idx/themeId 对", file=sys.stderr); sys.exit(1)
# idx 唯一性按 themeId 分组检查（不同主题间 idx 重复是合法设计）
themes = defaultdict(list)
for idx, tid in lvls:
    themes[int(tid)].append(int(idx))
has_error = False
for tid, ids in sorted(themes.items()):
    seen = {}
    for i, n in enumerate(ids):
        if n in seen:
            print(f"  themeId={tid} idx={n} 重复出现", file=sys.stderr)
            has_error = True
        seen[n] = True
    ids_sorted = sorted(ids)
    gaps = [(ids_sorted[i], ids_sorted[i+1]) for i in range(len(ids_sorted)-1) if ids_sorted[i+1] - ids_sorted[i] > 1]
    if gaps:
        # 只警告不失败：断链本身不致命，但要求 game.js 用 getThemeLevels 走同主题跳关
        print(f"  themeId={tid} idx 分布: {ids_sorted}（含跳号 {gaps}）", file=sys.stderr)
if has_error:
    sys.exit(1)
sys.exit(0)
PYEOF

# ═════════════════════════════════════════════════════════════════════════════
# 检查 6：版本号三件套同步
# ═════════════════════════════════════════════════════════════════════════════
section "6/12 版本号三件套"
BUILD_VER=$(grep -oE "M3\.BUILD_VER\s*=\s*'v[0-9]+\.[0-9]+\.[0-9]+'" "$MAIN_JS" | grep -oE "v[0-9]+\.[0-9]+\.[0-9]+" | head -1)
MARKER_VER=$(grep -oE "MARKER v[0-9]+" "$MAIN_JS" | grep -oE "v[0-9]+" | head -1)
INDEX_VERS=$(grep -oE '\?v=[0-9]+' "$INDEX_HTML" | sort -u)
INDEX_VER_COUNT=$(echo "$INDEX_VERS" | wc -l | tr -d ' ')

if [ -z "$BUILD_VER" ]; then
  fail "main.js 未找到 M3.BUILD_VER"
elif [ -z "$MARKER_VER" ]; then
  fail "main.js 未找到 [MARKER vNN]"
elif [ "$INDEX_VER_COUNT" != "1" ]; then
  fail "index.html ?v= 版本号不统一：$(echo $INDEX_VERS | tr '\n' ' ')"
  echo "  ${YLW}💡 建议：node skill/scripts/bump-version.js patch \"<摘要>\" 一键同步所有版本号${RST}"
else
  ok "BUILD_VER=$BUILD_VER  MARKER=$MARKER_VER  index?v=$(echo $INDEX_VERS)"
fi

# ═════════════════════════════════════════════════════════════════════════════
# 检查 7：AppID 一致性（project.config.json vs 目录名）
# ═════════════════════════════════════════════════════════════════════════════
section "7/12 AppID 一致性"
DIR_APPID=$(basename "$GAME_ROOT")
if [ -f "$PROJ_CFG" ]; then
  CFG_APPID=$(grep -oE '"appid"\s*:\s*"[^"]+"' "$PROJ_CFG" | head -1 | grep -oE 'ks[0-9]+')
  if [ "$CFG_APPID" = "$DIR_APPID" ]; then
    ok "AppID 目录=配置 一致: $CFG_APPID"
  else
    fail "AppID 不一致：目录=$DIR_APPID 但 project.config.json=$CFG_APPID"
  fi
else
  warn "project.config.json 不存在，跳过 AppID 校验"
fi

# ═════════════════════════════════════════════════════════════════════════════
# 检查 8：editor dist/ 未包含 real-scenes（防超 50MB）
# ═════════════════════════════════════════════════════════════════════════════
section "8/12 editor dist/ 无 real-scenes"
if [ -d "$EDITOR_DIST" ]; then
  if [ -d "$EDITOR_DIST/real-scenes" ]; then
    RS_SIZE=$(du -sh "$EDITOR_DIST/real-scenes" 2>/dev/null | awk '{print $1}')
    fail "editor dist/real-scenes 未清理（大小 $RS_SIZE），frontend-cloud 会 >50MB 拒收"
  else
    ok "editor dist/ 无 real-scenes"
  fi
else
  warn "editor dist/ 不存在（还没 build 或 editor 不在本机）"
fi

# ═════════════════════════════════════════════════════════════════════════════
# 检查 9：4 结构一致性（levels.js prop_id ⇔ editor PROP_META）
# ═════════════════════════════════════════════════════════════════════════════
section "9/12 editor PROP_META 覆盖 levels prop_id"
if [ -f "$EDITOR_JS" ]; then
  MISSING=$(python3 - "$LEVELS" "$EDITOR_JS" "$GAME_ROOT/build-artifacts/levels-config.json" <<'PYEOF' 2>/dev/null
import json, os, re, sys
levels_src = open(sys.argv[1], encoding='utf-8').read()
levels_props = set(re.findall(r"prop\s*:\s*'([a-zA-Z_0-9]+)'", levels_src))
editor_src = open(sys.argv[2], encoding='utf-8').read()
missing = set()
for p in sorted(levels_props):
    if not re.search(rf"^\s*{re.escape(p)}\s*:\s*\{{", editor_src, re.M):
        # 兼容单行写法  p: { ...
        if not re.search(rf"[\s,{{]{re.escape(p)}\s*:\s*\{{", editor_src):
            missing.add(p)

# S5 采用单一 SoT：story-levels.js 从本地 levels-config.json 动态生成
# STORY_LEVELS / EXIST_S5 / STORY_PROP_META，避免在 editor-legacy.js 复制主题5条目。
story_js_path = os.path.join(os.path.dirname(sys.argv[2]), 'story-levels.js')
config_path = sys.argv[3]
story_errors = []
if os.path.isfile(story_js_path) and os.path.isfile(config_path):
    story_src = open(story_js_path, encoding='utf-8').read()
    import_ok = bool(re.search(r"import\s*\{[^}]*STORY_PROP_META[^}]*\}\s*from\s*['\"]\./story-levels\.js['\"]", editor_src, re.S))
    assign_ok = bool(re.search(r"Object\.assign\(\s*PROP_META\s*,\s*STORY_PROP_META\s*\)", editor_src))
    generator_ok = all(token in story_src for token in (
        "levelsConfig.levels",
        "level.themeId === 5",
        "sourceLevels.flatMap",
        "odd.prop",
        "name: odd.tag || odd.prop",
    ))
    if import_ok and assign_ok and generator_ok:
        try:
            cfg = json.load(open(config_path, encoding='utf-8'))
            story_levels = sorted((l for l in cfg.get('levels', []) if l.get('themeId') == 5), key=lambda l: l.get('idx', -1))
            story_odds = [o for l in story_levels for o in l.get('odds', [])]
            story_props = {o.get('prop') for o in story_odds if o.get('prop')}
            affair_pilot = bool(story_levels) and all(
                l.get('storySchema') == 's5_affair_1808_v1' for l in story_levels
            )
            source_story_match = re.search(
                r"var\s+AFFAIR5_PILOT\s*=\s*\[(.*?)\n\s*\];",
                levels_src,
                re.S,
            ) if affair_pilot else re.search(
                r"主题5[^\n]*story\s*模式关卡.*?M3\.LEVELS\s*=\s*M3\.LEVELS\.concat\(\[(.*?)\]\);",
                levels_src,
                re.S,
            )
            source_story_odds = re.findall(r"prop\s*:\s*'([a-zA-Z_0-9]+)'", source_story_match.group(1)) if source_story_match else []
            source_story_props = set(source_story_odds)
            expected_idx = list(range(200, 205)) if affair_pilot else list(range(200, 220))
            expected_count = 5 if affair_pilot else 20
            expected_odds = 33 if affair_pilot else None
            if len(story_levels) != expected_count:
                story_errors.append(f"S5关卡数={len(story_levels)}(应为{expected_count})")
            if [l.get('idx') for l in story_levels] != expected_idx:
                story_errors.append(f"S5 idx不是{expected_idx[0]}-{expected_idx[-1]}")
            if expected_odds is not None and (len(story_odds) != expected_odds or len(story_props) != expected_odds):
                story_errors.append(f"S5线索={len(story_odds)}/{len(story_props)}(应为{expected_odds}个唯一prop)")
            if not source_story_match:
                story_errors.append("S5源码区块解析失败")
            elif (len(story_odds), story_props) != (len(source_story_odds), source_story_props):
                story_errors.append(
                    f"S5 prop配置={len(story_odds)}/{len(story_props)}"
                    f" 源码={len(source_story_odds)}/{len(source_story_props)}"
                )
            bad_tags = [o.get('prop', '?') for o in story_odds
                        if not o.get('tag') or re.fullmatch(r'[a-zA-Z_][a-zA-Z_0-9]*', str(o.get('tag', '')))]
            if bad_tags:
                story_errors.append("S5中文tag缺失:" + ','.join(bad_tags[:5]))
            if affair_pilot:
                for level in story_levels:
                    odds = level.get('odds', [])
                    for odd in odds:
                        if not all(isinstance(odd.get(k), (int, float)) for k in ('x','y','w','h')):
                            story_errors.append(f"S5坐标类型非法:{odd.get('prop','?')}")
                            continue
                        if odd['x'] < 0 or odd['y'] < 0 or odd['w'] <= 0 or odd['h'] <= 0 or odd['x'] + odd['w'] > 100 or odd['y'] + odd['h'] > 100:
                            story_errors.append(f"S5坐标越界:{odd.get('prop','?')}")
                    for i, left in enumerate(odds):
                        for right in odds[i+1:]:
                            ix = max(0, min(left['x']+left['w'], right['x']+right['w']) - max(left['x'], right['x']))
                            iy = max(0, min(left['y']+left['h'], right['y']+right['h']) - max(left['y'], right['y']))
                            if ix * iy > 0:
                                story_errors.append(f"S5热区重叠:{left.get('prop','?')}/{right.get('prop','?')}")
            if not story_errors:
                missing.difference_update(story_props)
                if affair_pilot:
                    # 旧主题5 concat 区块只作历史回溯，运行时会被 AFFAIR5_PILOT 整体替换。
                    dead_story_match = re.search(
                        r"主题5[^\n]*story\s*模式关卡.*?M3\.LEVELS\s*=\s*M3\.LEVELS\.concat\(\[(.*?)\]\);",
                        levels_src,
                        re.S,
                    )
                    if dead_story_match:
                        missing.difference_update(re.findall(
                            r"prop\s*:\s*'([a-zA-Z_0-9]+)'", dead_story_match.group(1)
                        ))
        except Exception as exc:
            story_errors.append(f"S5配置解析失败:{exc}")
    elif import_ok or assign_ok or generator_ok:
        story_errors.append("S5 STORY_PROP_META 导入/生成/合并链不完整")

if story_errors:
    print(' '.join(story_errors))
if missing:
    print(' '.join(sorted(missing)))
PYEOF
)
  if [ -n "$MISSING" ]; then
    fail "editor PROP_META 缺失：$MISSING"
  else
    ok "editor PROP_META 全覆盖"
  fi
else
  warn "editor-legacy.js 不存在，跳过 4 结构校验"
fi

# ═════════════════════════════════════════════════════════════════════════════
# 检查 10：CDN 存在性预扫（每个 scene URL curl HEAD 200）
# ═════════════════════════════════════════════════════════════════════════════
section "10/12 CDN 场景图存在性"
if [ $SKIP_CDN -eq 1 ]; then
  warn "已跳过 CDN 检查（--skip-cdn）"
else
  CDN_BASE="https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/$DIR_APPID"
  CDN_BASE2="https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/$DIR_APPID"
  # 场景1 hidden 图存放在分包 AppID ks693835817972937121（双桶 fallback）
  CDN_BASE_SUB="https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks693835817972937121"
  CDN_BASE_SUB2="https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks693835817972937121"
  MISS_CDN=""
  # 抽取所有 scene 引用的图名
  SCENE_FILES=$(python3 - "$LEVELS" <<'PYEOF' 2>/dev/null
import re, sys
src = open(sys.argv[1], encoding='utf-8').read()
imgs = set()
for m in re.finditer(r"(hidden_lv\d+|s2_lv\d+_[ab]|s3_lv\d+|affair_lv\d{2})\.jpg", src):
    imgs.add(m.group(0))
for i in sorted(imgs): print(i)
PYEOF
)
  TOTAL=$(echo "$SCENE_FILES" | grep -c . || echo 0)
  MISS_COUNT=0
  for img in $SCENE_FILES; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" -I --max-time 5 "$CDN_BASE/$img" 2>/dev/null || echo 000)
    if [ "$CODE" != "200" ]; then
      # 双桶 fallback：p5 不通则试 p4
      CODE2=$(curl -s -o /dev/null -w "%{http_code}" -I --max-time 5 "$CDN_BASE2/$img" 2>/dev/null || echo 000)
      if [ "$CODE2" != "200" ]; then
        # 分包 AppID fallback（场景1 hidden 图）
        CODE3=$(curl -s -o /dev/null -w "%{http_code}" -I --max-time 5 "$CDN_BASE_SUB/$img" 2>/dev/null || echo 000)
        if [ "$CODE3" != "200" ]; then
          CODE4=$(curl -s -o /dev/null -w "%{http_code}" -I --max-time 5 "$CDN_BASE_SUB2/$img" 2>/dev/null || echo 000)
          if [ "$CODE4" != "200" ]; then
            MISS_COUNT=$((MISS_COUNT+1))
            MISS_CDN="$MISS_CDN $img(HTTP=$CODE)"
          fi
        fi
      fi
    fi
  done
  if [ $MISS_COUNT -gt 0 ]; then
    warn "CDN 缺失 $MISS_COUNT/$TOTAL 张图（历史关卡待补）：$MISS_CDN"
  else
    ok "CDN 全部 $TOTAL 张场景图 HTTP 200"
  fi
fi

# ═════════════════════════════════════════════════════════════════════════════
# 检查 11：git 状态（提示 ksmg upload 后需 commit + push）
# ═════════════════════════════════════════════════════════════════════════════
section "11/12 git 状态"
GIT_ROOT=$(cd "$GAME_ROOT" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null || echo "")
if [ -n "${GIT_ROOT:-}" ]; then
  DIRTY=$(cd "$GIT_ROOT" && git status --porcelain "$GAME_ROOT" 2>/dev/null | wc -l | tr -d ' ')
  BRANCH=$(cd "$GIT_ROOT" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
  if [ "${DIRTY:-0}" -gt 0 ]; then
    warn "$GAME_ROOT 有 $DIRTY 个未提交文件（当前分支：${BRANCH}）——ksmg upload 后必须 commit+push"
  else
    ok "git 目录干净（分支：${BRANCH}）"
  fi
else
  warn "不在 git 仓库内"
fi

# ═════════════════════════════════════════════════════════════════════════════
# 检查 12：level.js 中所有 prop 都在 PROPS 表中（防 UI 显示 undefined）
# ═════════════════════════════════════════════════════════════════════════════
section "12/12 levels.js PROPS 表覆盖"
python3 - "$LEVELS" <<'PYEOF' 2>/dev/null && ok "levels.js PROPS 表覆盖全部 prop_id" || fail "levels.js PROPS 表缺失 prop_id"
import re, sys
src = open(sys.argv[1], encoding='utf-8').read()
used = set(re.findall(r"prop\s*:\s*'([a-zA-Z_0-9]+)'", src))
# 用层级匹配方式找 PROPS 块（支持嵌套花括号）
start = src.find('M3.PROPS = {')
if start < 0:
    start = src.find('PROPS = {')
if start < 0:
    print("  未找到 PROPS 定义", file=sys.stderr); sys.exit(1)
depth = 0
end = start
for i, c in enumerate(src[start:], start):
    if c == '{': depth += 1
    elif c == '}':
        depth -= 1
        if depth == 0:
            end = i
            break
props_block = src[start:end+1]
declared = set(re.findall(r'^\s*([a-zA-Z_][a-zA-Z_0-9]*)\s*:', props_block, re.M))
missing = used - declared
if missing:
    print(f"  PROPS 表缺失: {sorted(missing)}", file=sys.stderr); sys.exit(1)
sys.exit(0)
PYEOF

if [ $FAIL_COUNT -gt 0 ] && echo "$FAIL_COUNT" | grep -q "[1-9]"; then
  [ $QUIET -eq 0 ] && echo "  ${YLW}💡 建议：node skill/scripts/ingest-level.js --file=<json> --add-props 可自动补全 PROPS${RST}"
fi

# ═════════════════════════════════════════════════════════════════════════════
# 汇总
# ═════════════════════════════════════════════════════════════════════════════
[ $QUIET -eq 0 ] && echo ""
[ $QUIET -eq 0 ] && echo "${CYA}════ 汇总 ════${RST}"
[ $QUIET -eq 0 ] && echo "通过：$PASS_COUNT   警告：$WARN_COUNT   失败：$FAIL_COUNT"

if [ $FAIL_COUNT -gt 0 ]; then
  echo "${RED}✗ 校验失败，禁止上线${RST}"
  exit 1
fi

[ $QUIET -eq 0 ] && echo "${GRN}✓ 全部通过，允许上线${RST}"
exit 0
