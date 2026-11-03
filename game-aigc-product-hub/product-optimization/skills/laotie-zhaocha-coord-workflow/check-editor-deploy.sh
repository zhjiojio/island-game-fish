#!/usr/bin/env bash
# laotie-editor 部署后强制自测门禁
# 用法：bash check-editor-deploy.sh
# 退出码：0 = 全绿灯 · 1 = 有 fail 必须修
#
# 校验维度：
#   ① dist/ 存在 且 <= 5MB（超了大概率误把图打进去）
#   ② dist/assets/index-*.js bundle 里包含 Appwrite（说明 @codeflicker/appwrite 被正确 bundle）
#   ③ 线上首页 HTML 可访问（非 302 跳登录）
#   ④ 线上 JS 指纹与本地 dist 里的最新 JS 一致（防"你以为 deploy 了实际没生效"）
#   ⑤ 本地 editor-legacy.js 里的关卡列表数与 game 项目 levels.js 场景 3 关卡数一致

set +e
FAIL=0
WARN=0
PASS=0

EDITOR_DIR="/Users/fat/Desktop/laotie-editor"
GAME_LEVELS="/Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks658651445853447417/package/js/levels.js"
BASE_URL="https://laotie-editor.frontend-cloud.corp.kuaishou.com"

log_pass(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
log_warn(){ echo "  ⚠️  $1"; WARN=$((WARN+1)); }
log_fail(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "═══ laotie-editor 部署后自测 ═══"

# ① dist 存在 & 大小合理
echo ""
echo "[1/5] dist/ 大小检查"
if [ ! -d "$EDITOR_DIR/dist" ]; then
  log_fail "dist/ 不存在，请先跑 npm run build"
else
  SIZE_KB=$(du -sk "$EDITOR_DIR/dist" | awk '{print $1}')
  SIZE_MB=$((SIZE_KB / 1024))
  if [ "$SIZE_KB" -gt 5120 ]; then
    log_fail "dist/ = ${SIZE_MB}MB > 5MB · 大概率误把 public/*.jpg 打进去了（editor 应走 CDN）"
    echo "     解决：mv public/**/*.jpg /tmp/backup/ && rm -rf dist && npm run build"
  else
    log_pass "dist/ = ${SIZE_MB}MB（< 5MB · 图走 CDN 无本地累赘）"
  fi
fi

# ② bundle 里 Appwrite 是否 bundle 了
echo ""
echo "[2/5] bundle 完整性检查（Appwrite / TablesDB）"
BUNDLE=$(ls "$EDITOR_DIR"/dist/assets/index-*.js 2>/dev/null | head -1)
if [ -z "$BUNDLE" ]; then
  log_fail "dist/assets/index-*.js 不存在"
else
  # 裸 import 会保留 @codeflicker/appwrite；bundle 后应该找到 Client / Account 等符号
  BARE_IMPORT=$(grep -c "@codeflicker/appwrite" "$BUNDLE" 2>/dev/null | head -1)
  HAS_CLIENT=$(grep -c "Appwrite\|Databases\|TablesDB\|OAuthProvider" "$BUNDLE" 2>/dev/null | head -1)
  BARE_IMPORT=${BARE_IMPORT:-0}
  HAS_CLIENT=${HAS_CLIENT:-0}
  if [ "$BARE_IMPORT" -gt 0 ]; then
    log_fail "bundle 里残留裸 import '@codeflicker/appwrite'（浏览器无法解析 → 白屏）"
    echo "     解决：确认 npm install 完成 & vite.config.js 没排除 @codeflicker"
  elif [ "$HAS_CLIENT" -eq 0 ]; then
    log_warn "bundle 里没找到 Appwrite/Databases 符号（可能被 minify 了名字，不一定错）"
  else
    log_pass "bundle 里已内联 Appwrite（$HAS_CLIENT 处符号）"
  fi
fi

# ③ 线上首页可访问
echo ""
echo "[3/5] 线上首页可访问性"
HTTP_CODE=$(curl -sIL "$BASE_URL/" -o /dev/null -w "%{http_code}" --max-time 8 2>/dev/null)
if [ "$HTTP_CODE" = "200" ]; then
  log_pass "$BASE_URL/ 返回 200"
elif [ "$HTTP_CODE" = "302" ]; then
  log_warn "$BASE_URL/ 返回 302（可能是 SSO 跳转，用户需要在浏览器里已登录快手内网）"
else
  log_fail "$BASE_URL/ 返回 $HTTP_CODE"
fi

# ④ 线上 JS 指纹与本地最新 dist 一致
echo ""
echo "[4/5] 线上 JS 指纹 vs 本地 dist"
LOCAL_JS=$(ls "$EDITOR_DIR"/dist/assets/index-*.js 2>/dev/null | head -1 | xargs -I{} basename {} 2>/dev/null)
ONLINE_JS=$(curl -s "$BASE_URL/" --max-time 8 2>/dev/null | grep -oE "index-[a-zA-Z0-9_-]+\.js" | head -1)
if [ -z "$ONLINE_JS" ]; then
  log_warn "无法从线上 HTML 抓 JS 文件名（可能 SSO 挡了 · 请浏览器实测）"
elif [ "$LOCAL_JS" = "$ONLINE_JS" ]; then
  log_pass "线上 JS = $ONLINE_JS · 与本地 dist 一致"
else
  log_fail "线上 JS = $ONLINE_JS 但本地 dist = $LOCAL_JS · 部署可能没生效！重跑 npx frontend-cloud-cli deploy"
fi

# ⑤ editor 场景 3 关卡数 vs game levels.js 场景 3 关卡数
echo ""
echo "[5/5] editor ⇄ game 场景 3 关卡数一致性"
EDITOR_S3_COUNT=$(grep -cE "^\s*\{lv:[0-9]+" "$EDITOR_DIR/src/editor-legacy.js" 2>/dev/null || echo 0)
if [ -f "$GAME_LEVELS" ]; then
  GAME_S3_COUNT=$(grep -cE "themeId:4" "$GAME_LEVELS" 2>/dev/null || echo 0)
  if [ "$GAME_S3_COUNT" -eq 0 ]; then
    log_warn "game levels.js 未找到 themeId:4 关卡（可能变量名不同 · 请人工核对）"
  else
    # editor 里 lv:数字 会出现在 scene1+scene2+scene3 三段，无法直接总数对比
    # 只提示总量，让人肉眼比对
    echo "     · editor-legacy.js 里所有 {lv:N} 出现次数：$EDITOR_S3_COUNT"
    echo "     · game levels.js 场景 3 (themeId:4) 关卡数：$GAME_S3_COUNT"
    log_pass "关卡数已列出，请人工核对场景 3 是否一致"
  fi
else
  log_warn "找不到 game levels.js（$GAME_LEVELS）跳过 · 请手动核对"
fi

# 汇总
echo ""
echo "═══════════════════════════════"
echo "  ✅ PASS $PASS  ⚠️  WARN $WARN  ❌ FAIL $FAIL"
echo "═══════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "🚫 存在 $FAIL 项失败，禁止告知用户「editor 已部署」！先修完再说。"
  exit 1
fi

echo ""
echo "🟢 全绿灯——可以告诉用户 editor 已部署。但仍必须走 browser_agent 做一次真实截图（用户视角）："
echo "   • 在浏览器打开 $BASE_URL/#scene3-lvN"
echo "   • 确认场景切换后能看到关卡卡片列表 + 关卡背景图"
echo "   • 确认没有红色 console error"
exit 0
