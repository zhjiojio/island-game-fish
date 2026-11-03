"""Structured drama project storage and force-graph projections."""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List


def _now() -> str:
    return datetime.now().isoformat()


class DramaProjectStore:
    """Persist drama entities once and expose multiple GraphPanel projections."""

    GRAPH_MODES = ("story", "branches", "characters", "gameplay", "shots")

    def __init__(self, root: str | os.PathLike[str]):
        self.root = Path(root).expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, project_id: str) -> Path:
        return self.root / project_id / "drama_project.json"

    def create(self, name: str, project_id: str | None = None) -> Dict[str, Any]:
        project_id = project_id or f"drama_{uuid.uuid4().hex[:12]}"
        scene_id = "scene-opening"
        data = {
            "project_id": project_id,
            "name": name or "未命名剧游",
            "status": "story_building",
            "current_workspace": "story",
            "created_at": _now(),
            "updated_at": _now(),
            "chapters": [
                {"id": "chapter-1", "name": "第一章", "order": 1, "scene_ids": [scene_id], "summary": "等待构建章节内容"}
            ],
            "scenes": [
                {"id": scene_id, "name": "开场", "chapter_id": "chapter-1", "summary": "等待构建场景", "character_ids": [], "next_scene_ids": [], "choice_ids": []}
            ],
            "choices": [],
            "variables": [],
            "gameplay_nodes": [],
            "gameplay_relations": [],
            "characters": [],
            "relationships": [],
            "shots": [],
            "media": [],
            "components": [],
            "tasks": [],
        }
        self.save(data)
        return data

    def save(self, data: Dict[str, Any]) -> None:
        project_id = data["project_id"]
        path = self._path(project_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        data["updated_at"] = _now()
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(path)

    def get(self, project_id: str) -> Dict[str, Any] | None:
        path = self._path(project_id)
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def list(self) -> List[Dict[str, Any]]:
        projects = []
        for path in self.root.glob("*/drama_project.json"):
            try:
                projects.append(json.loads(path.read_text(encoding="utf-8")))
            except (OSError, ValueError):
                continue
        return sorted(projects, key=lambda item: item.get("updated_at", ""), reverse=True)

    @staticmethod
    def _node(item: Dict[str, Any], entity_type: str, **attributes: Any) -> Dict[str, Any]:
        stable_types = {
            "章节": "chapter", "场景": "scene", "选择": "choice", "人物": "character",
            "玩法": "mechanic", "规则": "rule", "资源": "resource", "状态": "state",
            "事件": "event", "反馈": "feedback", "镜头": "shot", "媒体": "media",
        }
        return {
            "uuid": item["id"],
            "name": item.get("name") or item.get("title") or item["id"],
            "labels": ["Entity", entity_type],
            "entity_type": stable_types.get(entity_type, entity_type),
            "summary": item.get("summary") or item.get("description") or "",
            "attributes": {**item, **attributes},
            "created_at": item.get("created_at"),
        }

    @staticmethod
    def _edge(source: str, target: str, relation: str, edge_id: str | None = None, **attributes: Any) -> Dict[str, Any]:
        return {
            "uuid": edge_id or f"{source}-{relation}-{target}",
            "source_node_uuid": source,
            "target_node_uuid": target,
            "name": relation,
            "fact_type": relation,
            "fact": attributes.pop("description", ""),
            "attributes": attributes,
        }

    def graph(self, project_id: str, mode: str = "story") -> Dict[str, Any]:
        if mode not in self.GRAPH_MODES:
            raise ValueError(f"unsupported graph mode: {mode}")
        data = self.get(project_id)
        if data is None:
            raise KeyError(project_id)

        nodes: List[Dict[str, Any]] = []
        edges: List[Dict[str, Any]] = []

        if mode == "story":
            nodes.extend(self._node(item, "章节") for item in data.get("chapters", []))
            nodes.extend(self._node(item, "场景") for item in data.get("scenes", []))
            for chapter in data.get("chapters", []):
                for scene_id in chapter.get("scene_ids", []):
                    edges.append(self._edge(chapter["id"], scene_id, "包含场景"))
            for scene in data.get("scenes", []):
                for character_id in scene.get("character_ids", []):
                    character = next((item for item in data.get("characters", []) if item["id"] == character_id), None)
                    if character and not any(node["uuid"] == character_id for node in nodes):
                        nodes.append(self._node(character, "人物"))
                    if character:
                        edges.append(self._edge(character_id, scene["id"], "出场于"))
        elif mode == "branches":
            nodes.extend(self._node(item, "场景") for item in data.get("scenes", []))
            nodes.extend(self._node(item, "选择") for item in data.get("choices", []))
            choice_sources = set()
            for choice in data.get("choices", []):
                source = choice.get("scene_id") or choice.get("source_scene_id")
                target = choice.get("target_scene_id")
                if source:
                    choice_sources.add(source)
                    edges.append(self._edge(source, choice["id"], "出现选择", f"{choice['id']}-source"))
                if target:
                    edges.append(self._edge(choice["id"], target, choice.get("text") or "进入分支", choice["id"]))
            for scene in data.get("scenes", []):
                if scene["id"] in choice_sources:
                    continue
                for next_id in scene.get("next_scene_ids", []):
                    edges.append(self._edge(scene["id"], next_id, "场景流向"))
        elif mode == "characters":
            nodes.extend(self._node(item, "人物") for item in data.get("characters", []))
            for relation in data.get("relationships", []):
                edges.append(self._edge(
                    relation["source_id"], relation["target_id"],
                    relation.get("type") or relation.get("name") or "人物关系",
                    relation.get("id"), description=relation.get("description", "")
                ))
        elif mode == "gameplay":
            type_labels = {
                "mechanic": "玩法", "rule": "规则", "resource": "资源",
                "state": "状态", "event": "事件", "feedback": "反馈",
            }
            lookup: Dict[str, tuple[Dict[str, Any], str]] = {}
            for key, label in (("chapters", "章节"), ("scenes", "场景"), ("choices", "选择"), ("characters", "人物")):
                for item in data.get(key, []):
                    lookup[item["id"]] = (item, label)
            for item in data.get("gameplay_nodes", []):
                lookup[item["id"]] = (item, type_labels.get(item.get("type"), "玩法"))
            included = set()
            for relation in data.get("gameplay_relations", []):
                for endpoint in (relation.get("source_id"), relation.get("target_id")):
                    if endpoint in lookup and endpoint not in included:
                        item, label = lookup[endpoint]
                        nodes.append(self._node(item, label))
                        included.add(endpoint)
                if relation.get("source_id") and relation.get("target_id"):
                    edges.append(self._edge(
                        relation["source_id"], relation["target_id"],
                        relation.get("type") or relation.get("name") or "玩法关系",
                        relation.get("id"), description=relation.get("description", ""),
                    ))
        else:
            nodes.extend(self._node(item, "场景") for item in data.get("scenes", []))
            nodes.extend(self._node(item, "镜头") for item in data.get("shots", []))
            nodes.extend(self._node(item, "媒体") for item in data.get("media", []))
            for shot in data.get("shots", []):
                if shot.get("scene_id"):
                    edges.append(self._edge(shot["scene_id"], shot["id"], "拆分镜头"))
                for media_id in shot.get("media_ids", []):
                    edges.append(self._edge(shot["id"], media_id, "生成媒体"))
                for dependency_id in shot.get("depends_on", []):
                    edges.append(self._edge(dependency_id, shot["id"], "镜头衔接"))

        valid_ids = {node["uuid"] for node in nodes}
        edges = [edge for edge in edges if edge["source_node_uuid"] in valid_ids and edge["target_node_uuid"] in valid_ids]
        return {"nodes": nodes, "edges": edges, "node_count": len(nodes), "edge_count": len(edges), "mode": mode}
