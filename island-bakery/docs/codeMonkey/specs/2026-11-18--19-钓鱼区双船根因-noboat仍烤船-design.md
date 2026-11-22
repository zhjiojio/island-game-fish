# 钓鱼区双船：noboat 仍烤船（R0006）

## 背景

停船 bob 后画面仍两艘船。用户质疑未按 PdeMonster 验收。

## 根因

- 直接：`paintFishingBoatSprite` 再画一艘，而当前底板 `ui-skin-fish-*-noboat` **像素里仍有船**（资源名不实）。  
- 根本：R0005 切 noboat 时只信文件名、未验「底板是否已烤船」；`backdropKey` 加载中还会短暂回退到一体皮（也有烤船）。

## 方案

仅当底板为真无船的 `seabase` / `deepbase` 时才画船精灵；`noboat` / 一体皮只保留烤船，不再叠精灵。

## 预期

画面始终一艘船；兔仍叠在船上。
