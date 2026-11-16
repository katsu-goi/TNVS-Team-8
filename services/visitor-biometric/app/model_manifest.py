from __future__ import annotations

import hashlib
import os
import urllib.request
from dataclasses import dataclass
from pathlib import Path


APPROVED_MODEL_PROFILE = "opencv-sface-yunet-2021dec-2023mar"


@dataclass(frozen=True)
class ModelArtifact:
    role: str
    filename: str
    source: str
    license_id: str
    bytes: int
    sha256: str


# These identifiers are the immutable Git LFS object IDs published by OpenCV
# Zoo for the exact files DeepFace downloads. They are deliberately checked at
# image-build and process-initialization time; a changed upstream file fails
# closed instead of changing the screening model without review.
APPROVED_ARTIFACTS = (
    ModelArtifact(
        role="recognizer",
        filename="face_recognition_sface_2021dec.onnx",
        source="https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
        license_id="Apache-2.0",
        bytes=38_696_353,
        sha256="0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
    ),
    ModelArtifact(
        role="detector",
        filename="face_detection_yunet_2023mar.onnx",
        source="https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
        license_id="MIT",
        bytes=232_589,
        sha256="8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
    ),
)

MODEL_LICENSES = (
    (
        "SFace-APACHE-2.0.txt",
        "https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/face_recognition_sface/LICENSE",
        11_358,
        "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
    ),
    (
        "YuNet-MIT.txt",
        "https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/face_detection_yunet/LICENSE",
        1_085,
        "c83b8120c50ccbd4c4f96edf53141bdd566ebb8f8e9227e415326aa1b1aba958",
    ),
)


def deepface_home() -> Path:
    """Return DeepFace's effective .deepface directory.

    DeepFace 0.0.103 treats DEEPFACE_HOME as the parent directory and appends
    ``.deepface`` itself. Keep manifest validation on the identical path so a
    Vercel runtime HOME override cannot redirect model loading.
    """
    configured = os.getenv("DEEPFACE_HOME", "").strip()
    parent = Path(configured).resolve() if configured else Path.home().resolve()
    return (parent / ".deepface").resolve()


def require_approved_profile() -> str:
    profile = os.getenv("DEEPFACE_MODEL_PROFILE", "").strip()
    model = os.getenv("DEEPFACE_MODEL", "").strip()
    detector = os.getenv("DEEPFACE_DETECTOR", "").strip().lower()
    if profile != APPROVED_MODEL_PROFILE:
        raise RuntimeError("An explicitly reviewed biometric model profile is required.")
    if model != "SFace" or detector != "yunet":
        raise RuntimeError("The configured model and detector do not match the reviewed profile.")
    return profile


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_model_artifacts() -> list[dict[str, str | int]]:
    require_approved_profile()
    weights_root = deepface_home() / "weights"
    approved_filenames = {artifact.filename for artifact in APPROVED_ARTIFACTS}
    present_files = [path for path in weights_root.rglob("*") if path.is_file()] if weights_root.is_dir() else []
    if any(path.name not in approved_filenames for path in present_files):
        raise RuntimeError("An unapproved biometric model artifact is present.")
    results: list[dict[str, str | int]] = []
    for artifact in APPROVED_ARTIFACTS:
        matches = list(weights_root.rglob(artifact.filename)) if weights_root.is_dir() else []
        if len(matches) != 1:
            raise RuntimeError(f"Expected exactly one {artifact.role} model artifact.")
        path = matches[0]
        if not os.access(path, os.R_OK):
            raise RuntimeError(f"The {artifact.role} model artifact is not readable by the runtime user.")
        actual_bytes = path.stat().st_size
        actual_sha256 = _sha256(path)
        if actual_bytes != artifact.bytes or actual_sha256 != artifact.sha256:
            raise RuntimeError(f"The {artifact.role} model artifact failed its integrity check.")
        results.append({
            "role": artifact.role,
            "filename": artifact.filename,
            "license": artifact.license_id,
            "bytes": actual_bytes,
            "sha256": actual_sha256,
        })
    return results


def install_model_license_notices(destination: Path) -> list[dict[str, str | int]]:
    destination.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, str | int]] = []
    for filename, source, expected_bytes, expected_sha256 in MODEL_LICENSES:
        with urllib.request.urlopen(source, timeout=30) as response:
            content = response.read(20_001)
        if len(content) != expected_bytes or hashlib.sha256(content).hexdigest() != expected_sha256:
            raise RuntimeError(f"The {filename} model license notice failed its integrity check.")
        target = destination / filename
        target.write_bytes(content)
        results.append({"filename": filename, "bytes": len(content), "sha256": expected_sha256})
    return results
