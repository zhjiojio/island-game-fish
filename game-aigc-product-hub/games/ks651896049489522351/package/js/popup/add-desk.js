/**
 * scene-add-desk.js — 加桌有奖弹窗（主页）
 *
 * 交互流程：
 *   1. 主页点击「加桌」图标 → show() 打开本弹窗（bg 整图烘焙标题/插图）
 *   2. 弹窗仅补两个元素：关闭按钮（贴可见右缘、被 bg 覆盖一点）+
 *      黄色按钮底图叠字「立即加桌」
 *   3. 点「立即加桌」→ 调用开放 API ks.addShortcut → 成功后走
 *      SceneHome.completeTask('join') 服务端发奖并关闭弹窗
 */
(function () {
  var M3 = window.M3 = window.M3 || {};
  var AM = M3.AssetManager;

  // ─── 资源（整图 492 x 272：标题/插图全部烘焙在 panel 内）───
  var GROUP = 'popup:adddesk';
  var RES = {
    panel: ['adddesk-panel', 'subpackages/popup/asset/image/popup/adddesk/adddesk-panel.png'],
    btn: ['btnGold', 'asset/image/common/btn/btn-6.png'],
    close: ['btn-close', 'asset/image/common/btn/btn-close.png'],
  };
  function ensureAssets () {
    if (!AM) return;
    for (var k in RES) {
      if (RES.hasOwnProperty(k) && !AM.loaded(RES[k][0])) {
        AM.acquire('image', RES[k][0], RES[k][1], GROUP);
      }
    }
  }

  // ─── 状态 ────────────────────────────────────────────────────
  var _visible = false;
  var _rewardAmount = 0;  // 服务端下发的加桌奖励金额（0 = 未收到，不显示）

  function r () { return M3.Render; }

  M3.SceneAddDesk = M3.SceneAddDesk || {};

  // ─── 开关 ────────────────────────────────────────────────────
  function show () {
    // 每次打开时从全局缓存同步最新奖励金额（authOk → applyAuthResult 时已写入）
    if (M3._shortcutRewardBeans) _rewardAmount = M3._shortcutRewardBeans;
    ensureAssets();
    _visible = true;
  }
  function hide () {
    _visible = false;
    // 关闭弹窗即释放本组切图资源（下次 show 重新加载）
    if (AM && AM.releaseGroup) AM.releaseGroup(GROUP);
  }
  function isVisible () { return !!_visible; }

  // ─── 立即加桌：调用开放 API 引导用户添加桌面（奖励不在此发）───
  // 发放条件：下次从桌面快捷方式 / mini apk 启动时由 setLaunchFrom /
  // maybeClaimShortcut 自动领取（iOS addShortcut 无回调，按本回调发奖
  // 在 iOS 永远不可达；且按真实启动来源发放可确保快捷方式真实存在）
  function confirmAddDesk () {
    if (typeof ks !== 'undefined' && ks.addShortcut) {
      ks.addShortcut({
        success: function () {
          // 成功提示由系统（快手平台）自带，客户端不再重复 toast
          // hide();
        },
        fail: function (err) {
          if (err && err.code === -10005) { M3.Game.flash('当前设备暂不支持添加桌面'); return; }
          // if (err & err.code === -1 & err.msg == "shortcut is exist") { return };
          // M3.Game.flash('添加失败');
        }
      });
    } else {
      M3.Game.flash('当前环境暂不支持添加桌面');
    }
  }

  // ─── 绘制 ────────────────────────────────────────────────────
  function drawImg (key, x, y, w, h) {
    var rd = r();
    if (!AM || !AM.loaded(key)) return false;
    var img = AM.get(key);
    rd.glDrawImage(img, x, y, w, h);
    return true;
  }

  M3.SceneAddDesk.draw = function () {
    var rd = r();
    if (!rd || !_visible) return;
    var hb = rd.getHitBtns();
    var W = M3.Layout.w, H = M3.Layout.h;

    // ── 黑色透明遮罩（点击面板外区域关闭；点弹窗本身不关闭）──
    rd.fillRect(0, 0, W, H, 'rgba(0,0,0,0.6)');

    // ── 面板（整图 492 x 272，等比缩放居中）──
    var pw = Math.min(Math.round(W * 0.9), 500);
    var ph = Math.round(pw * 272 / 492);
    var px = Math.round((W - pw) / 2);
    var py = Math.round((H - ph) / 2);
    var s = pw / 492;

    // 遮罩热区只覆盖面板外的四块区域，面板本体点击不触发关闭
    pushBtn(hb, 0, 0, W, py, 'adddesk_mask', hide);
    pushBtn(hb, 0, py + ph, W, H - py - ph, 'adddesk_mask', hide);
    pushBtn(hb, 0, py, px, ph, 'adddesk_mask', hide);
    pushBtn(hb, px + pw, py, W - px - pw, ph, 'adddesk_mask', hide);
    // 面板本体兜底热区：吃掉所有点击，防止穿透到下层主页按钮
    pushBtn(hb, px, py, pw, ph, 'adddesk_panel', null);

    // ── 关闭 X (34x34)：骑缝贴「可见」右缘 x=490（嵌入 4px），
    //     绘制在 bg 下层，嵌入部分被 bg 盖住（与欢迎礼包/看广告弹窗同款）──
    var cSz = 34 * s;
    var cX = px + 486 * s, cY = py + 23 * s;
    var cpressed = beginPress('adddesk_close', cX + cSz / 2, cY + cSz / 2);
    drawImg(RES.close[0], cX, cY, cSz, cSz);
    endPress(cpressed);
    pushBtn(hb, cX, cY, cSz, cSz, 'adddesk_close', hide);

    drawImg(RES.panel[0], px, py, pw, ph);

    // ── 「立即加桌」按钮：黄按钮底图(123x40) + 代码叠字（白字+#C75602 描边）──
    // 底部深色底座区实测 y 187~252，按钮居中（水平居中于面板中心线 x=246）
    var btW = 123 * s, btH = 40 * s;
    var btX = px + 184.5 * s, btY = py + 207 * s;

    // ── 奖励文案「金豆×N」叠在按钮上方（金额由服务端下发）──
    if (_rewardAmount > 0) {
      var rewardFS = Math.max(13, Math.round(16 * s));
      var rewardLabel = '金豆×' + M3.Game.formatBeans(_rewardAmount);
      rd.glFillText(rewardLabel, px + 360 * s, py + 174 * s,
        '800 ' + rewardFS + 'px sans-serif',
        '#FAE9AF', 'center', 'middle');
    }

    var bpressed = beginPress('adddesk_btn', btX + btW / 2, btY + btH / 2);
    drawImg(RES.btn[0], btX, btY, btW, btH);
    rd.glFillTextStroke('添加桌面', btX + btW / 2, btY + btH / 2,
      '800 ' + Math.max(12, Math.round(17 * s)) + 'px sans-serif',
      '#FFFFFF', '#C75602', Math.max(2.5, 17 * s * 0.16), 'center', 'middle');
    endPress(bpressed);
    pushBtn(hb, btX, btY, btW, btH, 'adddesk_btn', confirmAddDesk);
  };

  // ─── 工具（与 scene-home.js 相同的按压反馈）─────────────────
  function pushBtn (hb, x, y, w, h, label, fn) {
    hb.push({ x: x, y: y, w: w, h: h, label: label, onClick: fn });
  }

  function beginPress (label, cx, cy, scale) {
    if (!(M3.Input && M3.Input.getPressedLabel && M3.Input.getPressedLabel() === label)) return false;
    var rd = r();
    rd.save();
    rd.translate(cx, cy);
    rd.scale(scale || 0.92, scale || 0.92);
    rd.translate(-cx, -cy);
    return true;
  }

  function endPress (pressed) {
    if (pressed) r().restore();
  }

  // ─── 导出 ────────────────────────────────────────────────────
  M3.SceneAddDesk.show = show;
  M3.SceneAddDesk.hide = hide;
  M3.SceneAddDesk.isVisible = isVisible;
  M3.SceneAddDesk.setRewardAmount = function (amount) { _rewardAmount = amount || 0; };
})();
