# 视频漫改游运行目录

`agw-video-adaptation` 会把“视频/漫剧 → 互动网页游戏”的运行产物写到这里。

目录格式：

```text
games/video-adaptation/YYYY-MM-DD-<slug>/
  workflow-run.yml
  input/
  docs/
  package/
  assets/
  reports/
```

原始源视频默认只记录路径，不复制进 git 可跟踪产物。只有明确需要归档时才复制，并且要先确认大文件不会被误提交。
