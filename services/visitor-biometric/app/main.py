from __future__ import annotations

import asyncio
import hashlib
import hmac
import os
import time
from collections import OrderedDict, deque
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from starlette.responses import JSONResponse

from .verifier import (
    VerificationInputError,
    compare_faces,
    data_url_from_test_file,
    initialize_deepface,
    load_deepface,
    settings_from_environment,
)

app = FastAPI(title="HIRNA Visitor Biometric Screening", docs_url=None, redoc_url=None, openapi_url=None)


def bounded_int_environment(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        return default
    return max(minimum, min(maximum, value))


_semaphore = asyncio.Semaphore(bounded_int_environment("DEEPFACE_MAX_CONCURRENCY", 1, 1, 8))
_initialization_lock = asyncio.Lock()
_requests: deque[float] = deque()
_cache: OrderedDict[str, tuple[float, str, dict[str, Any]]] = OrderedDict()
_adapter: Any | None = None
_model_initialized = False
_inference_status = "NOT_TESTED"
_inference_tested_at: str | None = None
_readiness_error_code: str | None = None

MAX_ENCODED_IMAGE_LENGTH = ((5 * 1024 * 1024 * 4) // 3) + 128
MAX_REQUEST_BODY_LENGTH = (MAX_ENCODED_IMAGE_LENGTH * 2) + 4096


class VerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    requestId: str = Field(pattern=r"^[0-9a-fA-F-]{36}$")
    idImage: str = Field(min_length=32, max_length=MAX_ENCODED_IMAGE_LENGTH)
    selfieImage: str = Field(min_length=32, max_length=MAX_ENCODED_IMAGE_LENGTH)


class ReadinessRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    runInference: bool = False


@app.middleware("http")
async def reject_oversized_requests(request: Request, call_next: Any) -> Any:
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_REQUEST_BODY_LENGTH:
                return JSONResponse(status_code=413, content={"detail": {"code": "REQUEST_TOO_LARGE", "message": "Verification request exceeds the allowed size."}})
        except ValueError:
            return JSONResponse(status_code=400, content={"detail": {"code": "INVALID_CONTENT_LENGTH", "message": "Request size metadata is invalid."}})
    return await call_next(request)


def enabled() -> bool:
    return os.getenv("VISITOR_BIOMETRIC_ENABLED", "false").lower() == "true"


def authenticate(provided: str | None) -> None:
    expected = os.getenv("VISITOR_BIOMETRIC_SERVICE_KEY", "")
    if len(expected) < 32:
        raise HTTPException(status_code=503, detail={"code": "SERVICE_CONFIGURATION_INVALID", "message": "Service authentication is not configured."})
    if not expected or not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED_SERVICE_REQUEST", "message": "Service authentication failed."})


def rate_limit() -> None:
    now = time.monotonic()
    while _requests and now - _requests[0] > 60:
        _requests.popleft()
    limit = bounded_int_environment("DEEPFACE_REQUESTS_PER_MINUTE", 20, 1, 600)
    if len(_requests) >= limit:
        raise HTTPException(status_code=429, detail={"code": "RATE_LIMITED", "message": "Verification capacity is temporarily unavailable."})
    _requests.append(now)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "alive"}


async def ensure_adapter_initialized() -> Any:
    global _adapter, _model_initialized
    async with _initialization_lock:
        settings = settings_from_environment()
        if _adapter is None:
            _adapter = await asyncio.to_thread(load_deepface)
        if not _model_initialized:
            await asyncio.to_thread(initialize_deepface, _adapter, settings)
            _model_initialized = True
    return _adapter


async def compare_with_capacity(
    adapter: Any,
    id_image: str,
    selfie_image: str,
    settings: Any,
    timeout: int,
) -> dict[str, Any]:
    """Keep capacity reserved until the worker exits, even after a caller timeout."""
    await _semaphore.acquire()
    task = asyncio.create_task(asyncio.to_thread(compare_faces, adapter, id_image, selfie_image, settings))
    done, _pending = await asyncio.wait({task}, timeout=timeout)
    if not done:
        def release_when_finished(completed: asyncio.Task[dict[str, Any]]) -> None:
            try:
                completed.exception()
            except asyncio.CancelledError:
                pass
            finally:
                _semaphore.release()

        task.add_done_callback(release_when_finished)
        raise TimeoutError
    try:
        return task.result()
    finally:
        _semaphore.release()


@app.post("/v1/readiness")
async def readiness(payload: ReadinessRequest, x_visitor_verification_key: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate(x_visitor_verification_key)
    rate_limit()
    global _inference_status, _inference_tested_at, _readiness_error_code
    model_name: str | None = None
    detector: str | None = None
    try:
        settings = settings_from_environment()
        model_name = settings.model_name
        detector = settings.detector_backend
        adapter = await ensure_adapter_initialized()
        if payload.runInference:
            id_path = os.getenv("DEEPFACE_READINESS_ID_IMAGE_PATH", "").strip()
            selfie_path = os.getenv("DEEPFACE_READINESS_SELFIE_IMAGE_PATH", "").strip()
            if not id_path or not selfie_path:
                _inference_status = "NOT_TESTED"
                _readiness_error_code = "READINESS_TEST_IMAGES_NOT_CONFIGURED"
            else:
                id_image, selfie_image = await asyncio.gather(
                    asyncio.to_thread(data_url_from_test_file, id_path),
                    asyncio.to_thread(data_url_from_test_file, selfie_path),
                )
                timeout = bounded_int_environment("DEEPFACE_REQUEST_TIMEOUT_SECONDS", 45, 5, 120)
                result = await compare_with_capacity(adapter, id_image, selfie_image, settings, timeout)
                if result.get("status") in {"MATCH_INDICATED", "MISMATCH_INDICATED"}:
                    _inference_status = "PASSED"
                    _inference_tested_at = datetime.now(timezone.utc).isoformat()
                    _readiness_error_code = None
                else:
                    _inference_status = "FAILED"
                    _readiness_error_code = f"READINESS_{result.get('status', 'INCONCLUSIVE')}"
    except TimeoutError:
        _inference_status = "FAILED"
        _readiness_error_code = "READINESS_INFERENCE_TIMEOUT"
    except VerificationInputError:
        _inference_status = "FAILED"
        _readiness_error_code = "READINESS_TEST_IMAGE_INVALID"
    except Exception as exc:
        _readiness_error_code = "DEEPFACE_MODEL_INITIALIZATION_FAILED"
        print(f"biometric_readiness_failed category={type(exc).__name__}")
    return {
        "status": "ready" if _model_initialized and _inference_status == "PASSED" and enabled() else "not_ready",
        "featureEnabled": enabled(),
        "model": model_name,
        "detector": detector,
        "modelStatus": "INITIALIZED" if _model_initialized else "ERROR" if _readiness_error_code == "DEEPFACE_MODEL_INITIALIZATION_FAILED" else "NOT_INITIALIZED",
        "inferenceStatus": _inference_status,
        "inferenceTestedAt": _inference_tested_at,
        "errorCode": _readiness_error_code,
    }


@app.post("/v1/verify")
async def verify(payload: VerifyRequest, request: Request, x_visitor_verification_key: str | None = Header(default=None)) -> dict[str, Any]:
    del request
    authenticate(x_visitor_verification_key)
    if not enabled():
        raise HTTPException(status_code=503, detail={"code": "BIOMETRIC_FEATURE_DISABLED", "message": "Biometric processing is disabled."})
    rate_limit()
    now = time.monotonic()
    fingerprint = hashlib.sha256(f"{payload.idImage}\0{payload.selfieImage}".encode()).hexdigest()
    cached = _cache.get(payload.requestId)
    if cached and now - cached[0] < 600:
        if not hmac.compare_digest(cached[1], fingerprint):
            raise HTTPException(status_code=409, detail={"code": "REQUEST_ID_REUSE", "message": "The verification request identifier was already used."})
        return cached[2]
    timeout = bounded_int_environment("DEEPFACE_REQUEST_TIMEOUT_SECONDS", 45, 5, 120)
    global _inference_status, _inference_tested_at, _readiness_error_code
    try:
        settings = settings_from_environment()
        adapter = await ensure_adapter_initialized()
        result = await compare_with_capacity(adapter, payload.idImage, payload.selfieImage, settings, timeout)
        if result.get("status") in {"MATCH_INDICATED", "MISMATCH_INDICATED"}:
            _inference_status = "PASSED"
            _inference_tested_at = datetime.now(timezone.utc).isoformat()
            _readiness_error_code = None
    except VerificationInputError as exc:
        raise HTTPException(status_code=422, detail={"code": "INVALID_IMAGE", "message": str(exc)}) from exc
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail={"code": "VERIFICATION_TIMEOUT", "message": "Facial comparison timed out; use manual verification."}) from exc
    except HTTPException:
        raise
    except Exception as exc:
        # Deliberately do not log request bodies or model internals containing identity data.
        print(f"facial_comparison_failed category={type(exc).__name__}")
        result = {
            "status": "PROCESSING_FAILED", "provider": "DEEPFACE", "model": None,
            "detector": None, "distance": None, "threshold": None,
            "antiSpoofingStatus": "INCONCLUSIVE", "manualReviewRequired": True,
        }
    _cache[payload.requestId] = (now, fingerprint, result)
    while len(_cache) > 500:
        _cache.popitem(last=False)
    return result
