# 《我的未婚妻》互动影游 · Makefile
# 快捷入口，等价于 npm scripts

.PHONY: help build build-story build-registry validate validate-schema validate-assets validate-cdn validate-dryrun install-hooks scaffold-choice scaffold-episode index

help:
	@echo "常用命令："
	@echo "  make build              # 编译 content/ → package/js/story.js + package/js/registry.js"
	@echo "  make build-story        # 只编译剧本 → package/js/story.js"
	@echo "  make build-registry     # 只编译白名单 → package/js/registry.js"
	@echo "  make validate           # 全量审计（story + schema + rules + assets 本地）"
	@echo "  make validate-schema    # 只跑 JSON Schema 校验"
	@echo "  make validate-assets    # 只跑本地素材完整性"
	@echo "  make validate-cdn       # 跑 CDN URL 健康度（HEAD 请求）"
	@echo "  make validate-dryrun    # 模拟通关：死链/孤儿/循环/未到达 endings"
	@echo "  make install-hooks      # 安装 git pre-commit hook（新同事必跑一次）"
	@echo "  make index              # 重建 docs/story-index.json"
	@echo "  make scaffold-choice EP=EP03 ID=my_choice PARENT=s5 SPEAKER=婉儿 CHAR=wanerh QUESTION='去哪儿？' OPTIONS='上山|k_up,下山|k_down'"
	@echo "  make scaffold-episode EP=EP10 TITLE='第十集：翻天覆地'"

build: build-registry build-story build-subtitles build-telemetry

.PHONY: build-telemetry test-telemetry
build-telemetry:
	@node scripts/tools/build-telemetry.cjs

test-telemetry:
	@node scripts/tools/test-telemetry.cjs

.PHONY: build-subtitles validate-subtitles
build-subtitles:
	@python3 scripts/subtitles/build_subtitles_js.py

validate-subtitles:
	@node scripts/tools/check-subtitles.js

build-story:
	@node scripts/tools/build-story.js

build-registry:
	@node scripts/tools/build-registry.js

validate:
	@bash scripts/validate-story.sh && node scripts/tools/validate-schema.js && node scripts/tools/validate-rules.js && node scripts/tools/assets-check.js --no-cdn && node scripts/tools/dry-run-story.js && node scripts/tools/check-subtitles.js

validate-dryrun:
	@node scripts/tools/dry-run-story.js

validate-schema:
	@node scripts/tools/validate-schema.js

validate-assets:
	@node scripts/tools/assets-check.js --no-cdn

validate-cdn:
	@node scripts/tools/assets-check.js

install-hooks:
	@bash scripts/hooks/install.sh

index:
	@node scripts/tools/build-story-index.js

scaffold-choice:
	@node scripts/tools/scaffold-choice.js --ep $(EP) --id $(ID) --parent $(PARENT) --speaker $(SPEAKER) --char $(CHAR) --question $(QUESTION) --options $(OPTIONS)

scaffold-episode:
	@node scripts/tools/scaffold-episode.js --ep $(EP) --title $(TITLE)
