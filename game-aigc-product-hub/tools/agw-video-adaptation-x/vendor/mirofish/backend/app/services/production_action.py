"""Typed production actions executed by Codex CLI inside a domain workspace."""

from __future__ import annotations

import os
import subprocess
import threading
from pathlib import Path
from typing import Dict

from ..models.task import TaskManager, TaskStatus


class ProductionActionService:
    ROUTES: Dict[str, str] = {
        "story.parse": "structured-story",
        "story.complete_branch": "structured-story",
        "gameplay.extract": "gameplay-decomposition",
        "characters.generate_candidate": "character-assets",
        "characters.check_consistency": "character-assets",
        "video.plan_shots": "video-production",
        "video.generate_batch": "video-production",
        "video.review": "video-production",
        "assembly.check": "game-assembly",
        "release.check": "game-release",
    }

    @classmethod
    def supports(cls, action: str) -> bool:
        return action in cls.ROUTES

    @classmethod
    def start(cls, project_id: str, action: str, instruction: str = "", selected_id: str = "") -> str:
        manager = TaskManager()
        capability = cls.ROUTES[action]
        task_id = manager.create_task("drama_production", {
            "project_id": project_id,
            "action": action,
            "capability": capability,
            "selected_id": selected_id,
        })
        thread = threading.Thread(
            target=cls._run,
            args=(task_id, project_id, action, instruction, capability, selected_id),
            daemon=True,
        )
        thread.start()
        return task_id

    @classmethod
    def _run(cls, task_id: str, project_id: str, action: str, instruction: str, capability: str, selected_id: str) -> None:
        manager = TaskManager()
        workflow_root = Path(os.environ["AGW_X_WORKFLOW_ROOT"]).resolve()
        run_dir = Path(os.environ["AGW_X_RUN_DIR"]).resolve()
        skill_root = workflow_root / "skills" / "agw-video-adaptation-x"
        capability_skill = skill_root / "capabilities" / capability / "SKILL.md"
        contract = skill_root / "references" / "project-contract.md"
        project_path = run_dir / ".agw-x" / "projects" / project_id / "drama_project.json"
        prompt = f"""你正在执行幕间 Studio 的领域生产动作，而不是开放式聊天。

动作：{action}
项目：{project_path}
选中实体：{selected_id or '无'}
补充要求：{instruction or '按当前项目上下文执行此动作'}

完整读取项目契约：{contract}
完整读取领域能力：{capability_skill}
只修改该能力负责的实体集合，并用稳定 ID 表达跨域引用。
未获得明确授权时，不提交付费生成，不替换正式 Anchor 或正式媒体，不构建、上传或发布。
完成后写回项目 JSON，并返回变更实体、下游影响、审核门状态与下一步。
"""
        manager.update_task(task_id, status=TaskStatus.PROCESSING, progress=5, message=f"正在执行 {action}")
        try:
            result = subprocess.run(
                ["codex", "exec", "--json", "--color", "never", "--skip-git-repo-check", "--cd", str(run_dir), "--add-dir", str(workflow_root), "--approve-for-me", "-"],
                input=prompt,
                text=True,
                capture_output=True,
                timeout=3600,
                check=False,
            )
            if result.returncode != 0:
                manager.fail_task(task_id, (result.stderr or result.stdout)[-4000:])
                return
            manager.complete_task(task_id, {"output": result.stdout[-12000:], "capability": capability, "action": action})
        except Exception as error:
            manager.fail_task(task_id, str(error))
