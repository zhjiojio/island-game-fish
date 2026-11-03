"""Dependency-light contract tests for Sidecar admission control."""

import unittest
import asyncio
import hashlib
import json
import os
import tempfile
from pathlib import Path
from unittest import mock

from capacity import FastFailCapacity
from model_fetcher import ModelFetchError, _download_url, ensure_models


class FastFailCapacityTest(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_without_queueing_and_recovers_after_release(self) -> None:
        gate = FastFailCapacity(1)
        self.assertTrue(await gate.try_acquire())
        self.assertFalse(await gate.try_acquire())
        await gate.release()
        self.assertTrue(await gate.try_acquire())
        await gate.release()
        self.assertEqual(gate.in_flight, 0)

    async def test_concurrent_attempts_never_exceed_limit(self) -> None:
        gate = FastFailCapacity(3)
        results = await asyncio.gather(*(gate.try_acquire() for _ in range(20)))
        self.assertEqual(sum(results), 3)
        self.assertEqual(gate.in_flight, 3)
        await asyncio.gather(*(gate.release() for _ in range(3)))
        self.assertEqual(gate.in_flight, 0)


class ModelManifestGateTest(unittest.TestCase):
    def setUp(self) -> None:
        try:
            import inference
        except ModuleNotFoundError as exc:
            self.skipTest(f"optional_sidecar_dependencies_missing:{exc.name}")
        self.inference = inference

    @staticmethod
    def _manifest(status: str = "pending") -> dict:
        return {
            "schema_version": 1,
            "name": "douzero-wp",
            "version": "test",
            "license_review_status": status,
            "models": {
                position: {"file": f"{position}.onnx", "sha256": ""}
                for position in ("landlord", "landlord_down", "landlord_up")
            },
        }

    def test_pending_license_keeps_sidecar_unready(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps(self._manifest()), encoding="utf-8")
            registry = self.inference.ModelRegistry(root, manifest)
            with mock.patch.dict(os.environ, {
                "DOUZERO_APPROVED_MANIFEST_SHA256": hashlib.sha256(manifest.read_bytes()).hexdigest()
            }):
                registry.load()
            self.assertFalse(registry.ready)
            self.assertIn("model_license_not_approved", registry.safe_status()["reason"])

    def test_approved_manifest_still_requires_models_and_hashes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps(self._manifest("approved")), encoding="utf-8")
            registry = self.inference.ModelRegistry(root, manifest)
            with mock.patch.dict(os.environ, {
                "DOUZERO_APPROVED_MANIFEST_SHA256": hashlib.sha256(manifest.read_bytes()).hexdigest()
            }):
                registry.load()
            self.assertFalse(registry.ready)
            self.assertIn("model_sha_missing", registry.safe_status()["reason"])

    def test_manifest_requires_external_approval_digest(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps(self._manifest("approved")), encoding="utf-8")
            registry = self.inference.ModelRegistry(root, manifest)
            with mock.patch.dict(os.environ, {"DOUZERO_APPROVED_MANIFEST_SHA256": ""}):
                registry.load()
            self.assertFalse(registry.ready)
            self.assertIn("approved_manifest_sha_missing", registry.safe_status()["reason"])

    def test_manifest_rejects_mismatched_external_approval_digest(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps(self._manifest("approved")), encoding="utf-8")
            registry = self.inference.ModelRegistry(root, manifest)
            with mock.patch.dict(os.environ, {"DOUZERO_APPROVED_MANIFEST_SHA256": "0" * 64}):
                registry.load()
            self.assertFalse(registry.ready)
            self.assertIn("approved_manifest_sha_mismatch", registry.safe_status()["reason"])


class ModelFetcherTest(unittest.TestCase):
    @staticmethod
    def _write_manifest(root: Path, filename: str, digest: str) -> Path:
        manifest = root / "manifest.json"
        manifest.write_text(json.dumps({
            "models": {"landlord": {"file": filename, "sha256": digest}}
        }), encoding="utf-8")
        return manifest

    def test_verified_cache_never_requests_network(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            payload = b"verified-model"
            model = root / "landlord.onnx"
            model.write_bytes(payload)
            manifest = self._write_manifest(root, model.name, hashlib.sha256(payload).hexdigest())
            with mock.patch.dict(os.environ, {
                "DOUZERO_AUTO_DOWNLOAD": "true",
                "DOUZERO_MODEL_DOWNLOAD_URL_TEMPLATE": "",
            }, clear=False):
                with mock.patch("model_fetcher._download_verified") as download:
                    ensure_models(root, manifest)
            download.assert_not_called()

    def test_missing_cache_with_public_download_disabled_is_explicit(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = self._write_manifest(root, "landlord.onnx", "a" * 64)
            with mock.patch.dict(os.environ, {
                "DOUZERO_AUTO_DOWNLOAD": "true",
                "DOUZERO_ALLOW_HUGGINGFACE_DOWNLOAD": "false",
                "DOUZERO_MODEL_DOWNLOAD_URL_TEMPLATE": "",
            }, clear=False):
                with self.assertRaisesRegex(ModelFetchError, "model_cache_missing_and_public_download_disabled"):
                    ensure_models(root, manifest)

    def test_internal_template_overrides_public_source(self) -> None:
        template = "https://artifact.example.internal/{repository}/{revision}/{subdirectory}/{filename}"
        with mock.patch.dict(os.environ, {"DOUZERO_MODEL_DOWNLOAD_URL_TEMPLATE": template}, clear=False):
            url = _download_url("landlord.onnx")
        self.assertIn("artifact.example.internal/palemoky/douzero-baselines/", url)
        self.assertTrue(url.endswith("models_onnx/douzero_WP/landlord.onnx"))


class FeatureContractTest(unittest.TestCase):
    def setUp(self) -> None:
        try:
            import numpy
            import features
        except ModuleNotFoundError as exc:
            self.skipTest(f"optional_sidecar_dependencies_missing:{exc.name}")
        self.numpy = numpy
        self.features = features

    @staticmethod
    def _payload(position: str) -> dict:
        deck = [rank for rank in tuple(range(3, 15)) + (17,) for _ in range(4)] + [20, 30]
        hands = {
            "landlord": deck[:20],
            "landlord_down": deck[20:37],
            "landlord_up": deck[37:54],
        }
        hand = hands[position]
        return {
            "position": position,
            "hand": hand,
            "played_cards": {key: [] for key in self_positions()},
            "action_sequence": [],
            "num_cards_left": {"landlord": 20, "landlord_down": 17, "landlord_up": 17},
            "last_move": [],
            "last_move_by_position": {key: [] for key in self_positions()},
            "bomb_count": 0,
            "candidates": [{"id": "a0", "cards": [hand[0]]}],
        }

    def test_all_positions_match_douzero_tensor_contract(self) -> None:
        for position, expected_width in (("landlord", 373), ("landlord_down", 484), ("landlord_up", 484)):
            with self.subTest(position=position):
                x_batch, z_batch = self.features.build_feature_batches(self._payload(position))
                self.assertEqual(x_batch.shape, (1, expected_width))
                self.assertEqual(z_batch.shape, (1, 5, 162))
                self.assertEqual(x_batch.dtype, self.numpy.float32)
                self.assertEqual(z_batch.dtype, self.numpy.float32)

    def test_history_uses_official_front_padding_and_keeps_latest_fifteen(self) -> None:
        sequence = [[3], [4]]
        encoded = self.features._history_array(sequence).reshape(15, 54)
        self.assertEqual(int(encoded[:13].sum()), 0)
        self.numpy.testing.assert_array_equal(encoded[13], self.features._cards_to_array([3]))
        self.numpy.testing.assert_array_equal(encoded[14], self.features._cards_to_array([4]))

        long_sequence = [[rank] for rank in list(range(3, 15)) + [17, 20, 30, 3, 4]]
        encoded_long = self.features._history_array(long_sequence).reshape(15, 54)
        expected = long_sequence[-15:]
        for index, cards in enumerate(expected):
            self.numpy.testing.assert_array_equal(encoded_long[index], self.features._cards_to_array(cards))


def self_positions() -> tuple[str, str, str]:
    return "landlord", "landlord_down", "landlord_up"


if __name__ == "__main__":
    unittest.main()
