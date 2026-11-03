import tempfile
import unittest
import importlib.util

from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "vendor" / "mirofish" / "backend"
MODULE_PATH = BACKEND / "app" / "models" / "drama_project.py"
SPEC = importlib.util.spec_from_file_location("drama_project", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
DramaProjectStore = MODULE.DramaProjectStore


class DramaProjectStoreTest(unittest.TestCase):
    def test_all_visual_modes_use_the_same_nodes_and_edges_contract(self):
        with tempfile.TemporaryDirectory() as root:
            store = DramaProjectStore(root)
            project = store.create("测试剧游")

            story = store.graph(project["project_id"], "story")
            self.assertEqual({"nodes", "edges", "node_count", "edge_count", "mode"}, set(story))
            self.assertEqual("story", story["mode"])
            self.assertIn("chapter", {node["entity_type"] for node in story["nodes"]})
            self.assertIn("scene", {node["entity_type"] for node in story["nodes"]})

            for mode in ("branches", "characters", "gameplay", "shots"):
                graph = store.graph(project["project_id"], mode)
                self.assertEqual(mode, graph["mode"])
                self.assertIsInstance(graph["nodes"], list)
                self.assertIsInstance(graph["edges"], list)

    def test_branch_and_gameplay_graphs_project_structured_relations(self):
        with tempfile.TemporaryDirectory() as root:
            store = DramaProjectStore(root)
            project = store.create("关系测试")
            project["scenes"].append({"id": "scene-next", "name": "后续", "chapter_id": "chapter-1", "summary": "", "character_ids": [], "next_scene_ids": [], "choice_ids": []})
            project["choices"] = [{"id": "choice-go", "scene_id": "scene-opening", "target_scene_id": "scene-next", "text": "继续"}]
            project["gameplay_nodes"] = [{"id": "mechanic-vote", "name": "投票", "type": "mechanic", "summary": "影响排名"}]
            project["gameplay_relations"] = [{"id": "gameplay-bind", "source_id": "scene-opening", "target_id": "mechanic-vote", "type": "触发玩法"}]
            store.save(project)

            branches = store.graph(project["project_id"], "branches")
            self.assertIn("choice-go", {edge["uuid"] for edge in branches["edges"]})
            gameplay = store.graph(project["project_id"], "gameplay")
            self.assertIn("mechanic", {node["entity_type"] for node in gameplay["nodes"]})
            self.assertIn("gameplay-bind", {edge["uuid"] for edge in gameplay["edges"]})


if __name__ == "__main__":
    unittest.main()
