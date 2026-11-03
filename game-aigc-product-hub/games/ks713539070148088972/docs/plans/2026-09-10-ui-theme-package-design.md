# UI 主题包（Theme Package）设计文档

状态：待明日执行 | 范围：整理 `assets/meinv/` 资源目录结构与命名，为未来"配置下发换肤"打基础
原则：本次只重排目录结构 + 重命名文件 + 同步改 `product.config.js` 里的 `local` 路径；**不新增**运行时功能代码，`uiAssets` 的 key 名保持不变（对 `js/` 业务代码零侵入）。

## 背景

当前 `assets/meinv/` 下按"素材来源目录"（icons / components / stateIcon / pages / daily_check）划分，命名风格混杂：
- 语义命名：`btn_home_daily_sign.png`
- 驼峰命名：`levelTitle.png`、`winCard.png`、`welcome-logo.png`
- Figma 导出残留尾巴：`settings_banner_config_g11.png`、`toggle_on_config_5850.png`、`icon_music_config_5855.png` 等 `_config_xxxx`
- 空格文件名：`assets/meinv/logo/image 5864.png`
- 目录职责重叠：按钮分散在 `components/` 和 `icons/` 两处（如 `mnvBtnSetting` 实际指向 `components/btn_setting.png`，但同类按钮 `btn_game_*` 却在 `icons/`）

这些问题不影响当前运行（因为 `product.config.js` 的 `uiAssets` 已做了 key→路径 的间接层），但会导致：
1. 无法直观判断一张图属于"通用UI组件"还是"业务专属素材"，未来做主题包时不知道该不该被换肤配置覆盖；
2. 目录结构本身不是"协议"，无法被约定为可下发的固定相对路径规范；
3. 新美术出图时命名标准不统一，越攒越乱。

## 一、主题包协议

- 一套主题 = 一个完整目录（本地 `assets/<themeId>/`，云端对应同构的 CDN 目录）。
- 下发只给 `themeManifestUrl`，manifest 内容：`{ themeId, version, cdnBase, files: [{path, md5}] }`。
- 客户端按**固定相对路径**从 `cdnBase` 拼接完整链接，无需为每个 key 单独维护 CDN URL。
- `uiAssets[key].local` 保持指向本地兜底文件；`uiAssets[key].cdn` 在运行时由 `主题cdnBase + 该key对应的主题内相对路径` 自动推导（相对路径与 `local` 去掉 `assets/<themeId>/` 前缀后一致），因此只要相对路径规范统一，新增主题不需要改代码，只需要换 `cdnBase` + 下发一份新目录。
- 音频（BGM/SFX/VO）与内容图（`effect/`、`pages/` 里的玩法相关图）按你的决定，一并纳入主题包统一管理，全部随主题整体替换。

## 二、新目录结构

用"UI 元素类型"分层，取代现在按素材来源分的五个目录：

```
assets/<themeId>/                  例：assets/meinv/ 保持当前目录名不变，作为默认主题
  ui/                              通用 UI 组件（任何主题都需要有的同名文件）
    btn/                           按钮：ui_btn_close.png、ui_btn_back.png、ui_btn_setting.png ...
    icon/                          图标：ui_icon_lock.png、ui_icon_hourglass.png ...
    badge/                         角标：ui_badge_hot.png、ui_badge_new.png ...
    frame/                        选框/边框：ui_frame_dashed.png、ui_frame_avatar.png
    card/                          卡片底板：ui_card_note_white.png、ui_card_win.png
    toggle/                        开关：ui_toggle_on.png、ui_toggle_off.png
    arrow/                         箭头：ui_arrow_left.png、ui_arrow_double_left.png
  biz/                             业务专属素材（按业务模块分子目录，仅本产品/本玩法需要）
    checkin/                       biz_checkin_day1.png ... biz_checkin_claim_btn.png
    unlock/                        biz_unlock_ribbon.png、biz_unlock_lock_icon.png
    share/                         biz_share_ribbon.png、biz_share_btn_now.png
    settings/                      biz_settings_banner.png
    lose/ win/                     biz_lose_card.png、biz_win_decoration.png
    hud/                           biz_hud_lives_bar_empty.png、biz_hud_times_bar_empty.png
  bg/                              页面级背景大图：bg_gradient_purple.png、bg_puzzle_pattern.png
  fx/                              特效：fx_trail_00.png...fx_trail_07.png、win_fx_glow.png、skeleton.*
  audio/                           保持现有三级子目录：BGM/ SFX/ VO/
```

命名规则：`<模块前缀>_<类型>_<语义>[_状态].png`，全部小写 + 下划线（snake_case），禁止空格、禁止 Figma 图层 ID 尾巴（`_config_5858`、`5864` 之类）。

## 三、新旧文件名映射（草案，供明日执行时对照）

按当前 `product.config.js` 里出现的 149 个 `uiAssets` key 逐一生成 `旧路径 → 新路径`，执行时会：
1. 生成完整映射表（用脚本跑一遍 `uiAssets` + `audio` 两个配置块，自动导出 CSV/MD）；
2. 按映射 `git mv` 迁移文件（保留 git 历史）；
3. 同步替换 `product.config.js` 里对应的 `local` 字段；
4. 全局搜索确认没有硬编码路径的遗漏引用（例如 spine `skeleton.json/atlas` 内部是否引用了 `trail_*.png` 的相对路径，需要一并检查更新）；
5. 跑一遍游戏截图/关键页面自测，确认没有图丢失（404）。

示例（完整表见执行时生成的 `docs/plans/2026-09-10-ui-theme-package-migration.csv`）：

| key | 旧路径 | 新路径 |
|---|---|---|
| mnvXBtn | assets/meinv/icons/xBtn.png | assets/meinv/ui/btn/ui_btn_close.png |
| mnvBtnBack | assets/meinv/icons/mnv_btn_back.png | assets/meinv/ui/btn/ui_btn_back.png |
| mnvToggleOn | assets/meinv/icons/toggle_on_config_5850.png | assets/meinv/ui/toggle/ui_toggle_on.png |
| mnvToggleOff | assets/meinv/icons/toggle_off_config_5856.png | assets/meinv/ui/toggle/ui_toggle_off.png |
| mnvSettingsBanner | assets/meinv/components/settings_banner_config_g11.png | assets/meinv/biz/settings/biz_settings_banner.png |
| checkinDay1..7 | assets/meinv/daily_check/card_checkin_day*.png | assets/meinv/biz/checkin/biz_checkin_day*.png |
| mnvFlyTrail00..07 | assets/meinv/effect/frames/trail_*.png | assets/meinv/fx/fx_trail_*.png |
| gameLogo | assets/meinv/icons/welcome-logo.png | assets/meinv/biz/welcome/biz_welcome_logo.png |
| （其余同理，按 ui_/biz_ 规则逐条生成） | | |

`logo/image 5864.png` 等三个未在 `uiAssets` 里引用（疑似废弃 Figma 导出，需先确认代码中确实无引用后再决定删除或归档，不直接删）。

## 四、执行 Checklist（明日按此顺序做）

1. 跑脚本导出 `uiAssets` + `audio` 全量 key/路径映射表，人工过一遍补全 `新路径` 列
2. 检查 `logo/`、`daily_check/` 等目录下有没有代码未引用的孤儿文件，单独列出待确认清单，不擅自删除
3. 按新目录结构创建目录，用 `git mv` 迁移+改名（保留历史，禁止直接删了重新加）
4. 同步更新 `product.config.js` 里所有 `local` 字段
5. 检查 `assets/meinv/effect/skeleton.atlas` 内部纹理引用路径是否需要同步改
6. 全量运行游戏，走一遍首页/关卡/签到/设置/解锁/分享/失败/胜利各弹窗，确认贴图无 404
7. 提交 commit，说明"仅路径重排+改名，不涉及功能逻辑"

## 五、后续（本次不做，仅记录方向）

- 待目录/命名规范跑通一版真实主题后，再在 `core/config.js` 里补充 `themeManifest` 拉取与 `cdn` 字段自动推导逻辑（当前 `cdn` 字段仍是手工可选填，可先不动）。
- 语音包（`voicePacks`）体系是否纳入主题包，需要单独评估（人设文案/音色强绑定角色，不一定适合跟随视觉主题切换）。
