"""Drama production API for the Mujian Studio workbench."""

import os
from pathlib import Path

from flask import jsonify, request

from . import drama_bp
from ..models.drama_project import DramaProjectStore
from ..models.task import TaskManager
from ..services.production_action import ProductionActionService


def _store() -> DramaProjectStore:
    run_dir = os.environ.get("AGW_X_RUN_DIR")
    if run_dir:
        root = Path(run_dir) / ".agw-x" / "projects"
    else:
        root = Path(__file__).resolve().parents[2] / "uploads" / "drama_projects"
    return DramaProjectStore(root)


@drama_bp.route('/projects', methods=['GET'])
def list_projects():
    projects = _store().list()
    return jsonify({"success": True, "data": projects, "count": len(projects)})


@drama_bp.route('/projects', methods=['POST'])
def create_project():
    payload = request.get_json(silent=True) or {}
    store = _store()
    project = store.create(payload.get("name") or payload.get("requirement") or "未命名剧游")
    project["requirement"] = payload.get("requirement", "")
    project["seed_files"] = payload.get("seed_files", [])
    store.save(project)
    return jsonify({"success": True, "data": project}), 201


@drama_bp.route('/projects/<project_id>', methods=['GET'])
def get_project(project_id: str):
    project = _store().get(project_id)
    if project is None:
        return jsonify({"success": False, "error": "项目不存在"}), 404
    return jsonify({"success": True, "data": project})


@drama_bp.route('/projects/<project_id>', methods=['PUT'])
def update_project(project_id: str):
    current = _store().get(project_id)
    if current is None:
        return jsonify({"success": False, "error": "项目不存在"}), 404
    payload = request.get_json(silent=True) or {}
    allowed = {"name", "status", "current_workspace", "chapters", "scenes", "choices", "variables", "gameplay_nodes", "gameplay_relations", "characters", "relationships", "shots", "media", "components", "tasks"}
    for key in allowed:
        if key in payload:
            current[key] = payload[key]
    _store().save(current)
    return jsonify({"success": True, "data": current})


@drama_bp.route('/projects/<project_id>/graph', methods=['GET'])
def get_graph(project_id: str):
    mode = request.args.get("mode", "story")
    try:
        graph = _store().graph(project_id, mode)
    except KeyError:
        return jsonify({"success": False, "error": "项目不存在"}), 404
    except ValueError as error:
        return jsonify({"success": False, "error": str(error)}), 400
    return jsonify({"success": True, "data": graph})


@drama_bp.route('/projects/<project_id>/actions', methods=['POST'])
def create_production_action(project_id: str):
    if _store().get(project_id) is None:
        return jsonify({"success": False, "error": "项目不存在"}), 404
    payload = request.get_json(silent=True) or {}
    action = str(payload.get("action") or "").strip()
    if not ProductionActionService.supports(action):
        return jsonify({"success": False, "error": "不支持的生产动作"}), 400
    task_id = ProductionActionService.start(
        project_id,
        action,
        str(payload.get("instruction") or "").strip(),
        str(payload.get("selected_id") or "").strip(),
    )
    return jsonify({"success": True, "data": TaskManager().get_task(task_id).to_dict()}), 202


@drama_bp.route('/actions/<task_id>', methods=['GET'])
def get_production_action(task_id: str):
    task = TaskManager().get_task(task_id)
    if task is None:
        return jsonify({"success": False, "error": "任务不存在"}), 404
    return jsonify({"success": True, "data": task.to_dict()})
