from __future__ import annotations

import asyncio
import hmac
import os
import time
from collections import OrderedDict, deque
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from .verifier import VerificationInputError, compare_faces, load_deepface, settings_from_environment

app = FastAPI(title="HIRNA Visitor Biometric Screening", docs_url=None, redoc_url=None, openapi_url=None)
_semaphore = asyncio.Semaphore(max(1, int(os.getenv("DEEPFACE_MAX_CONCURRENCY", "1"))))
_requests: deque[float] = deque()
_cache: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()
_adapter: Any | None = None


class VerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    requestId: str = Field(pattern=r"^[0-9a-fA-F-]{36}$")
    idImage: str = Field(min_length=32)
    selfieImage: str = Field(min_length=32)


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
    limit = max(1, int(os.getenv("DEEPFACE_REQUESTS_PER_MINUTE", "20")))
    if len(_requests) >= limit:
        raise HTTPException(status_code=429, detail={"code": "RATE_LIMITED", "message": "Verification capacity is temporarily unavailable."})
    _requests.append(now)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ready" if enabled() else "disabled"}


@app.post("/v1/verify")
async def verify(payload: VerifyRequest, request: Request, x_visitor_verification_key: str | None = Header(default=None)) -> dict[str, Any]:
    del request
    authenticate(x_visitor_verification_key)
    if not enabled():
        raise HTTPException(status_code=503, detail={"code": "BIOMETRIC_FEATURE_DISABLED", "message": "Biometric processing is disabled."})
    rate_limit()
    now = time.monotonic()
    cached = _cache.get(payload.requestId)
    if cached and now - cached[0] < 600:
        return cached[1]
    timeout = max(5, min(120, int(os.getenv("DEEPFACE_REQUEST_TIMEOUT_SECONDS", "45"))))
    global _adapter
    try:
        async with _semaphore:
            if _adapter is None:
                _adapter = await asyncio.to_thread(load_deepface)
            result = await asyncio.wait_for(
                asyncio.to_thread(compare_faces, _adapter, payload.idImage, payload.selfieImage, settings_from_environment()),
                timeout=timeout,
            )
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
            "status": "PROCESSING_FAILED", "provider": "DEEPFACE", "model": settings_from_environment().model_name,
            "detector": settings_from_environment().detector_backend, "distance": None, "threshold": None,
            "antiSpoofingStatus": "INCONCLUSIVE", "manualReviewRequired": True,
        }
    _cache[payload.requestId] = (now, result)
    while len(_cache) > 500:
        _cache.popitem(last=False)
    return result
