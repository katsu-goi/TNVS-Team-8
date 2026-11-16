"""Authenticated, opt-in Vercel staging probe. Never enables biometrics."""

from __future__ import annotations

import json
import os
import statistics
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from typing import Any


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def request_json(url: str, body: dict[str, Any], headers: dict[str, str]) -> tuple[int, dict[str, Any], int]:
    started = time.monotonic()
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        method="POST",
        headers={"Content-Type": "application/json", **headers},
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            status = response.status
            payload = json.loads(response.read(256 * 1024))
    except urllib.error.HTTPError as error:
        status = error.code
        payload = json.loads(error.read(256 * 1024))
    return status, payload, round((time.monotonic() - started) * 1000)


def readiness_body(run_inference: bool) -> dict[str, Any]:
    body: dict[str, Any] = {"runInference": run_inference}
    if run_inference:
        id_url = required("STAGING_ID_SIGNED_URL")
        selfie_url = required("STAGING_SELFIE_SIGNED_URL")
        body.update({
            "idImageReference": {"signedUrl": id_url},
            "selfieImageReference": {"signedUrl": selfie_url},
        })
    return body


def main() -> None:
    base_url = required("BIOMETRIC_STAGING_URL").rstrip("/")
    service_key = required("VISITOR_BIOMETRIC_SERVICE_KEY")
    bypass = os.getenv("VISITOR_BIOMETRIC_VERCEL_BYPASS_SECRET", "").strip()
    headers = {"X-Visitor-Verification-Key": service_key}
    if bypass:
        headers["x-vercel-protection-bypass"] = bypass

    unauthorized_status, _, _ = request_json(f"{base_url}/v1/readiness", {"runInference": False}, {})
    if unauthorized_status != 401:
        raise SystemExit(f"Unauthenticated readiness expected 401, received {unauthorized_status}")

    run_inference = os.getenv("DEEPFACE_RUN_REAL_INFERENCE_TEST", "false").lower() == "true"
    attempts = max(1, min(10, int(os.getenv("STAGING_PROBE_REQUESTS", "2"))))
    concurrency = max(1, min(4, int(os.getenv("STAGING_PROBE_CONCURRENCY", "1"))))
    body = readiness_body(run_inference)
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        results = list(executor.map(
            lambda _: request_json(f"{base_url}/v1/readiness", body, headers),
            range(attempts),
        ))

    statuses = [status for status, _, _ in results]
    if any(status != 200 for status in statuses):
        raise SystemExit(f"Authenticated readiness failed with HTTP statuses: {statuses}")
    payloads = [payload for _, payload, _ in results]
    durations = [duration for _, _, duration in results]
    safe_report = {
        "requests": attempts,
        "concurrency": concurrency,
        "httpMilliseconds": {
            "min": min(durations),
            "median": round(statistics.median(durations)),
            "max": max(durations),
        },
        "modelProfile": payloads[-1].get("modelProfile"),
        "modelStatus": payloads[-1].get("modelStatus"),
        "inferenceStatus": payloads[-1].get("inferenceStatus"),
        "inferenceOutcome": payloads[-1].get("inferenceOutcome"),
        "featureEnabled": payloads[-1].get("featureEnabled"),
        "coldStartObserved": any(payload.get("coldStart") is True for payload in payloads),
        "modelInitializationMilliseconds": payloads[-1].get("modelInitializationMilliseconds"),
        "inferenceDurationMilliseconds": payloads[-1].get("inferenceDurationMilliseconds"),
        "peakResidentMemoryBytes": payloads[-1].get("peakResidentMemoryBytes"),
    }
    if safe_report["featureEnabled"] is not False:
        raise SystemExit("Safety failure: the Vercel staging biometric flag must remain false.")
    print(json.dumps(safe_report, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
