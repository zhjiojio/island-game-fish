"""Fetch the pinned, public DouZero WP ONNX artifacts on first Sidecar startup."""

from __future__ import annotations

import hashlib
import json
import logging
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any
from urllib.request import Request, urlopen


LOGGER = logging.getLogger("douzero-sidecar")
HF_REPOSITORY = "palemoky/douzero-baselines"
HF_REVISION = "57b3914046c2a0877016b8b8830fd07cf5b0ba08"
HF_SUBDIRECTORY = "models_onnx/douzero_WP"
CHUNK_SIZE = 1024 * 1024


class ModelFetchError(RuntimeError):
    pass


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(CHUNK_SIZE), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _download_url(filename: str) -> str:
    template = os.getenv("DOUZERO_MODEL_DOWNLOAD_URL_TEMPLATE", "").strip()
    if template:
        try:
            return template.format(
                filename=filename,
                repository=HF_REPOSITORY,
                revision=HF_REVISION,
                subdirectory=HF_SUBDIRECTORY,
            )
        except KeyError as exc:
            raise ModelFetchError("download_url_template_invalid") from exc
    if str(os.getenv("DOUZERO_ALLOW_HUGGINGFACE_DOWNLOAD", "true")).lower() not in {"1", "true", "yes"}:
        raise ModelFetchError("model_cache_missing_and_public_download_disabled")
    return (
        f"https://huggingface.co/{HF_REPOSITORY}/resolve/{HF_REVISION}/"
        f"{HF_SUBDIRECTORY}/{filename}?download=true"
    )


def _download_verified(url: str, target: Path, expected_sha256: str, timeout_seconds: int) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    request = Request(url, headers={"User-Agent": "ddz-douzero-sidecar/0.1"})
    with NamedTemporaryFile(dir=target.parent, prefix=f".{target.name}.", suffix=".part", delete=False) as temp:
        temporary_path = Path(temp.name)
        try:
            with urlopen(request, timeout=timeout_seconds) as response:
                while chunk := response.read(CHUNK_SIZE):
                    temp.write(chunk)
            temp.flush()
            os.fsync(temp.fileno())
            actual_sha256 = _sha256(temporary_path)
            if actual_sha256 != expected_sha256:
                raise ModelFetchError(f"download_sha_mismatch:{target.name}")
            os.replace(temporary_path, target)
        except Exception:
            temporary_path.unlink(missing_ok=True)
            raise


def ensure_models(model_dir: Path, manifest_path: Path) -> None:
    """Reuse verified cache; otherwise fetch from a configured mirror or HuggingFace."""
    if str(os.getenv("DOUZERO_AUTO_DOWNLOAD", "true")).lower() not in {"1", "true", "yes"}:
        return
    try:
        manifest: dict[str, Any] = json.loads(manifest_path.read_text(encoding="utf-8"))
        entries = manifest.get("models") or {}
        timeout_seconds = max(10, min(600, int(os.getenv("DOUZERO_DOWNLOAD_TIMEOUT_SECONDS", "300"))))
        for position, entry in entries.items():
            filename = str(entry.get("file") or "")
            expected_sha256 = str(entry.get("sha256") or "").lower()
            if not filename or Path(filename).name != filename or len(expected_sha256) != 64:
                raise ModelFetchError(f"manifest_model_invalid:{position}")
            target = (model_dir / filename).resolve()
            if target.parent != model_dir.resolve():
                raise ModelFetchError(f"model_path_invalid:{position}")
            if target.is_file() and _sha256(target) == expected_sha256:
                continue
            LOGGER.info("DouZero model cache miss; download started position=%s", position)
            _download_verified(_download_url(filename), target, expected_sha256, timeout_seconds)
            LOGGER.info("DouZero model download completed position=%s", position)
    except ModelFetchError:
        raise
    except Exception as exc:
        raise ModelFetchError(f"download_failed:{exc.__class__.__name__}") from exc
