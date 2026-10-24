from __future__ import annotations

import base64
import binascii
import os
import tempfile
from io import BytesIO
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from PIL import Image, ImageStat, UnidentifiedImageError

ALLOWED_MIME = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 25_000_000
SUPPORTED_MODELS = {"VGG-Face", "Facenet", "Facenet512", "ArcFace", "SFace"}
SUPPORTED_DETECTORS = {"opencv", "retinaface", "mtcnn", "fastmtcnn", "yunet", "centerface", "ssd"}


class VerificationInputError(ValueError):
    pass


class DeepFaceAdapter(Protocol):
    def build_model(self, model_name: str) -> Any: ...
    def extract_faces(self, **kwargs: Any) -> list[dict[str, Any]]: ...
    def verify(self, **kwargs: Any) -> dict[str, Any]: ...


@dataclass(frozen=True)
class VerificationSettings:
    model_name: str = "Facenet512"
    detector_backend: str = "retinaface"
    anti_spoofing: bool = False


def decode_data_url(value: str) -> tuple[bytes, str]:
    if not value.startswith("data:") or ";base64," not in value:
        raise VerificationInputError("Only base64 image data URLs are accepted.")
    header, encoded = value.split(",", 1)
    mime = header[5:].split(";", 1)[0].lower()
    if mime not in ALLOWED_MIME:
        raise VerificationInputError("Unsupported image media type.")
    if len(encoded) > ((MAX_IMAGE_BYTES * 4) // 3) + 8:
        raise VerificationInputError("Image exceeds the 5 MB limit.")
    try:
        decoded = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise VerificationInputError("Invalid base64 image.") from exc
    if not decoded or len(decoded) > MAX_IMAGE_BYTES:
        raise VerificationInputError("Image is empty or exceeds the 5 MB limit.")
    signatures = {
        "image/jpeg": decoded.startswith(b"\xff\xd8\xff"),
        "image/png": decoded.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": decoded.startswith(b"RIFF") and decoded[8:12] == b"WEBP",
    }
    if not signatures[mime]:
        raise VerificationInputError("Image bytes do not match the declared media type.")
    try:
        with Image.open(BytesIO(decoded)) as image:
            image.load()
            width, height = image.size
            if width < 80 or height < 80:
                raise VerificationInputError("Image dimensions are too small for facial screening.")
            if width * height > MAX_IMAGE_PIXELS:
                raise VerificationInputError("Image dimensions exceed the processing limit.")
            grayscale = image.convert("L")
            mean = ImageStat.Stat(grayscale).mean[0]
            extrema = grayscale.getextrema()
            if mean < 5 or mean > 250 or extrema[1] - extrema[0] < 8:
                raise VerificationInputError("Image quality or lighting is unsuitable for facial screening.")
    except VerificationInputError:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise VerificationInputError("Image data could not be decoded safely.") from exc
    return decoded, ALLOWED_MIME[mime]


def data_url_from_test_file(path_value: str) -> str:
    path = Path(path_value).expanduser().resolve()
    if not path.is_file():
        raise VerificationInputError("Configured readiness test image is unavailable.")
    suffix = path.suffix.lower()
    mime = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}.get(suffix)
    if not mime:
        raise VerificationInputError("Configured readiness test image has an unsupported media type.")
    content = path.read_bytes()
    if not content or len(content) > MAX_IMAGE_BYTES:
        raise VerificationInputError("Configured readiness test image exceeds the size limit.")
    value = f"data:{mime};base64,{base64.b64encode(content).decode('ascii')}"
    decode_data_url(value)
    return value


def _face_count(adapter: DeepFaceAdapter, path: Path, settings: VerificationSettings) -> tuple[int, str]:
    try:
        faces = adapter.extract_faces(
            img_path=str(path),
            detector_backend=settings.detector_backend,
            enforce_detection=True,
            align=True,
            anti_spoofing=settings.anti_spoofing,
        )
    except ValueError as exc:
        if "face" in str(exc).lower() and ("detect" in str(exc).lower() or "found" in str(exc).lower()):
            return 0, "INCONCLUSIVE" if settings.anti_spoofing else "NOT_PERFORMED"
        raise
    anti_status = "NOT_PERFORMED"
    if settings.anti_spoofing:
        flags = [face.get("is_real") for face in faces if "is_real" in face]
        if flags and all(flag is True for flag in flags):
            anti_status = "REAL_INDICATED"
        elif any(flag is False for flag in flags):
            anti_status = "SPOOF_INDICATED"
        else:
            anti_status = "INCONCLUSIVE"
    return len(faces), anti_status


def compare_faces(
    adapter: DeepFaceAdapter,
    id_data_url: str,
    selfie_data_url: str,
    settings: VerificationSettings,
) -> dict[str, Any]:
    id_bytes, id_suffix = decode_data_url(id_data_url)
    selfie_bytes, selfie_suffix = decode_data_url(selfie_data_url)
    with tempfile.TemporaryDirectory(prefix="hirna-visitor-") as temporary:
        directory = Path(temporary)
        id_path = directory / f"id{id_suffix}"
        selfie_path = directory / f"selfie{selfie_suffix}"
        id_path.write_bytes(id_bytes)
        selfie_path.write_bytes(selfie_bytes)
        try:
            id_faces, id_anti = _face_count(adapter, id_path, settings)
            selfie_faces, selfie_anti = _face_count(adapter, selfie_path, settings)
            if id_faces == 0 or selfie_faces == 0:
                status = "NO_FACE_DETECTED"
                result: dict[str, Any] = {}
            elif id_faces > 1 or selfie_faces > 1:
                status = "MULTIPLE_FACES_DETECTED"
                result = {}
            elif "SPOOF_INDICATED" in (id_anti, selfie_anti):
                status = "INCONCLUSIVE"
                result = {}
            else:
                result = adapter.verify(
                    img1_path=str(id_path),
                    img2_path=str(selfie_path),
                    model_name=settings.model_name,
                    detector_backend=settings.detector_backend,
                    enforce_detection=True,
                    align=True,
                    anti_spoofing=settings.anti_spoofing,
                )
                verified = result.get("verified")
                status = "MATCH_INDICATED" if verified is True else "MISMATCH_INDICATED" if verified is False else "INCONCLUSIVE"
            anti_status = "SPOOF_INDICATED" if "SPOOF_INDICATED" in (id_anti, selfie_anti) else (
                "REAL_INDICATED" if id_anti == selfie_anti == "REAL_INDICATED" else "NOT_PERFORMED" if not settings.anti_spoofing else "INCONCLUSIVE"
            )
            distance = result.get("distance")
            threshold = result.get("threshold")
            return {
                "status": status,
                "provider": "DEEPFACE",
                "model": settings.model_name,
                "detector": settings.detector_backend,
                "distance": float(distance) if isinstance(distance, (int, float)) else None,
                "threshold": float(threshold) if isinstance(threshold, (int, float)) else None,
                "antiSpoofingStatus": anti_status,
                "manualReviewRequired": True,
            }
        finally:
            # TemporaryDirectory also removes the directory; explicit unlink narrows
            # the lifetime even if cleanup later encounters an unrelated exception.
            for path in (id_path, selfie_path):
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    pass


def load_deepface() -> DeepFaceAdapter:
    # Lazy loading keeps process startup/health checks independent of model load.
    from deepface import DeepFace  # type: ignore
    return DeepFace


def initialize_deepface(adapter: DeepFaceAdapter, settings: VerificationSettings) -> None:
    adapter.build_model(model_name=settings.model_name)


def settings_from_environment() -> VerificationSettings:
    model_name = os.getenv("DEEPFACE_MODEL", "Facenet512").strip() or "Facenet512"
    detector_backend = os.getenv("DEEPFACE_DETECTOR", "retinaface").strip().lower() or "retinaface"
    if model_name not in SUPPORTED_MODELS:
        raise RuntimeError("Unsupported DeepFace model configuration.")
    if detector_backend not in SUPPORTED_DETECTORS:
        raise RuntimeError("Unsupported DeepFace detector configuration.")
    return VerificationSettings(
        model_name=model_name,
        detector_backend=detector_backend,
        anti_spoofing=os.getenv("DEEPFACE_ANTI_SPOOFING", "false").lower() == "true",
    )
