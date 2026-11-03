"""Model loading, supply-chain verification and ONNX inference."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from time import perf_counter
from typing import Any

import numpy as np
import onnxruntime as ort

from features import POSITIONS, FeatureError, build_feature_batches


class ModelUnavailableError(RuntimeError):
    pass


class InferenceError(RuntimeError):
    pass


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class ModelRegistry:
    def __init__(self, model_dir: Path, manifest_path: Path) -> None:
        self.model_dir = model_dir.resolve()
        self.manifest_path = manifest_path.resolve()
        self.sessions: dict[str, ort.InferenceSession] = {}
        self.manifest: dict[str, Any] = {}
        self.manifest_sha256 = ""
        self.error = "not_loaded"

    @property
    def ready(self) -> bool:
        return len(self.sessions) == len(POSITIONS) and not self.error

    def load(self) -> None:
        self.sessions = {}
        self.error = ""
        try:
            raw_manifest = self.manifest_path.read_bytes()
            self.manifest_sha256 = hashlib.sha256(raw_manifest).hexdigest()
            require_manifest_digest = str(
                os.getenv("DOUZERO_REQUIRE_APPROVED_MANIFEST_SHA256", "true")
            ).lower() in {"1", "true", "yes"}
            if require_manifest_digest:
                approved_manifest_sha256 = os.getenv("DOUZERO_APPROVED_MANIFEST_SHA256", "").strip().lower()
                if len(approved_manifest_sha256) != 64 or any(
                    char not in "0123456789abcdef" for char in approved_manifest_sha256
                ):
                    raise ModelUnavailableError("approved_manifest_sha_missing")
                if self.manifest_sha256 != approved_manifest_sha256:
                    raise ModelUnavailableError("approved_manifest_sha_mismatch")
            self.manifest = json.loads(raw_manifest)
            if self.manifest.get("schema_version") != 1:
                raise ModelUnavailableError("manifest_schema_invalid")
            if self.manifest.get("license_review_status") != "approved":
                raise ModelUnavailableError("model_license_not_approved")
            model_entries = self.manifest.get("models") or {}
            for position in POSITIONS:
                entry = model_entries.get(position) or {}
                filename = str(entry.get("file") or "")
                expected_sha = str(entry.get("sha256") or "").lower()
                if not filename or Path(filename).name != filename:
                    raise ModelUnavailableError(f"model_filename_invalid:{position}")
                if len(expected_sha) != 64 or any(char not in "0123456789abcdef" for char in expected_sha):
                    raise ModelUnavailableError(f"model_sha_missing:{position}")
                model_path = (self.model_dir / filename).resolve()
                if model_path.parent != self.model_dir or not model_path.is_file():
                    raise ModelUnavailableError(f"model_missing:{position}")
                if _sha256(model_path) != expected_sha:
                    raise ModelUnavailableError(f"model_sha_mismatch:{position}")
                session_options = ort.SessionOptions()
                session_options.intra_op_num_threads = max(
                    1, min(8, int(os.getenv("DOUZERO_INTRA_OP_THREADS", "1")))
                )
                session_options.inter_op_num_threads = max(
                    1, min(4, int(os.getenv("DOUZERO_INTER_OP_THREADS", "1")))
                )
                session = ort.InferenceSession(
                    str(model_path), sess_options=session_options, providers=["CPUExecutionProvider"]
                )
                self._validate_session(position, session)
                self.sessions[position] = session
        except Exception as exc:  # Keep the process alive; readiness exposes the gate.
            self.sessions = {}
            self.error = str(exc)[:160] or exc.__class__.__name__

    @staticmethod
    def _validate_session(position: str, session: ort.InferenceSession) -> None:
        inputs = {item.name: item for item in session.get_inputs()}
        outputs = {item.name: item for item in session.get_outputs()}
        if not {"x", "z"}.issubset(inputs) or "values" not in outputs:
            raise ModelUnavailableError(f"model_contract_names_invalid:{position}")
        x_width = 373 if position == "landlord" else 484
        x_shape = inputs["x"].shape
        z_shape = inputs["z"].shape
        values_shape = outputs["values"].shape
        if inputs["x"].type != "tensor(float)" or inputs["z"].type != "tensor(float)":
            raise ModelUnavailableError(f"model_input_dtype_invalid:{position}")
        if outputs["values"].type != "tensor(float)":
            raise ModelUnavailableError(f"model_output_dtype_invalid:{position}")
        if len(x_shape) != 2 or x_shape[1] != x_width:
            raise ModelUnavailableError(f"model_x_shape_invalid:{position}")
        # The published WP ONNX exports use a dynamic history-axis name
        # (``['batch', 'seq_len', 162]``).  Node still always provides the
        # canonical five 162-wide history blocks, verified by the smoke run.
        if len(z_shape) != 3 or z_shape[2] != 162:
            raise ModelUnavailableError(f"model_z_shape_invalid:{position}")
        if len(values_shape) != 2 or values_shape[1] != 1:
            raise ModelUnavailableError(f"model_output_shape_invalid:{position}")
        smoke = session.run(
            ["values"],
            {
                "x": np.zeros((1, x_width), dtype=np.float32),
                "z": np.zeros((1, 5, 162), dtype=np.float32),
            },
        )[0]
        scores = np.asarray(smoke)
        if scores.shape != (1, 1) or not np.isfinite(scores).all():
            raise ModelUnavailableError(f"model_smoke_invalid:{position}")

    def safe_status(self) -> dict[str, Any]:
        return {
            "ready": self.ready,
            "model": str(self.manifest.get("name") or "douzero-wp")[:64],
            "version": str(self.manifest.get("version") or "unconfigured")[:64],
            "manifest_sha256": self.manifest_sha256,
            "reason": None if self.ready else self.error,
        }

    def decide(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.ready:
            raise ModelUnavailableError(self.error or "models_not_ready")
        position = payload["position"]
        session = self.sessions.get(position)
        if session is None:
            raise ModelUnavailableError("position_model_not_ready")
        candidates = payload["candidates"]
        started = perf_counter()
        try:
            x_batch, z_batch = build_feature_batches(payload)
            if len(candidates) == 1:
                best_index = 0
            else:
                values = session.run(["values"], {"z": z_batch, "x": x_batch})[0]
                scores = np.asarray(values)
                if scores.shape != (len(candidates), 1):
                    raise InferenceError("model_output_size_mismatch")
                if not np.isfinite(scores).all():
                    raise InferenceError("model_output_not_finite")
                best_index = int(np.argmax(scores[:, 0]))
            elapsed_ms = max(0, round((perf_counter() - started) * 1000))
            entry = self.manifest["models"][position]
            return {
                "schema_version": 1,
                "decision_id": payload["decision_id"],
                "candidate_id": candidates[best_index]["id"],
                "model": {
                    "name": str(self.manifest.get("name") or "douzero-wp")[:64],
                    "version": str(self.manifest.get("version") or "unknown")[:64],
                    "sha256": entry["sha256"],
                },
                "inference_ms": elapsed_ms,
            }
        except (FeatureError, InferenceError):
            raise
        except Exception as exc:
            raise InferenceError(exc.__class__.__name__) from exc
