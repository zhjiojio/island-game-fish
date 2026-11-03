# 模型目录

默认第一次启动会自动将 `landlord.onnx`、`landlord_down.onnx`、`landlord_up.onnx` 下载至 Compose 的持久化模型卷。下载源、固定 commit 和每份 SHA-256 均在代码与 `../model-manifest.json` 中固定；文件只会在下载校验完成后写入。

需要替换为其他审核制品时，先将三份文件放入本目录，并同步填写 `../model-manifest.json`：

- 将 `license_review_status` 改为 `approved`；
- 填写内部制品来源和版本；
- 填写三份文件各自的 SHA-256。
- 正式审核环境：由独立审核/制品系统计算完整 `model-manifest.json` 的 SHA-256，并通过部署环境变量 `DOUZERO_APPROVED_MANIFEST_SHA256` 注入，同时设置 `DOUZERO_REQUIRE_APPROVED_MANIFEST_SHA256=true`。该值不能写回仓库中的 Compose 或 manifest。

服务不会下载模型。外部审批摘要缺失/不匹配、文件缺失、授权状态未通过或权重哈希不一致时，进程仍可启动且 `/healthz` 正常，但 `/readyz` 返回 `503`，Node.js 自动使用规则 AI。
