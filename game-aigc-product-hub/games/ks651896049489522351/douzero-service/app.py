"""Private HTTP Sidecar for DouZero ONNX candidate scoring."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal

from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from capacity import FastFailCapacity
from features import CARD_RANKS, POSITIONS, FeatureError
from inference import InferenceError, ModelRegistry, ModelUnavailableError
from model_fetcher import ModelFetchError, ensure_models

LOGGER = logging.getLogger("douzero-sidecar")
ROOT = Path(__file__).resolve().parent
MODEL_DIR = Path(os.getenv("DOUZERO_MODEL_DIR", ROOT / "models"))
MANIFEST_PATH = Path(os.getenv("DOUZERO_MODEL_MANIFEST", ROOT / "model-manifest.json"))
MAX_REQUEST_BYTES = max(4096, int(os.getenv("DOUZERO_MAX_REQUEST_BYTES", "262144")))
MAX_CONCURRENT = max(1, min(32, int(os.getenv("DOUZERO_MAX_CONCURRENT", "4"))))
Position = Literal["landlord", "landlord_down", "landlord_up"]
CardList = Annotated[list[int], Field(max_length=54)]


class Candidate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^a[0-9]+$", max_length=16)
    cards: Annotated[list[int], Field(max_length=20)]

    @field_validator("cards")
    @classmethod
    def valid_cards(cls, cards: list[int]) -> list[int]:
        if any(card not in CARD_RANKS for card in cards):
            raise ValueError("invalid_card_rank")
        return cards


class DecidePlayRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal[1]
    decision_id: str = Field(min_length=1, max_length=160)
    position: Position
    hand: CardList
    bottom_cards: Annotated[list[int], Field(min_length=3, max_length=3)]
    played_cards: dict[Position, CardList]
    action_sequence: Annotated[list[Annotated[list[int], Field(max_length=20)]], Field(max_length=256)]
    num_cards_left: dict[Position, int]
    last_move: Annotated[list[int], Field(max_length=20)]
    last_move_position: Position | None
    last_move_by_position: dict[Position, Annotated[list[int], Field(max_length=20)]]
    must_play: bool
    bomb_count: int = Field(ge=0, le=14)
    candidates: Annotated[list[Candidate], Field(min_length=1, max_length=1024)]

    @field_validator("hand", "bottom_cards", "last_move")
    @classmethod
    def valid_cards(cls, cards: list[int]) -> list[int]:
        if any(card not in CARD_RANKS for card in cards):
            raise ValueError("invalid_card_rank")
        return cards

    @model_validator(mode="after")
    def validate_contract(self) -> "DecidePlayRequest":
        expected = set(POSITIONS)
        if set(self.played_cards) != expected or set(self.num_cards_left) != expected or set(self.last_move_by_position) != expected:
            raise ValueError("position_maps_incomplete")
        ids = [candidate.id for candidate in self.candidates]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate_candidate_id")
        if self.must_play and any(not candidate.cards for candidate in self.candidates):
            raise ValueError("pass_candidate_while_leading")
        if any(card not in CARD_RANKS for actions in self.played_cards.values() for card in actions):
            raise ValueError("invalid_played_card_rank")
        if any(card not in CARD_RANKS for action in self.action_sequence for card in action):
            raise ValueError("invalid_history_card_rank")
        if any(card not in CARD_RANKS for actions in self.last_move_by_position.values() for card in actions):
            raise ValueError("invalid_last_move_rank")
        return self


registry = ModelRegistry(MODEL_DIR, MANIFEST_PATH)


capacity = FastFailCapacity(MAX_CONCURRENT)


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        await run_in_threadpool(ensure_models, MODEL_DIR, MANIFEST_PATH)
    except ModelFetchError as exc:
        # The service must remain alive so Node can observe an explicit not-ready state
        # and retain its existing rule-AI fallback.
        registry.error = str(exc)[:160]
    await run_in_threadpool(registry.load)
    status = registry.safe_status()
    if status["ready"]:
        LOGGER.info("DouZero models ready version=%s", status["version"])
    else:
        LOGGER.warning("DouZero models unavailable; Node will use rule AI reason=%s", status["reason"])
    yield


app = FastAPI(title="DouZero Sidecar", version="1", lifespan=lifespan)


class RequestTooLargeError(Exception):
    pass


class RequestSizeLimitMiddleware:
    def __init__(self, app, maximum_bytes: int) -> None:
        self.application = app
        self.maximum_bytes = maximum_bytes

    async def __call__(self, scope, receive, send) -> None:
        if scope.get("type") != "http":
            await self.application(scope, receive, send)
            return
        headers = dict(scope.get("headers") or [])
        content_length = headers.get(b"content-length")
        try:
            if content_length and int(content_length) > self.maximum_bytes:
                await JSONResponse(status_code=413, content={"detail": "request_too_large"})(scope, receive, send)
                return
        except ValueError:
            await JSONResponse(status_code=400, content={"detail": "invalid_content_length"})(scope, receive, send)
            return

        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message.get("type") == "http.request":
                received += len(message.get("body", b""))
                if received > self.maximum_bytes:
                    raise RequestTooLargeError()
            return message

        try:
            await self.application(scope, limited_receive, send)
        except RequestTooLargeError:
            await JSONResponse(status_code=413, content={"detail": "request_too_large"})(scope, receive, send)


app.add_middleware(RequestSizeLimitMiddleware, maximum_bytes=MAX_REQUEST_BYTES)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz")
async def readyz():
    status = registry.safe_status()
    return JSONResponse(status_code=200 if status["ready"] else 503, content=status)


@app.post("/v1/decide-play")
async def decide_play(body: DecidePlayRequest):
    if not registry.ready:
        raise HTTPException(status_code=503, detail="models_not_ready")
    if not await capacity.try_acquire():
        raise HTTPException(status_code=503, detail="busy")
    import time
    t0 = time.monotonic()
    try:
        try:
            result = await run_in_threadpool(registry.decide, body.model_dump())
            elapsed_ms = int((time.monotonic() - t0) * 1000)
            LOGGER.info(
                "decide-play position=%s candidates=%d candidate_id=%s inference_ms=%s decision_id=%s",
                body.position,
                len(body.candidates),
                result.get("candidate_id", "?"),
                result.get("inference_ms", elapsed_ms),
                body.decision_id[:32],
            )
            return result
        except ModelUnavailableError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except FeatureError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except InferenceError as exc:
            LOGGER.error("DouZero inference failed reason=%s", str(exc)[:80])
            raise HTTPException(status_code=500, detail="inference_failed") from exc
    finally:
        await capacity.release()
